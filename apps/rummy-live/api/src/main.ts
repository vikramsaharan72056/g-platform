import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { signAuthToken, verifyAuthToken, type AuthUser } from './modules/auth/jwt.js';
import { RummyTableEngine } from './modules/rummy/table-engine.js';
import { RummyPrismaRepository } from './infra/database/rummy-prisma.repository.js';
import { config } from './core/config.js';

interface AuthedRequest extends Request {
  rummyUser?: AuthUser;
}

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});

// Configure Redis Adapter for horizontal scaling
const pubClient = new Redis(config.redisUrl);
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));

// Handle Redis errors
const handleRedisError = (err: any) => console.error('Redis error:', err);
pubClient.on('error', handleRedisError);
subClient.on('error', handleRedisError);

const repository = new RummyPrismaRepository();
const engine = new RummyTableEngine(repository, {
  turnTimeoutSeconds: config.turnTimeoutSeconds,
  ledgerSigningSecret: config.ledgerSigningSecret,
  walletInitialBalance: config.initialWalletBalance,
});

// Initialize the engine by loading persisted tables
await engine.loadPersistedTables();

app.use(cors());
app.use(express.json());

const guestLoginSchema = z.object({
  name: z.string().trim().min(2).max(32),
});

const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

const createTableSchema = z.object({
  name: z.string().trim().min(3).max(40),
  maxPlayers: z.number().int().min(2).max(6),
  betAmount: z.number().int().min(1).max(1000000),
});

const historyLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const replayQuerySchema = z.object({
  sinceId: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

const walletTxnQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const ledgerLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

const ledgerIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const reclaimSeatSchema = z.object({
  reclaimCode: z.string().trim().min(8).max(128),
  sinceId: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const createDisputeSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
  evidence: z.string().trim().min(1).max(3000).optional(),
});

const resolveDisputeSchema = z.object({
  status: z.enum(['REVIEWED', 'RESOLVED', 'REJECTED']),
  resolutionNote: z.string().trim().min(3).max(2000),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  tableId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
});

const tablePayloadSchema = z.object({
  tableId: z.string().trim().min(1),
});

const drawPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  pile: z.enum(['closed', 'open']),
});

const discardPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  card: z.string().trim().min(2),
});

const declarePayloadSchema = z.object({
  tableId: z.string().trim().min(1),
});

const dropPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  dropType: z.enum(['first', 'middle', 'full']),
});

const chatPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  message: z.string().trim().min(1).max(300),
});

const chatListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const betChangeProposeSchema = z.object({
  betAmount: z.coerce.number().int().min(1).max(1000000),
});

const betChangeRespondSchema = z.object({
  approve: z.boolean(),
});

const betChangeAdminReviewSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

const betLockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

const reclaimPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  reclaimCode: z.string().trim().min(8).max(128),
  sinceId: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const rechargeSchema = z.object({
  amount: z.coerce.number().int().min(1).max(1000000),
});

// ==================== DEPOSIT / WITHDRAWAL SCHEMAS ====================
const submitDepositSchema = z.object({
  amount: z.number().int().min(1).max(10000000),
  utrNumber: z.string().trim().min(6).max(50),
  paymentMethod: z.string().trim().default('UPI'),
  screenshotUrl: z.string().trim().optional(),
  paymentQrId: z.number().int().optional(),
});

const depositListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const depositActionSchema = z.object({
  remarks: z.string().trim().max(500).optional(),
});

const depositRejectSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const submitWithdrawSchema = z.object({
  amount: z.number().int().min(100).max(10000000),
  bankName: z.string().trim().max(100).optional(),
  accountNumber: z.string().trim().max(30).optional(),
  ifscCode: z.string().trim().max(15).optional(),
  upiId: z.string().trim().max(100).optional(),
});

const withdrawalListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const withdrawApproveSchema = z.object({
  paymentRef: z.string().trim().min(3).max(100),
  remarks: z.string().trim().max(500).optional(),
});

const withdrawRejectSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const createPaymentQrSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.string().trim().default('UPI'),
  qrImageUrl: z.string().trim().optional(),
  upiId: z.string().trim().optional(),
});

const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

const walletAdjustSchema = z.object({
  amount: z.coerce.number().int().min(-10000000).max(10000000).refine((value) => value !== 0, {
    message: 'Amount cannot be zero',
  }),
  reason: z.string().trim().min(3).max(300).optional(),
});

const replayPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  sinceId: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(200),
});

const adminAuthConfig = {
  email: (process.env.RUMMY_ADMIN_EMAIL || 'admin@rummy.live').trim().toLowerCase(),
  password: process.env.RUMMY_ADMIN_PASSWORD || 'change-me-now',
  displayName: (process.env.RUMMY_ADMIN_NAME || 'Rummy Admin').trim(),
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
    req.rummyUser = verifyAuthToken(token);
    next();
  } catch (error: any) {
    res.status(401).json({ message: error.message || 'Invalid token' });
  }
}

function authUser(req: Request): AuthUser {
  const user = (req as AuthedRequest).rummyUser;
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = req.rummyUser;
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

function authProfile(user: AuthUser) {
  return {
    id: user.userId,
    email: user.email ?? null,
    displayName: user.name,
    role: user.role,
  };
}

function ok(res: Response, data: unknown): void {
  res.json({ data });
}

function fail(res: Response, error: any): void {
  res.status(400).json({ message: error?.message || 'Bad request' });
}

async function broadcastTableList(): Promise<void> {
  const tables = await engine.listTables();
  io.emit('table:list', tables);
}

async function broadcastTableState(tableId: string): Promise<void> {
  const room = io.sockets.adapter.rooms.get(`table:${tableId}`);
  if (!room) return;

  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    const user = socket.data.user as AuthUser | undefined;
    if (!user) continue;

    try {
      const state = engine.getTableView(tableId, user.userId);
      socket.emit('table:state', state);
    } catch {
      // ignore
    }
  }
}

function tableRoom(tableId: string): string {
  return `table:${tableId}`;
}

function emitTableChatMessage(tableId: string, message: unknown): void {
  io.to(tableRoom(tableId)).emit('chat:new', message);
}

function latestTableChatId(tableId: string): string | null {
  try {
    return engine.getLatestTableChatMessage(tableId)?.id || null;
  } catch {
    return null;
  }
}

function emitLatestTableChatIfChanged(tableId: string, previousId: string | null): void {
  const latest = engine.getLatestTableChatMessage(tableId);
  if (!latest || latest.id === previousId) return;
  emitTableChatMessage(tableId, latest);
}

function socketSubscriptions(socket: Socket): Set<string> {
  const existing = socket.data.tableSubscriptions as Set<string> | undefined;
  if (existing) return existing;
  const created = new Set<string>();
  socket.data.tableSubscriptions = created;
  return created;
}

function hasLiveSubscription(tableId: string, userId: string, excludeSocketId?: string): boolean {
  const room = io.sockets.adapter.rooms.get(`table:${tableId}`);
  if (!room) return false;

  for (const socketId of room) {
    if (excludeSocketId && socketId === excludeSocketId) continue;
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const user = socket.data.user as AuthUser | undefined;
    if (!user || user.userId !== userId) continue;
    const subscriptions = socket.data.tableSubscriptions as Set<string> | undefined;
    if (subscriptions?.has(tableId)) {
      return true;
    }
  }
  return false;
}

app.get('/health', (_req, res) => {
  ok(res, { ok: true, service: 'rummy-live-api', now: new Date().toISOString() });
});

