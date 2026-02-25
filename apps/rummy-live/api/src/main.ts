import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server as SocketIOServer, type Socket } from 'socket.io';
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

const reclaimPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  reclaimCode: z.string().trim().min(8).max(128),
  sinceId: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const rechargeSchema = z.object({
  amount: z.coerce.number().int().min(1).max(1000000),
});

const replayPayloadSchema = z.object({
  tableId: z.string().trim().min(1),
  sinceId: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(200),
});

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

function ok(res: Response, data: unknown): void {
  res.json({ data });
}

function fail(res: Response, error: any): void {
  res.status(400).json({ message: error?.message || 'Bad request' });
}

function broadcastTableList(): void {
  io.emit('table:list', engine.listTables());
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
    };
    const token = signAuthToken(user);
    ok(res, { token, user });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/tables', (_req, res) => {
  ok(res, engine.listTables());
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

app.get('/audit', requireAuth, async (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const parsed = auditQuerySchema.parse(req.query);
    const logs = await engine.listAuditLogs(parsed);
    ok(res, logs);
  } catch (error) {
    fail(res, error);
  }
});

app.get('/system/production-report', requireAuth, (req: AuthedRequest, res) => {
  try {
    authUser(req);
    const tables = engine.listTables();
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

io.on('connection', (socket) => {
  const user = socketUser(socket);
  socketSubscriptions(socket);
  socket.emit('table:list', engine.listTables());

  socket.on('table:subscribe', async (payload: unknown) => {
    try {
      const parsed = tablePayloadSchema.parse(payload);
      socket.join(`table:${parsed.tableId}`);
      socketSubscriptions(socket).add(parsed.tableId);
      await engine.setSeatConnection(parsed.tableId, user.userId, true);
      const state = engine.getTableView(parsed.tableId, user.userId);
      socket.emit('table:state', state);
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
  console.log(`SQLite DB: ${config.dbPath}`);
  console.log(`Turn timeout: ${config.turnTimeoutSeconds}s`);
  console.log(`Initial wallet balance: ${config.initialWalletBalance}`);
});
