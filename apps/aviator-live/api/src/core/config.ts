export const config = {
  port: Number(process.env.AVIATOR_API_PORT || 3501),
  jwtSecret: process.env.AVIATOR_JWT_SECRET || 'aviator-live-jwt-dev-secret',
  jwtExpiresIn: process.env.AVIATOR_JWT_EXPIRES_IN || '7d',
  socketRoom: process.env.AVIATOR_SOCKET_ROOM || 'game:aviator-main',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:gplatform_local_2026@localhost:5432/aviator_live?schema=public',
  minBet: Number(process.env.AVIATOR_MIN_BET || 10),
  maxBet: Number(process.env.AVIATOR_MAX_BET || 50000),
  initialWalletBalance: Number(process.env.AVIATOR_INITIAL_WALLET_BALANCE || 10000),
  bettingWindowSeconds: Number(process.env.AVIATOR_BETTING_WINDOW_SECONDS || 12),
  lockSeconds: Number(process.env.AVIATOR_LOCK_SECONDS || 2),
  waitingSeconds: Number(process.env.AVIATOR_WAITING_SECONDS || 5),
  multiplierTickMs: Number(process.env.AVIATOR_MULTIPLIER_TICK_MS || 150),
  multiplierGrowthMs: Number(process.env.AVIATOR_MULTIPLIER_GROWTH_MS || 5500),
};