app.post('/auth/guest-login', (req, res) => {
  try {
    const parsed = guestLoginSchema.parse(req.body);
    const user: AuthUser = {
      userId: uuidv4(),
      name: parsed.name,
      role: 'PLAYER',
    };
    const token = signAuthToken(user);
    ok(res, { token, user });
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

    const user: AuthUser = {
      userId: `admin:${adminAuthConfig.email}`,
      name: adminAuthConfig.displayName,
      role: 'ADMIN',
      email: adminAuthConfig.email,
    };
    const token = signAuthToken(user);
    ok(res, { token, user: authProfile(user) });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    ok(res, authProfile(user));
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables', async (_req, res) => {
  ok(res, await engine.listTables());
});

app.get('/wallet/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const wallet = await engine.getWallet(user);
    ok(res, wallet);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/wallet/me/transactions', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = walletTxnQuerySchema.parse(req.query);
    const txns = await engine.listWalletTransactions(user.userId, parsed.limit);
    ok(res, txns);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = createTableSchema.parse(req.body);
    const view = await engine.createTable(authUser(req), parsed);
    broadcastTableList();
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/join', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const view = await engine.joinTable(req.params.id, authUser(req));
    broadcastTableList();
    broadcastTableState(req.params.id);
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/leave', requireAuth, async (req: AuthedRequest, res) => {
  try {
    await engine.leaveTable(req.params.id, authUser(req).userId);
    broadcastTableList();
    broadcastTableState(req.params.id);
    ok(res, { left: true });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/start', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const view = await engine.startGame(req.params.id, authUser(req).userId);
    broadcastTableList();
    broadcastTableState(req.params.id);
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables/:id', requireAuth, (req: AuthedRequest, res) => {
  try {
    const view = engine.getTableView(req.params.id, authUser(req).userId);
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/bet-change/propose', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = betChangeProposeSchema.parse(req.body);
    const previousChatId = latestTableChatId(req.params.id);
    const view = await engine.proposeBetChange(req.params.id, user, parsed.betAmount);
    emitLatestTableChatIfChanged(req.params.id, previousChatId);
    await broadcastTableState(req.params.id);
    await broadcastTableList();
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/bet-change/respond', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = betChangeRespondSchema.parse(req.body);
    const previousChatId = latestTableChatId(req.params.id);
    const view = await engine.respondBetChange(req.params.id, user, parsed.approve);
    emitLatestTableChatIfChanged(req.params.id, previousChatId);
    await broadcastTableState(req.params.id);
    await broadcastTableList();
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/bet-change/admin-review', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const admin = authUser(req);
    const parsed = betChangeAdminReviewSchema.parse(req.body);
    const previousChatId = latestTableChatId(req.params.id);
    const view = await engine.reviewBetChangeByAdmin(req.params.id, admin, parsed.approve, parsed.reason);
    emitLatestTableChatIfChanged(req.params.id, previousChatId);
    await broadcastTableState(req.params.id);
    await broadcastTableList();
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/bet-lock', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const admin = authUser(req);
    const parsed = betLockSchema.parse(req.body);
    const previousChatId = latestTableChatId(req.params.id);
    const view = await engine.setBetLock(req.params.id, admin, parsed.blocked, parsed.reason);
    emitLatestTableChatIfChanged(req.params.id, previousChatId);
    await broadcastTableState(req.params.id);
    await broadcastTableList();
    ok(res, view);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables/:id/chat', requireAuth, (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = chatListQuerySchema.parse(req.query);
    const messages = engine.listTableChat(req.params.id, user, user.role === 'ADMIN', parsed.limit);
    ok(res, messages);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables/:id/history', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = historyLimitSchema.parse(req.query);
    const data = await engine.listHistory(req.params.id, parsed.limit);
    ok(res, data);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/wallet', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const wallet = await engine.getWallet(user);
    ok(res, wallet);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/wallet/transactions', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = walletTxnQuerySchema.parse(req.query);
    const txns = await engine.listWalletTransactions(user.userId, parsed.limit);
    ok(res, txns);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/wallet/recharge', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = rechargeSchema.parse(req.body);
    const result = await repository.applyWalletDeltas([
      {
        userId: user.userId,
        displayName: user.name,
        amount: parsed.amount,
        type: 'RECHARGE',
        payload: { method: 'DEBUG_RECHARGE' },
      },
    ]);
    const balance = result.get(user.userId);
    ok(res, { balance: balance?.after });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables/:id/replay', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = replayQuerySchema.parse(req.query);
    const replay = await engine.getReplay(req.params.id, authUser(req).userId, {
      sinceId: parsed.sinceId,
      limit: parsed.limit,
    });
    ok(res, replay);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/reclaim', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = reclaimSeatSchema.parse(req.body);
    const user = authUser(req);
    const view = await engine.reclaimSeat(req.params.id, parsed.reclaimCode, user);
    const replay = await engine.getReplay(req.params.id, user.userId, {
      sinceId: parsed.sinceId ?? 0,
      limit: parsed.limit ?? 200,
    });
    broadcastTableState(req.params.id);
    broadcastTableList();
    ok(res, {
      table: view,
      replay,
    });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables/:id/ledger', requireAuth, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = ledgerLimitQuerySchema.parse(req.query);
    const rows = await engine.listResultLedger(req.params.id, parsed.limit);
    ok(res, rows);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/ledger/:id/verify', requireAuth, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = ledgerIdParamSchema.parse(req.params);
    const result = await engine.verifyLedgerEntry(parsed.id);
    ok(res, result);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/tables/:id/disputes', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = createDisputeSchema.parse(req.body);
    const dispute = await engine.createDispute(req.params.id, user, parsed.reason, parsed.evidence);
    ok(res, dispute);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables/:id/disputes', requireAuth, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = historyLimitSchema.parse(req.query);
    const disputes = await engine.listDisputes(req.params.id, parsed.limit);
    ok(res, disputes);
  } catch (error) {
    fail(res, error);
  }
});

app.post('/disputes/:id/resolve', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const actor = authUser(req);
    const parsedId = ledgerIdParamSchema.parse(req.params);
    const parsedBody = resolveDisputeSchema.parse(req.body);
    const dispute = await engine.resolveDispute(parsedId.id, actor, parsedBody);
    ok(res, dispute);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/audit', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = auditQuerySchema.parse(req.query);
    const logs = await engine.listAuditLogs(parsed);
    ok(res, logs);
  } catch (error) {
    fail(res, error);
  }
});

