export type RoundStatus =
  | 'WAITING'
  | 'BETTING'
  | 'LOCKED'
  | 'PLAYING'
  | 'RESULT'
  | 'SETTLED'
  | 'CANCELLED';

export type BetType = 'manual' | 'auto_cashout';
export type BetStatus = 'PLACED' | 'WON' | 'LOST' | 'CANCELLED';

export interface User {
  userId: string;
  name: string;
  role: 'PLAYER' | 'ADMIN';
  token: string;
  balance: number;
}

export interface AviatorRoundView {
  id: string;
  roundNumber: number;
  status: RoundStatus;
  bettingEndAt: string;
  crashPoint: number | null;
  hash: string;
  currentMultiplier: number | null;
}

export interface AviatorBet {
  id: string;
  roundId: string;
  amount: number;
  betType: BetType;
  autoCashoutAt: number | null;
  status: BetStatus;
  payout: number;
  cashoutMultiplier: number | null;
  placedAt?: string;
  settledAt?: string | null;
}

export interface AviatorRoundSnapshot {
  round: AviatorRoundView | null;
  userBets: AviatorBet[];
}

export interface RoundHistoryItem {
  id: string;
  roundNumber: number;
  status: RoundStatus;
  crashPoint: number;
  totalBets: number;
  totalBetAmount: number;
  totalPayout: number;
  createdAt: string;
  settledAt: string | null;
}

export interface WalletPayload {
  userId: string;
  balance: number;
}
