import crypto from 'node:crypto';
import {
  BetStatus,
  BetType,
  Prisma,
  PrismaClient,
  RoundStatus,
  WalletTxnType,
} from '@prisma/client';
import type { Server } from 'socket.io';
import { config } from '../../core/config.js';

interface ActiveAutoBet {
  betId: string;
  userId: string;
  targetMultiplier: number;
}

interface ActiveRound {
  roundId: string;
  roundNumber: number;
  hash: string;
  seed: string;
  crashPoint: number;
  bettingEndsAt: string;
  takeoffAt: number | null;
  crashed: boolean;
  autoCashouts: ActiveAutoBet[];
}

interface PlaceBetInput {
  amount: number;
  betType: 'manual' | 'auto_cashout';
  autoCashoutAt?: number | null;
}

interface CashoutResult {
  betId: string;
  payout: number;
  multiplier: number;
  balance: number;
}

const OPEN_STATUSES: RoundStatus[] = [
  RoundStatus.WAITING,
  RoundStatus.BETTING,
  RoundStatus.LOCKED,
  RoundStatus.PLAYING,
  RoundStatus.RESULT,
];

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(round2(value).toFixed(2));
}

export class AviatorEngine {
  private activeRound: ActiveRound | null = null;
  private nextRoundTimer: NodeJS.Timeout | null = null;
  private lockTimer: NodeJS.Timeout | null = null;
  private flightTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly io: Server,
  ) {}

  async start(): Promise<void> {
    await this.recoverStaleRounds();
    await this.scheduleNextRound(800);
  }

  async stop(): Promise<void> {
    if (this.nextRoundTimer) clearTimeout(this.nextRoundTimer);
    if (this.lockTimer) clearTimeout(this.lockTimer);
    if (this.flightTimer) clearInterval(this.flightTimer);
  }

  async getCurrentRoundView(userId?: string) {
    const round = await this.prisma.aviatorRound.findFirst({
      where: { status: { in: OPEN_STATUSES } },
      orderBy: { roundNumber: 'desc' },
    });
    if (!round) {
      return { round: null, userBets: [] };
    }

    const userBets = userId
      ? await this.prisma.aviatorBet.findMany({
          where: { roundId: round.id, userId },
          orderBy: { placedAt: 'asc' },
        })
      : [];

    const currentMultiplier =
      this.activeRound &&
      this.activeRound.roundId === round.id &&
      this.activeRound.takeoffAt &&
      !this.activeRound.crashed
        ? round2(this.multiplierAt(Date.now() - this.activeRound.takeoffAt))
        : null;

    return {
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        status: round.status,
        bettingEndAt: round.bettingEndAt.toISOString(),
        crashPoint: round.status === RoundStatus.SETTLED ? toNumber(round.crashPoint) : null,
        hash: round.hash,
        currentMultiplier,
      },
      userBets: userBets.map((b) => ({
        id: b.id,
        amount: toNumber(b.amount),
        betType: b.betType,
        autoCashoutAt: b.autoCashoutAt ? toNumber(b.autoCashoutAt) : null,
        status: b.status,
        payout: b.payout ? toNumber(b.payout) : 0,
        cashoutMultiplier: b.cashoutMultiplier ? toNumber(b.cashoutMultiplier) : null,
      })),
    };
  }

  async listRoundHistory(limit: number) {
    const rounds = await this.prisma.aviatorRound.findMany({
      where: { status: { in: [RoundStatus.SETTLED, RoundStatus.CANCELLED] } },
      orderBy: { roundNumber: 'desc' },
      take: limit,
      select: {
        id: true,
        roundNumber: true,
        status: true,
        crashPoint: true,
        totalBets: true,
        totalBetAmount: true,
        totalPayout: true,
        createdAt: true,
        settledAt: true,
      },
    });

    return rounds.map((round) => ({
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      crashPoint: toNumber(round.crashPoint),
      totalBets: round.totalBets,
      totalBetAmount: toNumber(round.totalBetAmount),
      totalPayout: toNumber(round.totalPayout),
      createdAt: round.createdAt.toISOString(),
      settledAt: round.settledAt?.toISOString() || null,
    }));
  }

  async placeBet(userId: string, input: PlaceBetInput) {
    const round = await this.prisma.aviatorRound.findFirst({
      where: { status: RoundStatus.BETTING },
      orderBy: { roundNumber: 'desc' },
    });

    if (!round) {
      throw new Error('No betting round is active');
    }
    if (new Date() > round.bettingEndAt) {
      throw new Error('Betting window already closed');
    }
    if (input.amount < config.minBet) {
      throw new Error(`Minimum bet is ${config.minBet}`);
    }
    if (input.amount > config.maxBet) {
      throw new Error(`Maximum bet is ${config.maxBet}`);
    }
    if (input.betType === 'auto_cashout') {
      if (input.autoCashoutAt === null || input.autoCashoutAt === undefined) {
        throw new Error('autoCashoutAt is required for auto cashout bet');
      }
      if (input.autoCashoutAt < 1.01 || input.autoCashoutAt > 100) {
        throw new Error('autoCashoutAt must be between 1.01 and 100');
      }
    }

    const potentialPayout =
      input.betType === 'auto_cashout' && input.autoCashoutAt
        ? round2(input.amount * input.autoCashoutAt)
        : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { userId } });
      if (!user) throw new Error('User not found');

      const balanceBefore = toNumber(user.balance);
      if (balanceBefore < input.amount) {
        throw new Error('Insufficient wallet balance');
      }
      const balanceAfter = round2(balanceBefore - input.amount);

      const bet = await tx.aviatorBet.create({
        data: {
          roundId: round.id,
          userId,
          amount: decimal(input.amount),
          betType: input.betType === 'auto_cashout' ? BetType.auto_cashout : BetType.manual,
          autoCashoutAt:
            input.betType === 'auto_cashout' && input.autoCashoutAt
              ? decimal(input.autoCashoutAt)
              : null,
          potentialPayout: potentialPayout ? decimal(potentialPayout) : null,
        },
      });

      await tx.user.update({
        where: { userId },
        data: { balance: decimal(balanceAfter) },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          betId: bet.id,
          type: WalletTxnType.BET_DEBIT,
          amount: decimal(input.amount),
          balanceBefore: decimal(balanceBefore),
          balanceAfter: decimal(balanceAfter),
          payload: {
            roundId: round.id,
            roundNumber: round.roundNumber,
            betType: input.betType,
          },
        },
      });

      await tx.aviatorRound.update({
        where: { id: round.id },
        data: {
          totalBets: { increment: 1 },
          totalBetAmount: { increment: decimal(input.amount) },
        },
      });

      return {
        betId: bet.id,
        roundId: round.id,
        roundNumber: round.roundNumber,
        amount: input.amount,
        betType: input.betType,
        autoCashoutAt: input.autoCashoutAt || null,
        potentialPayout,
        balanceAfter,
      };
    });

    this.emitToRoom('bet:placed', {
      roundId: result.roundId,
      roundNumber: result.roundNumber,
      userId,
      betId: result.betId,
      amount: result.amount,
      betType: result.betType,
    });

    this.emitToUserWallet(userId, result.balanceAfter);

    return result;
  }

  async cashout(userId: string, betId: string, source: 'manual' | 'auto' = 'manual'): Promise<CashoutResult> {
    const runtime = this.activeRound;
    if (!runtime || !runtime.takeoffAt || runtime.crashed) {
      throw new Error('No active flight to cash out');
    }

    const elapsed = Date.now() - runtime.takeoffAt;
    const currentMultiplier = round2(this.multiplierAt(elapsed));
    if (currentMultiplier >= runtime.crashPoint) {
      throw new Error('Cashout window already closed');
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      const bet = await tx.aviatorBet.findUnique({ where: { id: betId } });
      if (!bet || bet.userId !== userId) {
        throw new Error('Bet not found');
      }
      if (bet.roundId !== runtime.roundId) {
        throw new Error('Bet is not in the active round');
      }

      if (bet.status === BetStatus.WON) {
        const user = await tx.user.findUnique({ where: { userId } });
        if (!user) throw new Error('User not found');
        return {
          alreadySettled: true,
          payout: toNumber(bet.payout),
          multiplier: toNumber(bet.cashoutMultiplier),
          balance: toNumber(user.balance),
          roundId: bet.roundId,
        };
      }
      if (bet.status !== BetStatus.PLACED) {
        throw new Error('Bet is no longer eligible for cashout');
      }

      const amount = toNumber(bet.amount);
      const payout = round2(amount * currentMultiplier);

      const updated = await tx.aviatorBet.updateMany({
        where: { id: bet.id, status: BetStatus.PLACED },
        data: {
          status: BetStatus.WON,
          payout: decimal(payout),
          cashoutMultiplier: decimal(currentMultiplier),
          settledAt: new Date(),
        },
      });

      if (updated.count === 0) {
        throw new Error('Bet already settled');
      }

      const user = await tx.user.findUnique({ where: { userId } });
      if (!user) throw new Error('User not found');
      const balanceBefore = toNumber(user.balance);
      const balanceAfter = round2(balanceBefore + payout);

      await tx.user.update({
        where: { userId },
        data: { balance: decimal(balanceAfter) },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          betId: bet.id,
          type: WalletTxnType.BET_CASHOUT,
          amount: decimal(payout),
          balanceBefore: decimal(balanceBefore),
          balanceAfter: decimal(balanceAfter),
          payload: {
            roundId: bet.roundId,
            source,
            multiplier: currentMultiplier,
          },
        },
      });

      await tx.aviatorRound.update({
        where: { id: bet.roundId },
        data: {
          totalPayout: { increment: decimal(payout) },
        },
      });

      return {
        alreadySettled: false,
        payout,
        multiplier: currentMultiplier,
        balance: balanceAfter,
        roundId: bet.roundId,
      };
    });

    if (this.activeRound?.roundId === txResult.roundId) {
      this.activeRound.autoCashouts = this.activeRound.autoCashouts.filter((b) => b.betId !== betId);
    }

    this.emitToRoom('aviator:cashout', {
      userId,
      betId,
      payout: txResult.payout,
      multiplier: txResult.multiplier,
      alreadySettled: txResult.alreadySettled,
    });
    this.emitToUserWallet(userId, txResult.balance);

    return {
      betId,
      payout: txResult.payout,
      multiplier: txResult.multiplier,
      balance: txResult.balance,
    };
  }

  async listUserBets(userId: string, limit: number, roundId?: string) {
    const bets = await this.prisma.aviatorBet.findMany({
      where: {
        userId,
        ...(roundId ? { roundId } : {}),
      },
      orderBy: { placedAt: 'desc' },
      take: limit,
    });

    return bets.map((b) => ({
      id: b.id,
      roundId: b.roundId,
      amount: toNumber(b.amount),
      betType: b.betType,
      autoCashoutAt: b.autoCashoutAt ? toNumber(b.autoCashoutAt) : null,
      status: b.status,
      payout: b.payout ? toNumber(b.payout) : 0,
      cashoutMultiplier: b.cashoutMultiplier ? toNumber(b.cashoutMultiplier) : null,
      placedAt: b.placedAt.toISOString(),
      settledAt: b.settledAt?.toISOString() || null,
    }));
  }

  async getWallet(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { userId } });
    if (!user) throw new Error('User not found');
    return {
      userId: user.userId,
      balance: toNumber(user.balance),
    };
  }

  async listWalletTransactions(userId: string, limit: number) {
    const txns = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return txns.map((t) => ({
      id: t.id,
      type: t.type,
      amount: toNumber(t.amount),
      balanceBefore: toNumber(t.balanceBefore),
      balanceAfter: toNumber(t.balanceAfter),
      payload: t.payload,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  private async recoverStaleRounds(): Promise<void> {
    const stale = await this.prisma.aviatorRound.findMany({
      where: {
        status: { in: [RoundStatus.BETTING, RoundStatus.LOCKED, RoundStatus.PLAYING, RoundStatus.RESULT] },
      },
      orderBy: { roundNumber: 'asc' },
    });

    for (const round of stale) {
      const pendingBets = await this.prisma.aviatorBet.findMany({
        where: { roundId: round.id, status: BetStatus.PLACED },
      });

      let refunded = 0;
      await this.prisma.$transaction(async (tx) => {
        for (const bet of pendingBets) {
          const user = await tx.user.findUnique({ where: { userId: bet.userId } });
          if (!user) continue;

          const amount = toNumber(bet.amount);
          const balanceBefore = toNumber(user.balance);
          const balanceAfter = round2(balanceBefore + amount);
          refunded += amount;

          await tx.user.update({
            where: { userId: bet.userId },
            data: { balance: decimal(balanceAfter) },
          });
          await tx.walletTransaction.create({
            data: {
              userId: bet.userId,
              betId: bet.id,
              type: WalletTxnType.BET_REFUND,
              amount: decimal(amount),
              balanceBefore: decimal(balanceBefore),
              balanceAfter: decimal(balanceAfter),
              payload: {
                reason: 'Round recovery refund',
                roundId: round.id,
              },
            },
          });
          await tx.aviatorBet.update({
            where: { id: bet.id },
            data: {
              status: BetStatus.CANCELLED,
              payout: decimal(amount),
              cashoutMultiplier: decimal(1),
              settledAt: new Date(),
            },
          });
        }

        await tx.aviatorRound.update({
          where: { id: round.id },
          data: {
            status: RoundStatus.CANCELLED,
            settledAt: new Date(),
            totalPayout: decimal(refunded),
            result: {
              reason: 'Recovered from stale server state',
              recoveredAt: new Date().toISOString(),
            },
          },
        });
      });
    }
  }

  private generateRoundSeed() {
    const seed = crypto.randomBytes(20).toString('hex');
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const rand = Math.random() * 100;
    let crashPoint = 1.0;
    if (rand >= 3) {
      crashPoint = Math.max(1.0, Math.floor((10000 / (100 - rand))) / 100);
    }
    crashPoint = Math.min(crashPoint, 100);
    return { seed, hash, crashPoint: round2(crashPoint) };
  }

  private async scheduleNextRound(delayMs: number): Promise<void> {
    if (this.nextRoundTimer) clearTimeout(this.nextRoundTimer);
    this.nextRoundTimer = setTimeout(() => {
      void this.safeStartRound();
    }, delayMs);
  }

  private async safeStartRound(): Promise<void> {
    try {
      await this.startRound();
    } catch (error) {
      // Retry loop keeps service alive even if one round fails.
      // eslint-disable-next-line no-console
      console.error('Aviator round start failed:', error);
      await this.scheduleNextRound(2000);
    }
  }

  private async startRound(): Promise<void> {
    const lastRound = await this.prisma.aviatorRound.findFirst({
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    const roundNumber = (lastRound?.roundNumber || 0) + 1;
    const generated = this.generateRoundSeed();
    const now = new Date();
    const bettingEnd = new Date(now.getTime() + config.bettingWindowSeconds * 1000);

    const round = await this.prisma.aviatorRound.create({
      data: {
        roundNumber,
        status: RoundStatus.BETTING,
        hash: generated.hash,
        seed: generated.seed,
        crashPoint: decimal(generated.crashPoint),
        bettingStartAt: now,
        bettingEndAt: bettingEnd,
      },
    });

    this.activeRound = {
      roundId: round.id,
      roundNumber: round.roundNumber,
      hash: round.hash,
      seed: round.seed,
      crashPoint: toNumber(round.crashPoint),
      bettingEndsAt: round.bettingEndAt.toISOString(),
      takeoffAt: null,
      crashed: false,
      autoCashouts: [],
    };

    this.emitToRoom('round:created', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      hash: round.hash,
      bettingEndsAt: round.bettingEndAt.toISOString(),
    });

    if (this.lockTimer) clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => {
      void this.lockRound(round.id);
    }, config.bettingWindowSeconds * 1000);
  }

  private async lockRound(roundId: string): Promise<void> {
    if (!this.activeRound || this.activeRound.roundId !== roundId) return;

    await this.prisma.aviatorRound.update({
      where: { id: roundId },
      data: {
        status: RoundStatus.LOCKED,
        lockedAt: new Date(),
      },
    });

    this.emitToRoom('round:locked', {
      roundId,
      message: 'Bets locked. Prepare for takeoff.',
    });

    setTimeout(() => {
      void this.startFlight(roundId);
    }, config.lockSeconds * 1000);
  }

  private async startFlight(roundId: string): Promise<void> {
    if (!this.activeRound || this.activeRound.roundId !== roundId) return;

    await this.prisma.aviatorRound.update({
      where: { id: roundId },
      data: {
        status: RoundStatus.PLAYING,
        takeoffAt: new Date(),
      },
    });

    const autoBets = await this.prisma.aviatorBet.findMany({
      where: {
        roundId,
        status: BetStatus.PLACED,
        autoCashoutAt: { not: null },
      },
      orderBy: { autoCashoutAt: 'asc' },
      select: {
        id: true,
        userId: true,
        autoCashoutAt: true,
      },
    });

    this.activeRound.takeoffAt = Date.now();
    this.activeRound.autoCashouts = autoBets
      .map((b) => ({
        betId: b.id,
        userId: b.userId,
        targetMultiplier: toNumber(b.autoCashoutAt),
      }))
      .sort((a, b) => a.targetMultiplier - b.targetMultiplier);

    this.emitToRoom('aviator:takeoff', {
      roundId,
      roundNumber: this.activeRound.roundNumber,
      message: 'Takeoff',
    });

    if (this.flightTimer) clearInterval(this.flightTimer);
    this.flightTimer = setInterval(() => {
      void this.processFlightTick();
    }, config.multiplierTickMs);
  }

  private async processFlightTick(): Promise<void> {
    const runtime = this.activeRound;
    if (!runtime || !runtime.takeoffAt || runtime.crashed) return;

    const elapsed = Date.now() - runtime.takeoffAt;
    const multiplier = round2(this.multiplierAt(elapsed));

    while (runtime.autoCashouts.length > 0 && runtime.autoCashouts[0].targetMultiplier <= multiplier) {
      const next = runtime.autoCashouts.shift();
      if (!next) break;
      try {
        await this.cashout(next.userId, next.betId, 'auto');
      } catch {
        // Bet might already be settled manually or be invalid now.
      }
    }

    if (multiplier >= runtime.crashPoint) {
      await this.crashAndSettle(runtime);
      return;
    }

    this.emitToRoom('aviator:multiplier', {
      roundId: runtime.roundId,
      roundNumber: runtime.roundNumber,
      elapsed,
      multiplier,
    });
  }

  private async crashAndSettle(runtime: ActiveRound): Promise<void> {
    runtime.crashed = true;
    if (this.flightTimer) {
      clearInterval(this.flightTimer);
      this.flightTimer = null;
    }

    const crashAt = new Date();
    const crashResult = {
      crashPoint: runtime.crashPoint,
      hash: runtime.hash,
      seed: runtime.seed,
      crashedAt: crashAt.toISOString(),
    };

    await this.prisma.aviatorRound.update({
      where: { id: runtime.roundId },
      data: {
        status: RoundStatus.RESULT,
        crashedAt: crashAt,
        result: crashResult,
      },
    });

    this.emitToRoom('aviator:crash', {
      roundId: runtime.roundId,
      roundNumber: runtime.roundNumber,
      crashPoint: runtime.crashPoint,
      seed: runtime.seed,
    });

    await this.prisma.aviatorBet.updateMany({
      where: {
        roundId: runtime.roundId,
        status: BetStatus.PLACED,
      },
      data: {
        status: BetStatus.LOST,
        payout: decimal(0),
        settledAt: new Date(),
      },
    });

    const [totalBets, cashouts, busted, wonAggregate] = await Promise.all([
      this.prisma.aviatorBet.count({ where: { roundId: runtime.roundId } }),
      this.prisma.aviatorBet.count({ where: { roundId: runtime.roundId, status: BetStatus.WON } }),
      this.prisma.aviatorBet.count({ where: { roundId: runtime.roundId, status: BetStatus.LOST } }),
      this.prisma.aviatorBet.aggregate({
        where: { roundId: runtime.roundId, status: BetStatus.WON },
        _sum: { payout: true },
      }),
    ]);

    const totalPayout = round2(toNumber(wonAggregate._sum.payout));

    await this.prisma.aviatorRound.update({
      where: { id: runtime.roundId },
      data: {
        status: RoundStatus.SETTLED,
        settledAt: new Date(),
        totalPayout: decimal(totalPayout),
      },
    });

    this.emitToRoom('round:settled', {
      roundId: runtime.roundId,
      roundNumber: runtime.roundNumber,
      result: crashResult,
      settlement: {
        totalBets,
        totalPayout,
        cashouts,
        busted,
      },
    });

    this.activeRound = null;
    await this.scheduleNextRound(config.waitingSeconds * 1000);
  }

  private multiplierAt(elapsedMs: number): number {
    return Math.exp(elapsedMs / config.multiplierGrowthMs);
  }

  private emitToRoom(event: string, payload: Record<string, unknown>): void {
    this.io.to(config.socketRoom).emit(event, payload);
  }

  private emitToUserWallet(userId: string, balance: number): void {
    this.io.to(`user:${userId}`).emit('wallet:updated', {
      userId,
      balance: round2(balance),
    });
  }
}