// ==================== ADMIN: USER LIST ====================
app.get('/users/admin/list', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = userListQuerySchema.parse(req.query);
    const skip = (parsed.page - 1) * parsed.limit;
    const where = parsed.search ? { name: { contains: parsed.search, mode: 'insensitive' as const } } : {};
    const [users, total] = await Promise.all([
      repository.prisma.user.findMany({ where, skip, take: parsed.limit, orderBy: { createdAt: 'desc' } }),
      repository.prisma.user.count({ where }),
    ]);
    ok(res, {
      data: users.map(u => ({
        id: u.userId,
        displayName: u.name,
        email: `${u.name.toLowerCase().replace(/\s+/g, '.')}@rummy.live`,
        status: 'ACTIVE',
        wallet: { balance: u.balance, totalDeposited: 0, totalWithdrawn: 0, totalWon: 0 },
        role: 'USER',
        createdAt: u.createdAt.toISOString(),
      })),
      meta: { total, page: parsed.page, totalPages: Math.ceil(total / parsed.limit) },
    });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/users/admin/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const user = await repository.prisma.user.findUnique({
      where: { userId: req.params.id },
    });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const txns = await repository.listWalletTransactions(user.userId, 100);
    ok(res, {
      id: user.userId,
      displayName: user.name,
      email: `${user.name.toLowerCase().replace(/\s+/g, '.')}@rummy.live`,
      status: 'ACTIVE',
      role: 'USER',
      createdAt: user.createdAt.toISOString(),
      wallet: {
        balance: user.balance,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalWon: 0,
      },
      transactions: txns,
      bets: [],
      loginHistory: [],
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/users/admin/:id/wallet-adjust', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const admin = authUser(req);
    const parsed = walletAdjustSchema.parse(req.body);
    const target = await repository.prisma.user.findUnique({
      where: { userId: req.params.id },
    });
    if (!target) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const deltas = await repository.applyWalletDeltas([
      {
        userId: target.userId,
        displayName: target.name,
        amount: parsed.amount,
        type: 'ADMIN_ADJUSTMENT',
        payload: {
          reason: parsed.reason || 'Manual admin adjustment',
          adjustedBy: admin.userId,
        },
      },
    ]);

    await repository.appendAudit('ADMIN_WALLET_ADJUSTMENT', admin.userId, null, {
      targetUserId: target.userId,
      amount: parsed.amount,
      reason: parsed.reason || null,
    });

    const balance = deltas.get(target.userId)?.after ?? target.balance;
    ok(res, { balance });
  } catch (error) {
    fail(res, error);
  }
});

// ==================== DEPOSITS: PLAYER ENDPOINTS ====================

// Player submits a deposit request with UTR
app.post('/deposits', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = submitDepositSchema.parse(req.body);
    await repository.ensureWallet(user.userId, user.name);
    const deposit = await repository.prisma.deposit.create({
      data: {
        userId: user.userId,
        amount: parsed.amount,
        utrNumber: parsed.utrNumber,
        paymentMethod: parsed.paymentMethod,
        screenshotUrl: parsed.screenshotUrl || null,
        paymentQrId: parsed.paymentQrId || null,
      },
    });
    await repository.appendAudit('DEPOSIT_SUBMITTED', user.userId, null, {
      depositId: deposit.id, amount: parsed.amount, utrNumber: parsed.utrNumber,
    });
    ok(res, deposit);
  } catch (error) {
    fail(res, error);
  }
});

