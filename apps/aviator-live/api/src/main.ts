import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Prisma, PrismaClient, UserRole, WalletTxnType } from '@prisma/client';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { config } from './core/config.js';
import { signAuthToken, verifyAuthToken, type AuthUser } from './modules/auth/jwt.js';
import { AviatorEngine } from './modules/aviator/aviator-engine.js';

interface AuthedRequest extends Request {
  authUser?: AuthUser;
}

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

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});
const engine = new AviatorEngine(prisma, io);

app.use(cors());
app.use(express.json());

const guestLoginSchema = z.object({
  name: z.string().trim().min(2).max(32),
  userId: z.string().uuid().optional(),
});

const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

const placeBetSchema = z.object({
  amount: z.number().positive().max(10000000),
  betType: z.enum(['manual', 'auto_cashout']),
  autoCashoutAt: z.number().min(1.01).max(100).optional(),
});

const queryLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

const myBetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  roundId: z.string().uuid().optional(),
});

const cashoutBodySchema = z.object({
  betId: z.string().uuid(),
});

const adminConfigPatchSchema = z
  .object({
    minBet: z.coerce.number().positive().optional(),
    maxBet: z.coerce.number().positive().optional(),
    bettingWindowSeconds: z.coerce.number().int().min(3).optional(),
    lockSeconds: z.coerce.number().int().min(1).optional(),
    waitingSeconds: z.coerce.number().int().min(1).optional(),
    multiplierTickMs: z.coerce.number().int().min(50).optional(),
    multiplierGrowthMs: z.coerce.number().int().min(1000).optional(),
    maxCrashPoint: z.coerce.number().min(10).max(1000).optional(),
    maintenanceMode: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No config fields provided' });

const adminAuthConfig = {
  email: config.adminEmail,
  password: config.adminPassword,
  name: config.adminName,
};

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ message: 'Missing bearer token' });
      return;
    }
    req.authUser = verifyAuthToken(token);
    next();
  } catch (error: any) {
    res.status(401).json({ message: error.message || 'Invalid token' });
  }
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = req.authUser;
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (user.role !== 'ADMIN') {
    res.status(403).json({ message: 'Admin role required' });
    return;
  }
  next();
}

function userFromReq(req: AuthedRequest): AuthUser {
  if (!req.authUser) {
    throw new Error('Unauthorized');
  }
  return req.authUser;
}

function ok(res: Response, data: unknown): void {
  res.json({ data });
}

function fail(res: Response, error: any): void {
  res.status(400).json({ message: error?.message || 'Bad request' });
}

app.get('/health', (_req, res) => {
  ok(res, {
    ok: true,
    service: 'aviator-live-api',
    now: new Date().toISOString(),
  });
});

