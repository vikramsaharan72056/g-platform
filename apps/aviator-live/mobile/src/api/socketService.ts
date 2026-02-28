import { io, Socket } from 'socket.io-client';
import { useAviatorStore } from '../store/useAviatorStore';

type RoundCreatedPayload = {
  roundId: string;
  roundNumber: number;
  status: 'BETTING';
  hash: string;
  bettingEndsAt: string;
};

type RoundLockedPayload = {
  roundId: string;
};

type AviatorTakeoffPayload = {
  roundId: string;
  roundNumber: number;
};

type AviatorMultiplierPayload = {
  roundId: string;
  multiplier: number;
};

type AviatorCashoutPayload = {
  userId: string;
  betId: string;
  payout: number;
  multiplier: number;
  alreadySettled?: boolean;
};

type AviatorCrashPayload = {
  roundId: string;
  crashPoint: number;
};

type RoundSettledPayload = {
  roundId: string;
  roundNumber: number;
  result: {
    crashPoint: number;
  };
  settlement: {
    totalBets: number;
    totalPayout: number;
  };
};

class SocketService {
  private socket: Socket | null = null;
  private apiUrl = '';

  init(url: string, token: string) {
    this.apiUrl = url;
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(this.apiUrl, {
      auth: { token },
    });

    this.socket.on('connect', () => {
      useAviatorStore.getState().setConnected(true);
      this.socket?.emit('round:state:request');
    });

    this.socket.on('disconnect', () => {
      useAviatorStore.getState().setConnected(false);
    });

    this.socket.on('connect_error', () => {
      useAviatorStore.getState().setConnected(false);
      useAviatorStore.getState().setError('Socket connection failed');
    });

    this.socket.on('round:state', (snapshot) => {
      useAviatorStore.getState().setRoundSnapshot(snapshot);
    });

    this.socket.on('round:created', (payload: RoundCreatedPayload) => {
      useAviatorStore.getState().setRound({
        id: payload.roundId,
        roundNumber: payload.roundNumber,
        status: payload.status,
        hash: payload.hash,
        bettingEndAt: payload.bettingEndsAt,
        crashPoint: null,
        currentMultiplier: null,
      });
      useAviatorStore.getState().setMultiplier(1);
    });

    this.socket.on('round:locked', (payload: RoundLockedPayload) => {
      const store = useAviatorStore.getState();
      const current = store.round;
      if (!current || current.id !== payload.roundId) return;
      store.setRound({ ...current, status: 'LOCKED' });
    });

    this.socket.on('aviator:takeoff', (payload: AviatorTakeoffPayload) => {
      const store = useAviatorStore.getState();
      const current = store.round;
      if (!current || current.id !== payload.roundId) return;
      store.setRound({ ...current, status: 'PLAYING' });
      store.setMultiplier(1);
    });

    this.socket.on('aviator:multiplier', (payload: AviatorMultiplierPayload) => {
      const store = useAviatorStore.getState();
      const current = store.round;
      if (!current || current.id !== payload.roundId) return;
      store.setMultiplier(payload.multiplier);
      store.setRound({ ...current, status: 'PLAYING', currentMultiplier: payload.multiplier });
    });

    this.socket.on('aviator:cashout', (payload: AviatorCashoutPayload) => {
      const store = useAviatorStore.getState();
      const localUserId = store.user?.userId;
      if (payload.userId !== localUserId) return;
      store.updateBet(payload.betId, {
        status: 'WON',
        payout: payload.payout,
        cashoutMultiplier: payload.multiplier,
      });
    });

    this.socket.on('aviator:crash', (payload: AviatorCrashPayload) => {
      const store = useAviatorStore.getState();
      const current = store.round;
      if (!current || current.id !== payload.roundId) return;
      store.setRound({
        ...current,
        status: 'RESULT',
        crashPoint: payload.crashPoint,
      });
      store.setMultiplier(payload.crashPoint);
      store.setLastCrashPoint(payload.crashPoint);
    });

    this.socket.on('round:settled', (payload: RoundSettledPayload) => {
      const store = useAviatorStore.getState();
      const current = store.round;
      if (current && current.id === payload.roundId) {
        store.setRound({
          ...current,
          status: 'SETTLED',
          crashPoint: payload.result.crashPoint,
        });
      }
      store.markPlacedBetsLost(payload.roundId);
      store.setLastCrashPoint(payload.result.crashPoint);
      store.prependHistoryItem({
        id: payload.roundId,
        roundNumber: payload.roundNumber,
        status: 'SETTLED',
        crashPoint: payload.result.crashPoint,
        totalBets: payload.settlement.totalBets,
        totalBetAmount: 0,
        totalPayout: payload.settlement.totalPayout,
        createdAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
      });
    });

    this.socket.on('wallet:updated', (payload: { userId: string; balance: number }) => {
      const store = useAviatorStore.getState();
      if (payload.userId !== store.user?.userId) return;
      store.setBalance(payload.balance);
    });

    this.socket.on('aviator:error', (payload: { message?: string }) => {
      useAviatorStore.getState().setError(payload?.message || 'Aviator socket error');
    });

    this.socket.on('aviator:cashout:failed', (payload: { message?: string }) => {
      useAviatorStore.getState().setError(payload?.message || 'Cashout failed');
    });
  }

  requestRoundState() {
    this.socket?.emit('round:state:request');
  }

  requestCashout(betId: string) {
    this.socket?.emit('aviator:cashout', { betId });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    useAviatorStore.getState().setConnected(false);
  }
}

export const socketService = new SocketService();