// Player: list my deposits
app.get('/deposits/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const deposits = await repository.prisma.deposit.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    ok(res, deposits);
  } catch (error) {
    fail(res, error);
  }
});

// ==================== DEPOSITS: ADMIN ENDPOINTS ====================

// Admin: list all deposits (with optional status filter)
app.get('/deposits', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = depositListQuerySchema.parse(req.query);
    const skip = (parsed.page - 1) * parsed.limit;
    const where = parsed.status ? { status: parsed.status } : {};
    const [deposits, total] = await Promise.all([
      repository.prisma.deposit.findMany({
        where,
        skip,
        take: parsed.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: true, paymentQr: true },
      }),
      repository.prisma.deposit.count({ where }),
    ]);
    ok(res, {
      data: deposits.map(d => ({
        id: String(d.id),
        amount: d.amount,
        status: d.status,
        utrNumber: d.utrNumber,
        paymentMethod: d.paymentMethod,
        screenshotUrl: d.screenshotUrl,
        remarks: d.remarks,
        rejectionReason: d.rejectionReason,
        createdAt: d.createdAt.toISOString(),
        approvedAt: d.approvedAt?.toISOString() || null,
        rejectedAt: d.rejectedAt?.toISOString() || null,
        user: {
          id: d.user.userId,
          displayName: d.user.name,
          email: `${d.user.name.toLowerCase().replace(/\s+/g, '.')}@rummy.live`,
        },
        paymentQr: d.paymentQr ? { name: d.paymentQr.name, type: d.paymentQr.type } : null,
      })),
      meta: { total, page: parsed.page, totalPages: Math.ceil(total / parsed.limit) },
    });
  } catch (error) {
    fail(res, error);
  }
});

// Admin: approve deposit → credits player wallet
app.post('/deposits/:id/approve', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const admin = authUser(req);
    const depositId = parseInt(req.params.id);
    const parsed = depositActionSchema.parse(req.body);

    const deposit = await repository.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) { res.status(404).json({ message: 'Deposit not found' }); return; }
    if (deposit.status !== 'PENDING') { res.status(400).json({ message: `Deposit is already ${deposit.status}` }); return; }

    // Approve + credit wallet atomically
    await repository.prisma.$transaction(async (tx) => {
      await tx.deposit.update({
        where: { id: depositId },
        data: {
          status: 'APPROVED',
          remarks: parsed.remarks || 'Approved by admin',
          approvedBy: admin.userId,
          approvedAt: new Date(),
        },
      });

      // Credit user wallet
      const user = await tx.user.findUnique({ where: { userId: deposit.userId } });
      if (!user) throw new Error('User not found');
      const balanceBefore = user.balance;
      const balanceAfter = balanceBefore + deposit.amount;

      await tx.user.update({ where: { userId: deposit.userId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          userId: deposit.userId,
          type: 'DEPOSIT',
          amount: deposit.amount,
          balanceBefore,
          balanceAfter,
          payload: { depositId: deposit.id, utrNumber: deposit.utrNumber, approvedBy: admin.userId },
        },
      });
    });

    await repository.appendAudit('DEPOSIT_APPROVED', admin.userId, null, {
      depositId, amount: deposit.amount, userId: deposit.userId,
    });
    ok(res, { approved: true });
  } catch (error) {
    fail(res, error);
  }
});

// Admin: reject deposit
app.post('/deposits/:id/reject', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const admin = authUser(req);
    const depositId = parseInt(req.params.id);
    const parsed = depositRejectSchema.parse(req.body);

    const deposit = await repository.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) { res.status(404).json({ message: 'Deposit not found' }); return; }
    if (deposit.status !== 'PENDING') { res.status(400).json({ message: `Deposit is already ${deposit.status}` }); return; }

    await repository.prisma.deposit.update({
      where: { id: depositId },
      data: { status: 'REJECTED', rejectionReason: parsed.reason, rejectedBy: admin.userId, rejectedAt: new Date() },
    });

    await repository.appendAudit('DEPOSIT_REJECTED', admin.userId, null, {
      depositId, reason: parsed.reason, userId: deposit.userId,
    });
    ok(res, { rejected: true });
  } catch (error) {
    fail(res, error);
  }
});

// ==================== WITHDRAWALS: PLAYER ENDPOINTS ====================

