import path from 'node:path';

export const config = {
  port: Number(process.env.RUMMY_API_PORT || 3400),
  dbPath: process.env.RUMMY_DB_PATH || path.resolve(process.cwd(), 'data/rummy-live.db'),
  turnTimeoutSeconds: Number(process.env.RUMMY_TURN_TIMEOUT_SECONDS || 30),
  ledgerSigningSecret: process.env.RUMMY_LEDGER_SIGNING_SECRET || 'rummy-live-ledger-dev-secret',
  initialWalletBalance: Number(process.env.RUMMY_INITIAL_WALLET_BALANCE || 10000),
  jwtSecret: process.env.RUMMY_JWT_SECRET || 'rummy-live-jwt-dev-secret',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/rummy_live?schema=public',
};