app.post('/auth/guest-login', async (req, res) => {
  try {
    const parsed = guestLoginSchema.parse(req.body);

    const user = await prisma.$transaction(async (tx) => {
      if (parsed.userId) {
        const existing = await tx.user.findUnique({ where: { userId: parsed.userId } });
        if (existing) {
          return tx.user.update({
            where: { userId: existing.userId },
            data: { name: parsed.name },
          });
        }
      }

      const created = await tx.user.create({
        data: {
          userId: parsed.userId || uuidv4(),
          name: parsed.name,
          role: UserRole.PLAYER,
          balance: decimal(config.initialWalletBalance),
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: created.userId,
          type: WalletTxnType.INIT_CREDIT,
          amount: decimal(config.initialWalletBalance),
          balanceBefore: decimal(0),
          balanceAfter: decimal(config.initialWalletBalance),
          payload: { reason: 'Guest wallet bootstrap' },
        },
      });

      return created;
    });

    const token = signAuthToken({
      userId: user.userId,
      name: user.name,
      role: 'PLAYER',
    });

    ok(res, {
      token,
      user: {
        userId: user.userId,
        name: user.name,
        role: user.role,
        balance: toNumber(user.balance),
      },
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/auth/admin-login', (req, res) => {
  try {
    const parsed = adminLoginSchema.parse(req.body);
    const email = parsed.email.toLowerCase();
    if (email !== adminAuthConfig.email || parsed.password !== adminAuthConfig.password) {
      res.status(401).json({ message: 'Invalid admin credentials' });
      return;
    }

    const token = signAuthToken({
      userId: `admin:${adminAuthConfig.email}`,
      name: adminAuthConfig.name,
      role: 'ADMIN',
    });

    ok(res, {
      token,
      user: {
        userId: `admin:${adminAuthConfig.email}`,
        name: adminAuthConfig.name,
        role: 'ADMIN',
      },
    });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const authUser = userFromReq(req);
    if (authUser.role === 'ADMIN') {
      ok(res, {
        userId: authUser.userId,
        name: authUser.name,
        role: authUser.role,
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { userId: authUser.userId } });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    ok(res, {
      userId: user.userId,
      name: user.name,
      role: user.role,
      balance: toNumber(user.balance),
    });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/aviator/config/public', (_req, res) => {
  const runtime = engine.getRuntimeConfig();
  ok(res, {
    minBet: runtime.minBet,
    maxBet: runtime.maxBet,
    bettingWindowSeconds: runtime.bettingWindowSeconds,
    lockSeconds: runtime.lockSeconds,
    waitingSeconds: runtime.waitingSeconds,
    multiplierTickMs: runtime.multiplierTickMs,
    maxCrashPoint: runtime.maxCrashPoint,
    maintenanceMode: runtime.maintenanceMode,
  });
});

app.get('/aviator/round/current', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const authUser = userFromReq(req);
    const snapshot = await engine.getCurrentRoundView(authUser.userId);
    ok(res, snapshot);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/aviator/round/history', async (req, res) => {
  try {
    const parsed = queryLimitSchema.parse(req.query);
    const history = await engine.listRoundHistory(parsed.limit);
    ok(res, history);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/aviator/bets', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const authUser = userFromReq(req);
    const parsed = placeBetSchema.parse(req.body);
    const result = await engine.placeBet(authUser.userId, parsed);
    ok(res, result);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/aviator/bets/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const authUser = userFromReq(req);
    const parsed = myBetsQuerySchema.parse(req.query);
    const bets = await engine.listUserBets(authUser.userId, parsed.limit, parsed.roundId);
    ok(res, bets);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/aviator/bets/cashout', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const authUser = userFromReq(req);
    const parsed = cashoutBodySchema.parse(req.body);
    const result = await engine.cashout(authUser.userId, parsed.betId, 'manual');
    ok(res, result);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/wallet/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const authUser = userFromReq(req);
    const wallet = await engine.getWallet(authUser.userId);
    ok(res, wallet);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/wallet/me/transactions', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const authUser = userFromReq(req);
    const parsed = queryLimitSchema.parse(req.query);
    const txns = await engine.listWalletTransactions(authUser.userId, parsed.limit);
    ok(res, txns);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/aviator/admin/config', requireAuth, requireAdmin, (_req: AuthedRequest, res) => {
  try {
    ok(res, engine.getRuntimeConfig());
  } catch (error) {
    fail(res, error);
  }
});

app.patch('/aviator/admin/config', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  try {
    const parsed = adminConfigPatchSchema.parse(req.body);
    const next = engine.updateRuntimeConfig(parsed);
    io.to(config.socketRoom).emit('aviator:config:updated', {
      config: next,
      updatedAt: new Date().toISOString(),
    });
    ok(res, next);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/aviator/admin/live-monitor', requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
  try {
    const snapshot = await engine.getCurrentRoundView();
    const roundId = snapshot.round?.id;
    if (!roundId) {
      ok(res, {
        round: null,
        metrics: {
          totalBets: 0,
          activePlayers: 0,
          totalStaked: 0,
          totalPayout: 0,
          placed: 0,
          won: 0,
          lost: 0,
          cancelled: 0,
        },
        config: engine.getRuntimeConfig(),
      });
      return;
    }

    const [statusCounts, sums, playerAgg] = await Promise.all([
      prisma.aviatorBet.groupBy({
        by: ['status'],
        where: { roundId },
        _count: { _all: true },
      }),
      prisma.aviatorBet.aggregate({
        where: { roundId },
        _sum: {
          amount: true,
          payout: true,
        },
      }),
      prisma.aviatorBet.groupBy({
        by: ['userId'],
        where: { roundId },
        _count: { _all: true },
      }),
    ]);

    const counts = {
      placed: 0,
      won: 0,
      lost: 0,
      cancelled: 0,
    };
    for (const row of statusCounts) {
      const value = row._count._all;
      if (row.status === 'PLACED') counts.placed = value;
      if (row.status === 'WON') counts.won = value;
      if (row.status === 'LOST') counts.lost = value;
      if (row.status === 'CANCELLED') counts.cancelled = value;
    }

    ok(res, {
      round: snapshot.round,
      metrics: {
        totalBets: counts.placed + counts.won + counts.lost + counts.cancelled,
        activePlayers: playerAgg.length,
        totalStaked: toNumber(sums._sum.amount),
        totalPayout: toNumber(sums._sum.payout),
        ...counts,
      },
      config: engine.getRuntimeConfig(),
    });
  } catch (error) {
    fail(res, error);
  }
});

function socketAuth(socket: Socket): AuthUser {
  return socket.data.user as AuthUser;
}

io.use((socket, next) => {
  try {
    const authToken = socket.handshake.auth?.token as string | undefined;
    const header = socket.handshake.headers.authorization;
    const headerToken =
      typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : undefined;
    const token = authToken || headerToken;
    if (!token) {
      next(new Error('Missing auth token'));
      return;
    }
    socket.data.user = verifyAuthToken(token);
    next();
  } catch (error: any) {
    next(new Error(error.message || 'Socket auth failed'));
  }
});

io.on('connection', async (socket) => {
  const user = socketAuth(socket);
  socket.join(config.socketRoom);
  socket.join(`user:${user.userId}`);

  try {
    socket.emit('round:state', await engine.getCurrentRoundView(user.userId));
    if (user.role !== 'ADMIN') {
      socket.emit('wallet:updated', await engine.getWallet(user.userId));
    }
  } catch (error: any) {
    socket.emit('aviator:error', { message: error?.message || 'Unable to load state' });
  }

  socket.on('round:state:request', async () => {
    try {
      socket.emit('round:state', await engine.getCurrentRoundView(user.userId));
    } catch (error: any) {
      socket.emit('aviator:error', { message: error?.message || 'Unable to fetch round state' });
    }
  });

  socket.on('aviator:cashout', async (payload: unknown) => {
    try {
      if (user.role === 'ADMIN') {
        throw new Error('Admins cannot cashout');
      }
      const parsed = cashoutBodySchema.parse(payload);
      const result = await engine.cashout(user.userId, parsed.betId, 'manual');
      socket.emit('aviator:cashout:success', result);
    } catch (error: any) {
      socket.emit('aviator:cashout:failed', {
        message: error?.message || 'Cashout failed',
      });
    }
  });
});

await prisma.$connect();
await engine.start();

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Aviator Live API listening on http://localhost:${config.port}`);
});

const shutdown = async () => {
  await engine.stop();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