// Player requests a withdrawal
app.post('/withdrawals', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const parsed = submitWithdrawSchema.parse(req.body);
    const wallet = await engine.getWallet(user);
    if (wallet.balance < parsed.amount) {
      res.status(400).json({ message: `Insufficient balance. Current: ₹${wallet.balance}, Requested: ₹${parsed.amount}` });
      return;
    }

    // Check no other pending withdrawal exists
    const existing = await repository.prisma.withdrawal.findFirst({
      where: { userId: user.userId, status: 'PENDING' },
    });
    if (existing) {
      res.status(400).json({ message: 'You already have a pending withdrawal request' });
      return;
    }

    // Debit wallet immediately (hold funds)
    await repository.applyWalletDeltas([{
      userId: user.userId,
      displayName: user.name,
      amount: -parsed.amount,
      type: 'WITHDRAWAL_HOLD',
      payload: { reason: 'Funds held for withdrawal request' },
    }]);

    const withdrawal = await repository.prisma.withdrawal.create({
      data: {
        userId: user.userId,
        amount: parsed.amount,
        bankName: parsed.bankName || null,
        accountNumber: parsed.accountNumber || null,
        ifscCode: parsed.ifscCode || null,
        upiId: parsed.upiId || null,
      },
    });

    await repository.appendAudit('WITHDRAWAL_REQUESTED', user.userId, null, {
      withdrawalId: withdrawal.id, amount: parsed.amount,
    });
    ok(res, withdrawal);
  } catch (error) {
    fail(res, error);
  }
});

// Player: list my withdrawals
app.get('/withdrawals/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = authUser(req);
    const data = await repository.prisma.withdrawal.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    ok(res, data);
  } catch (error) {
    fail(res, error);
  }
});

// ==================== WITHDRAWALS: ADMIN ENDPOINTS ====================

// Admin: list all withdrawals
app.get('/withdrawals', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = withdrawalListQuerySchema.parse(req.query);
    const skip = (parsed.page - 1) * parsed.limit;
    const where = parsed.status ? { status: parsed.status } : {};
    const [items, total] = await Promise.all([
      repository.prisma.withdrawal.findMany({
        where,
        skip,
        take: parsed.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      }),
      repository.prisma.withdrawal.count({ where }),
    ]);
    ok(res, {
      data: items.map(w => ({
        id: String(w.id),
        amount: w.amount,
        status: w.status,
        bankName: w.bankName,
        accountNumber: w.accountNumber,
        ifscCode: w.ifscCode,
        upiId: w.upiId,
        paymentRef: w.paymentRef,
        remarks: w.remarks,
        rejectionReason: w.rejectionReason,
        createdAt: w.createdAt.toISOString(),
        user: {
          id: w.user.userId,
          displayName: w.user.name,
        },
      })),
      meta: { total, page: parsed.page, totalPages: Math.ceil(total / parsed.limit) },
    });
  } catch (error) {
    fail(res, error);
  }
});

// Admin: approve withdrawal
app.post('/withdrawals/:id/approve', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const admin = authUser(req);
    const withdrawalId = parseInt(req.params.id);
    const parsed = withdrawApproveSchema.parse(req.body);

    const withdrawal = await repository.prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) { res.status(404).json({ message: 'Withdrawal not found' }); return; }
    if (withdrawal.status !== 'PENDING') { res.status(400).json({ message: `Withdrawal is already ${withdrawal.status}` }); return; }

    await repository.prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: 'APPROVED',
        paymentRef: parsed.paymentRef,
        remarks: parsed.remarks || 'Approved',
        approvedBy: admin.userId,
        approvedAt: new Date(),
      },
    });

    await repository.appendAudit('WITHDRAWAL_APPROVED', admin.userId, null, {
      withdrawalId, amount: withdrawal.amount, paymentRef: parsed.paymentRef, userId: withdrawal.userId,
    });
    ok(res, { approved: true });
  } catch (error) {
    fail(res, error);
  }
});

// Admin: reject withdrawal → refund the held amount back to wallet
app.post('/withdrawals/:id/reject', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const admin = authUser(req);
    const withdrawalId = parseInt(req.params.id);
    const parsed = withdrawRejectSchema.parse(req.body);

    const withdrawal = await repository.prisma.withdrawal.findUnique({ where: { id: withdrawalId }, include: { user: true } });
    if (!withdrawal) { res.status(404).json({ message: 'Withdrawal not found' }); return; }
    if (withdrawal.status !== 'PENDING') { res.status(400).json({ message: `Withdrawal is already ${withdrawal.status}` }); return; }

    // Refund held amount
    await repository.prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'REJECTED', rejectionReason: parsed.reason, rejectedBy: admin.userId, rejectedAt: new Date() },
      });

      const user = await tx.user.findUnique({ where: { userId: withdrawal.userId } });
      if (!user) throw new Error('User not found');
      const balanceBefore = user.balance;
      const balanceAfter = balanceBefore + withdrawal.amount;

      await tx.user.update({ where: { userId: withdrawal.userId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          userId: withdrawal.userId,
          type: 'WITHDRAWAL_REFUND',
          amount: withdrawal.amount,
          balanceBefore,
          balanceAfter,
          payload: { withdrawalId, reason: parsed.reason, refundedBy: admin.userId },
        },
      });
    });

    await repository.appendAudit('WITHDRAWAL_REJECTED', admin.userId, null, {
      withdrawalId, reason: parsed.reason, amount: withdrawal.amount, userId: withdrawal.userId,
    });
    ok(res, { rejected: true });
  } catch (error) {
    fail(res, error);
  }
});

// ==================== PAYMENT QR MANAGEMENT ====================

// List active QR codes (public for players)
app.get('/payment-qrs', async (_req, res) => {
  try {
    const qrs = await repository.prisma.paymentQr.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, qrs);
  } catch (error) {
    fail(res, error);
  }
});

// Admin: list ALL QR codes (including inactive)
app.get('/payment-qrs/all', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const qrs = await repository.prisma.paymentQr.findMany({ orderBy: { createdAt: 'desc' } });
    ok(res, qrs);
  } catch (error) {
    fail(res, error);
  }
});

// Admin: create QR
app.post('/payment-qrs', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = createPaymentQrSchema.parse(req.body);
    const qr = await repository.prisma.paymentQr.create({ data: parsed });
    ok(res, qr);
  } catch (error) {
    fail(res, error);
  }
});

// Admin: toggle QR active/inactive
app.patch('/payment-qrs/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const id = parseInt(req.params.id);
    const { isActive } = req.body;
    const qr = await repository.prisma.paymentQr.update({ where: { id }, data: { isActive: Boolean(isActive) } });
    ok(res, qr);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/system/production-report', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const tables = await engine.listTables();
    const activeGames = tables.filter(t => t.status === 'IN_PROGRESS').length;

    // Scalability Check Logic
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const recommendations = [];

    if (tables.length > 50) recommendations.push('ALARM: High table count in memory. Migrate to Redis State Store.');
    if (activeGames > 10) recommendations.push('INFO: Concurrency rising. Scale to multi-node with Socket.io Redis Adapter.');

    ok(res, {
      timestamp: new Date().toISOString(),
      stats: {
        totalTables: tables.length,
        activeGames,
        systemMemoryMB: Math.round(memoryUsage),
      },
      scalabilityAudit: recommendations.length > 0 ? recommendations : ['System currently optimal for small-scale testing.'],
      productionReadiness: {
        database: 'PostgreSQL (Production Ready via Prisma)',
        stateStore: 'In-Memory (Needs Redis for horizontal scaling)',
        transactions: 'Prisma (Atomic ACID transactions implemented)',
      }
    });
  } catch (error) {
    fail(res, error);
  }
});

function socketUser(socket: Socket): AuthUser {
  return socket.data.user as AuthUser;
}

function sendSocketError(socket: Socket, message: string): void {
  socket.emit('table:error', { message });
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
  const user = socketUser(socket);
  socketSubscriptions(socket);
  socket.emit('table:list', await engine.listTables());

  socket.on('table:subscribe', async (payload: unknown) => {
    try {
      const parsed = tablePayloadSchema.parse(payload);
      socket.join(`table:${parsed.tableId}`);
      socketSubscriptions(socket).add(parsed.tableId);
      await engine.setSeatConnection(parsed.tableId, user.userId, true);
      const state = engine.getTableView(parsed.tableId, user.userId);
      socket.emit('table:state', state);
      const chatHistory = engine.listTableChat(parsed.tableId, user, user.role === 'ADMIN', 100);
      socket.emit('chat:history', chatHistory);
      broadcastTableState(parsed.tableId);
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Failed to subscribe table');
    }
  });

  socket.on('table:unsubscribe', async (payload: unknown) => {
    try {
      const parsed = tablePayloadSchema.parse(payload);
      socketSubscriptions(socket).delete(parsed.tableId);
      socket.leave(`table:${parsed.tableId}`);
      if (!hasLiveSubscription(parsed.tableId, user.userId, socket.id)) {
        await engine.setSeatConnection(parsed.tableId, user.userId, false);
      }
      broadcastTableState(parsed.tableId);
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Failed to unsubscribe table');
    }
  });

  socket.on('table:reclaim', async (payload: unknown) => {
    try {
      const parsed = reclaimPayloadSchema.parse(payload);
      const state = await engine.reclaimSeat(parsed.tableId, parsed.reclaimCode, user);
      socket.join(`table:${parsed.tableId}`);
      socketSubscriptions(socket).add(parsed.tableId);
      await engine.setSeatConnection(parsed.tableId, user.userId, true);
      socket.emit('table:state', state);
      socket.emit(
        'table:replay',
        await engine.getReplay(parsed.tableId, user.userId, {
          sinceId: parsed.sinceId ?? 0,
          limit: parsed.limit ?? 200,
        }),
      );
      broadcastTableState(parsed.tableId);
      broadcastTableList();
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Seat reclaim failed');
    }
  });

  socket.on('table:replay', async (payload: unknown) => {
    try {
      const parsed = replayPayloadSchema.parse(payload);
      const replay = await engine.getReplay(parsed.tableId, user.userId, {
        sinceId: parsed.sinceId,
        limit: parsed.limit,
      });
      socket.emit('table:replay', replay);
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Replay failed');
    }
  });

  socket.on('turn:draw', async (payload: unknown) => {
    try {
      const parsed = drawPayloadSchema.parse(payload);
      await engine.drawCard(parsed.tableId, user.userId, parsed.pile);
      broadcastTableState(parsed.tableId);
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Draw failed');
    }
  });

  socket.on('turn:discard', async (payload: unknown) => {
    try {
      const parsed = discardPayloadSchema.parse(payload);
      await engine.discardCard(parsed.tableId, user.userId, parsed.card);
      broadcastTableState(parsed.tableId);
      broadcastTableList();
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Discard failed');
    }
  });

  socket.on('turn:declare', async (payload: unknown) => {
    try {
      const parsed = declarePayloadSchema.parse(payload);
      await engine.declare(parsed.tableId, user.userId);
      broadcastTableState(parsed.tableId);
      broadcastTableList();
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Declare failed');
    }
  });

  socket.on('turn:drop', async (payload: unknown) => {
    try {
      const parsed = dropPayloadSchema.parse(payload);
      await engine.drop(parsed.tableId, user.userId, parsed.dropType);
      broadcastTableState(parsed.tableId);
      broadcastTableList();
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Drop failed');
    }
  });

  socket.on('chat:send', async (payload: unknown) => {
    try {
      const parsed = chatPayloadSchema.parse(payload);
      const message = engine.addTableChatMessage(
        parsed.tableId,
        user,
        parsed.message,
        user.role === 'ADMIN' ? 'ADMIN' : 'PLAYER',
      );
      emitTableChatMessage(parsed.tableId, message);
    } catch (error: any) {
      sendSocketError(socket, error.message || 'Chat send failed');
    }
  });

  socket.on('disconnect', async () => {
    const subscriptions = socketSubscriptions(socket);
    for (const tableId of subscriptions) {
      if (!hasLiveSubscription(tableId, user.userId, socket.id)) {
        await engine.setSeatConnection(tableId, user.userId, false);
      }
      broadcastTableState(tableId);
    }
  });
});

async function tick() {
  try {
    const timedOut = await engine.processTurnTimeouts();
    if (timedOut.length > 0) {
      for (const entry of timedOut) {
        io.to(`table:${entry.tableId}`).emit('table:timeout', {
          tableId: entry.tableId,
          userId: entry.userId,
          message: 'Turn timed out. Full drop applied.',
        });
        broadcastTableState(entry.tableId);
      }
      broadcastTableList();
    }
  } catch (error) {
    console.error('Error in tick:', error);
  } finally {
    setTimeout(tick, 1000);
  }
}
tick();

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Rummy Live API listening on http://localhost:${config.port}`);
  console.log(`Database: PostgreSQL (Active)`);
  console.log(`Redis: ${config.redisUrl} (Socket.io Adapter Active)`);
  console.log(`Turn timeout: ${config.turnTimeoutSeconds}s`);
  console.log(`Initial wallet balance: ${config.initialWalletBalance}`);
});
