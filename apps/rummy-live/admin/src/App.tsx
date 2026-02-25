import { FormEvent, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type TableSummary = {
  id: string;
  name: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
  maxPlayers: number;
  currentPlayers: number;
  pointValue: number;
  createdAt: string;
};

type SeatView = {
  seatNo: number;
  userId: string;
  name: string;
  score: number;
  status: 'ACTIVE' | 'DROPPED';
  turnsPlayed: number;
  dropType: 'FIRST' | 'MIDDLE' | 'FULL' | 'TIMEOUT' | 'INVALID_DECLARE' | null;
  dropPenalty: number;
  droppedAt: string | null;
  connected: boolean;
  lastSeenAt: string | null;
  reclaimCode?: string | null;
  hand?: string[];
  handCount?: number;
};

type SettlementEntry = {
  userId: string;
  name: string;
  points: number;
  amount: number;
  walletBefore: number;
  walletAfter: number;
  result: 'WIN' | 'LOSE' | 'DROP' | 'INVALID';
};

type TableState = {
  id: string;
  name: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
  hostUserId: string;
  maxPlayers: number;
  pointValue: number;
  currentPlayers: number;
  seats: SeatView[];
  mySeat: null | {
    userId: string;
    seatNo: number;
    reclaimCode: string | null;
  };
  game: null | {
    jokerCard: string | null;
    jokerRank: string | null;
    openTop: string | null;
    closedCount: number;
    activePlayers: number;
    turn: {
      userId: string;
      hasDrawn: boolean;
      turnNo: number;
      startedAt: string;
      expiresAt: string;
      timeoutMs: number;
    };
    winnerUserId: string | null;
    winningReason: string | null;
    finishedAt: string | null;
    settlement: null | {
      pointValue: number;
      totalPoints: number;
      totalAmount: number;
      entries: SettlementEntry[];
    };
    resultLedger: null | {
      ledgerId: number;
      payloadHash: string;
      signature: string;
      signedAt: string;
    };
  };
};

type AuthData = {
  token: string;
  user: {
    userId: string;
    name: string;
  };
};

type WalletBalance = {
  userId: string;
  displayName: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
};

type WalletTransaction = {
  id: number;
  userId: string;
  tableId: string | null;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  payload: unknown;
  createdAt: string;
};

type HistoryRow = {
  id: number;
  tableId: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
};

type ReplayResponse = {
  tableId: string;
  sinceId: number;
  limit: number;
  latestEventId: number;
  events: HistoryRow[];
  state: TableState;
};

type LedgerRow = {
  id: number;
  tableId: string;
  winnerUserId: string;
  payload: unknown;
  payloadHash: string;
  signature: string;
  previousHash: string | null;
  createdAt: string;
};

type LedgerVerifyResponse = {
  ledgerId: number;
  tableId: string;
  winnerUserId: string;
  valid: boolean;
  checks: {
    payloadHashValid: boolean;
    signatureValid: boolean;
    chainValid: boolean;
  };
  payloadHash: string;
  computedPayloadHash: string;
  signature: string;
  expectedSignature: string;
  previousHash: string | null;
  expectedPreviousHash: string | null;
  signedAt: string;
  payload: unknown;
};

type DisputeStatus = 'OPEN' | 'REVIEWED' | 'RESOLVED' | 'REJECTED';

type DisputeRow = {
  id: number;
  tableId: string;
  raisedBy: string;
  reason: string;
  evidence: string | null;
  status: DisputeStatus;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type AuditRow = {
  id: number;
  action: string;
  actorUserId: string | null;
  tableId: string | null;
  payload: unknown;
  createdAt: string;
};

const API_URL = import.meta.env.VITE_RUMMY_API_URL || 'http://localhost:3400';

async function api<T>(
  path: string,
  opts: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || 'Request failed');
  }
  return json.data as T;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function toDateLabel(iso: string | null | undefined): string {
  if (!iso) return '-';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  return new Date(time).toLocaleString();
}

function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    urlParams.set(key, String(value));
  }
  const qs = urlParams.toString();
  return qs ? `?${qs}` : '';
}

export default function App() {
  const [name, setName] = useState('Admin Operator');
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableState, setTableState] = useState<TableState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const [newTableName, setNewTableName] = useState('Rummy Live Table');
  const [newTablePlayers, setNewTablePlayers] = useState(2);
  const [newTablePointValue, setNewTablePointValue] = useState(10);

  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [walletTxns, setWalletTxns] = useState<WalletTransaction[]>([]);

  const [reclaimCodeInput, setReclaimCodeInput] = useState('');

  const [replaySinceId, setReplaySinceId] = useState(0);
  const [replayLimit, setReplayLimit] = useState(200);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);

  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerVerify, setLedgerVerify] = useState<LedgerVerifyResponse | null>(null);

  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [resolveDisputeId, setResolveDisputeId] = useState('');
  const [resolveStatus, setResolveStatus] = useState<'REVIEWED' | 'RESOLVED' | 'REJECTED'>(
    'REVIEWED',
  );
  const [resolveNote, setResolveNote] = useState('');

  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);

  const canManage = !!auth?.token;

  const selectedSummary = useMemo(
    () => tables.find((t) => t.id === selectedTableId) || null,
    [tables, selectedTableId],
  );

  const pushLog = (line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev.slice(0, 39)]);
  };

  const loadTables = async () => {
    const data = await api<TableSummary[]>('/tables');
    setTables(data);
  };

  const loadWallet = async () => {
    if (!auth) return;
    const [walletData, txnData] = await Promise.all([
      api<WalletBalance>('/wallet/me', {}, auth.token),
      api<WalletTransaction[]>('/wallet/me/transactions?limit=20', {}, auth.token),
    ]);
    setWallet(walletData);
    setWalletTxns(txnData);
  };

  const loadTableState = async (tableId: string) => {
    if (!auth) return;
    const state = await api<TableState>(`/tables/${tableId}`, {}, auth.token);
    setTableState(state);
    if (state.mySeat?.reclaimCode) {
      setReclaimCodeInput(state.mySeat.reclaimCode);
    }
  };

  const loadReplay = async (tableId: string, sinceId = replaySinceId, limit = replayLimit) => {
    if (!auth) return;
    const data = await api<ReplayResponse>(
      `/tables/${tableId}/replay${queryString({ sinceId, limit })}`,
      {},
      auth.token,
    );
    setReplay(data);
  };

  const loadLedger = async (tableId: string) => {
    if (!auth) return;
    const data = await api<LedgerRow[]>(`/tables/${tableId}/ledger?limit=50`, {}, auth.token);
    setLedgerRows(data);
  };

  const loadDisputes = async (tableId: string) => {
    if (!auth) return;
    const data = await api<DisputeRow[]>(`/tables/${tableId}/disputes?limit=100`, {}, auth.token);
    setDisputes(data);
  };

  const loadAudit = async (tableId?: string) => {
    if (!auth) return;
    const data = await api<AuditRow[]>(
      `/audit${queryString({
        limit: 100,
        tableId,
        action: auditActionFilter.trim() || undefined,
      })}`,
      {},
      auth.token,
    );
    setAuditRows(data);
  };

  useEffect(() => {
    loadTables().catch((error: unknown) => pushLog(`load tables failed: ${toErrorMessage(error)}`));
  }, []);

  useEffect(() => {
    if (!auth) return;

    const s = io(API_URL, {
      transports: ['websocket'],
      auth: { token: auth.token },
    });

    s.on('connect', () => pushLog('socket connected'));
    s.on('disconnect', () => pushLog('socket disconnected'));
    s.on('table:list', (data: TableSummary[]) => setTables(data));
    s.on('table:state', (data: TableState) => {
      setTableState(data);
      if (data.mySeat?.reclaimCode) {
        setReclaimCodeInput(data.mySeat.reclaimCode);
      }
    });
    s.on('table:replay', (data: ReplayResponse) => {
      setReplay(data);
      pushLog(`replay received events=${data.events.length} latest=${data.latestEventId}`);
    });
    s.on('table:error', (err: { message: string }) => pushLog(`socket error: ${err.message}`));
    s.on('table:timeout', (evt: { tableId: string; userId: string }) =>
      pushLog(`timeout table=${evt.tableId} user=${evt.userId}`),
    );

    setSocket(s);

    loadWallet().catch((error: unknown) => pushLog(`wallet load failed: ${toErrorMessage(error)}`));

    return () => {
      s.disconnect();
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || !selectedTableId) return;

    loadTableState(selectedTableId).catch((error: unknown) =>
      pushLog(`table load failed: ${toErrorMessage(error)}`),
    );
    loadReplay(selectedTableId).catch((error: unknown) =>
      pushLog(`replay load failed: ${toErrorMessage(error)}`),
    );
    loadLedger(selectedTableId).catch((error: unknown) =>
      pushLog(`ledger load failed: ${toErrorMessage(error)}`),
    );
    loadDisputes(selectedTableId).catch((error: unknown) =>
      pushLog(`disputes load failed: ${toErrorMessage(error)}`),
    );
    loadAudit(selectedTableId).catch((error: unknown) =>
      pushLog(`audit load failed: ${toErrorMessage(error)}`),
    );
  }, [auth, selectedTableId]);

  useEffect(() => {
    if (!socket || !selectedTableId) return;
    socket.emit('table:subscribe', { tableId: selectedTableId });
    return () => {
      socket.emit('table:unsubscribe', { tableId: selectedTableId });
    };
  }, [socket, selectedTableId]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const data = await api<AuthData>('/auth/guest-login', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setAuth(data);
      pushLog(`logged in as ${data.user.name}`);
    } catch (error: unknown) {
      pushLog(`login failed: ${toErrorMessage(error)}`);
    }
  };

  const createTable = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    try {
      const view = await api<TableState>(
        '/tables',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newTableName,
            maxPlayers: Number(newTablePlayers),
            pointValue: Number(newTablePointValue),
          }),
        },
        auth.token,
      );
      setSelectedTableId(view.id);
      setTableState(view);
      if (view.mySeat?.reclaimCode) {
        setReclaimCodeInput(view.mySeat.reclaimCode);
      }
      pushLog(`created table ${view.name}`);
      await loadWallet();
    } catch (error: unknown) {
      pushLog(`create table failed: ${toErrorMessage(error)}`);
    }
  };

  const joinTable = async (tableId: string) => {
    if (!auth) return;
    try {
      const view = await api<TableState>(
        `/tables/${tableId}/join`,
        { method: 'POST' },
        auth.token,
      );
      setSelectedTableId(view.id);
      setTableState(view);
      if (view.mySeat?.reclaimCode) {
        setReclaimCodeInput(view.mySeat.reclaimCode);
      }
      pushLog(`joined table ${view.name}`);
      await loadWallet();
    } catch (error: unknown) {
      pushLog(`join failed: ${toErrorMessage(error)}`);
    }
  };

  const startTable = async () => {
    if (!auth || !selectedTableId) return;
    try {
      const view = await api<TableState>(
        `/tables/${selectedTableId}/start`,
        { method: 'POST' },
        auth.token,
      );
      setTableState(view);
      if (view.mySeat?.reclaimCode) {
        setReclaimCodeInput(view.mySeat.reclaimCode);
      }
      pushLog('game started');
    } catch (error: unknown) {
      pushLog(`start failed: ${toErrorMessage(error)}`);
    }
  };

  const reclaimSeat = async () => {
    if (!auth || !selectedTableId || !reclaimCodeInput.trim()) return;
    try {
      const data = await api<{ table: TableState; replay: ReplayResponse }>(
        `/tables/${selectedTableId}/reclaim`,
        {
          method: 'POST',
          body: JSON.stringify({
            reclaimCode: reclaimCodeInput.trim(),
            sinceId: replaySinceId,
            limit: replayLimit,
          }),
        },
        auth.token,
      );
      setTableState(data.table);
      setReplay(data.replay);
      if (data.table.mySeat?.reclaimCode) {
        setReclaimCodeInput(data.table.mySeat.reclaimCode);
      }
      pushLog(`seat reclaimed on table ${selectedTableId}`);
      await Promise.all([loadWallet(), loadAudit(selectedTableId)]);
    } catch (error: unknown) {
      pushLog(`reclaim failed: ${toErrorMessage(error)}`);
    }
  };

  const verifyLedger = async (ledgerId: number) => {
    if (!auth) return;
    try {
      const data = await api<LedgerVerifyResponse>(`/ledger/${ledgerId}/verify`, {}, auth.token);
      setLedgerVerify(data);
      pushLog(`ledger verified #${ledgerId} valid=${data.valid}`);
    } catch (error: unknown) {
      pushLog(`ledger verify failed: ${toErrorMessage(error)}`);
    }
  };

  const createDispute = async () => {
    if (!auth || !selectedTableId) return;
    if (disputeReason.trim().length < 5) {
      pushLog('dispute reason must be at least 5 chars');
      return;
    }
    try {
      const dispute = await api<DisputeRow>(
        `/tables/${selectedTableId}/disputes`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: disputeReason.trim(),
            evidence: disputeEvidence.trim() || undefined,
          }),
        },
        auth.token,
      );
      setDisputeReason('');
      setDisputeEvidence('');
      pushLog(`dispute created #${dispute.id}`);
      await Promise.all([loadDisputes(selectedTableId), loadAudit(selectedTableId)]);
    } catch (error: unknown) {
      pushLog(`dispute create failed: ${toErrorMessage(error)}`);
    }
  };

  const resolveDispute = async () => {
    if (!auth || !selectedTableId) return;
    const disputeId = toInt(resolveDisputeId, 0);
    if (!disputeId || resolveNote.trim().length < 3) {
      pushLog('provide dispute id and resolution note (3+ chars)');
      return;
    }
    try {
      await api<DisputeRow>(
        `/disputes/${disputeId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: resolveStatus,
            resolutionNote: resolveNote.trim(),
          }),
        },
        auth.token,
      );
      setResolveNote('');
      pushLog(`dispute resolved #${disputeId} -> ${resolveStatus}`);
      await Promise.all([loadDisputes(selectedTableId), loadAudit(selectedTableId)]);
    } catch (error: unknown) {
      pushLog(`dispute resolve failed: ${toErrorMessage(error)}`);
    }
  };

  return (
    <div className="layout">
      <header className="topbar">
        <h1>Rummy Live Admin</h1>
        <span className="api-tag">{API_URL}</span>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Session</h2>
          {!auth ? (
            <form onSubmit={login} className="stack">
              <input value={name} onChange={(e) => setName(e.target.value)} />
              <button type="submit">Login Guest</button>
            </form>
          ) : (
            <p className="muted">
              Logged in: <strong>{auth.user.name}</strong> ({auth.user.userId})
            </p>
          )}

          <h3>Wallet</h3>
          {!wallet ? (
            <p className="muted">Wallet unavailable.</p>
          ) : (
            <div className="stack">
              <div className="kv">
                <span>Balance</span>
                <strong>{wallet.balance}</strong>
              </div>
              <div className="kv">
                <span>Updated</span>
                <strong>{toDateLabel(wallet.updatedAt)}</strong>
              </div>
              <button onClick={() => loadWallet().catch((error: unknown) => pushLog(toErrorMessage(error)))}>
                Refresh Wallet
              </button>
            </div>
          )}

          <h3>Create Table</h3>
          <form onSubmit={createTable} className="stack">
            <input
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="Table name"
              disabled={!canManage}
            />
            <input
              type="number"
              min={2}
              max={6}
              value={newTablePlayers}
              onChange={(e) => setNewTablePlayers(toInt(e.target.value, 2))}
              disabled={!canManage}
            />
            <input
              type="number"
              min={1}
              max={1000}
              value={newTablePointValue}
              onChange={(e) => setNewTablePointValue(toInt(e.target.value, 10))}
              disabled={!canManage}
            />
            <button type="submit" disabled={!canManage}>
              Create
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-row">
            <h2>Tables</h2>
            <button onClick={() => loadTables().catch((error: unknown) => pushLog(toErrorMessage(error)))}>
              Refresh
            </button>
          </div>
          <div className="table-list">
            {tables.map((t) => (
              <button
                key={t.id}
                className={`table-card ${selectedTableId === t.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTableId(t.id);
                  setTableState(null);
                  setReplay(null);
                  setLedgerVerify(null);
                }}
              >
                <strong>{t.name}</strong>
                <span>{t.currentPlayers}/{t.maxPlayers}</span>
                <span>{t.status}</span>
              </button>
            ))}
            {tables.length === 0 && <p className="muted">No tables yet.</p>}
          </div>
          <div className="actions">
            <button
              disabled={!selectedSummary || !canManage}
              onClick={() => selectedSummary && joinTable(selectedSummary.id)}
            >
              Join
            </button>
            <button disabled={!selectedSummary || !canManage} onClick={startTable}>
              Start
            </button>
          </div>

          <h3>Reconnect</h3>
          <div className="stack">
            <input
              placeholder="Reclaim code"
              value={reclaimCodeInput}
              onChange={(e) => setReclaimCodeInput(e.target.value)}
              disabled={!selectedSummary || !canManage}
            />
            <div className="inline">
              <label className="muted small">Since</label>
              <input
                type="number"
                value={replaySinceId}
                onChange={(e) => setReplaySinceId(toInt(e.target.value, 0))}
              />
              <label className="muted small">Limit</label>
              <input
                type="number"
                value={replayLimit}
                onChange={(e) => setReplayLimit(Math.max(1, toInt(e.target.value, 200)))}
              />
            </div>
            <div className="actions">
              <button disabled={!selectedSummary || !canManage} onClick={reclaimSeat}>
                Reclaim Seat
              </button>
              <button
                disabled={!selectedSummary || !canManage}
                onClick={() =>
                  selectedSummary &&
                  loadReplay(selectedSummary.id).catch((error: unknown) =>
                    pushLog(`replay failed: ${toErrorMessage(error)}`),
                  )
                }
              >
                Pull Replay
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Live Table State</h2>
          {!tableState ? (
            <p className="muted">Select a table to view details.</p>
          ) : (
            <div className="stack">
              <div className="kv"><span>Status</span><strong>{tableState.status}</strong></div>
              <div className="kv"><span>Players</span><strong>{tableState.currentPlayers}/{tableState.maxPlayers}</strong></div>
              <div className="kv"><span>Point Value</span><strong>{tableState.pointValue}</strong></div>
              <div className="kv"><span>Host</span><strong>{tableState.hostUserId}</strong></div>
              <div className="kv"><span>My Seat</span><strong>{tableState.mySeat ? `#${tableState.mySeat.seatNo}` : '-'}</strong></div>
              <div className="kv"><span>My Reclaim Code</span><strong className="mono">{tableState.mySeat?.reclaimCode || '-'}</strong></div>

              {tableState.game && (
                <>
                  <div className="kv"><span>Turn User</span><strong>{tableState.game.turn.userId}</strong></div>
                  <div className="kv"><span>Turn No</span><strong>{tableState.game.turn.turnNo}</strong></div>
                  <div className="kv"><span>Open Top</span><strong>{tableState.game.openTop || '-'}</strong></div>
                  <div className="kv"><span>Closed Count</span><strong>{tableState.game.closedCount}</strong></div>
                  <div className="kv"><span>Joker</span><strong>{tableState.game.jokerCard || '-'}</strong></div>
                  <div className="kv"><span>Active</span><strong>{tableState.game.activePlayers}</strong></div>
                  <div className="kv"><span>Winner</span><strong>{tableState.game.winnerUserId || '-'}</strong></div>
                  <div className="kv"><span>Finished</span><strong>{toDateLabel(tableState.game.finishedAt)}</strong></div>
                  <div className="kv"><span>Ledger</span><strong>{tableState.game.resultLedger?.ledgerId || '-'}</strong></div>
                </>
              )}

              <h3>Seats</h3>
              {tableState.seats.map((s) => (
                <div key={`${s.userId}-${s.seatNo}`} className="seat">
                  <span>#{s.seatNo} {s.name}</span>
                  <span>{s.status} | score {s.score}</span>
                  <span>{s.hand ? `${s.hand.length} cards` : `${s.handCount || 0} cards`}</span>
                  <span className={`chip ${s.connected ? 'ok' : 'warn'}`}>
                    {s.connected ? 'connected' : 'offline'}
                  </span>
                  <span className="muted small">{toDateLabel(s.lastSeenAt)}</span>
                </div>
              ))}

              {tableState.game?.settlement && (
                <>
                  <h3>Settlement</h3>
                  {tableState.game.settlement.entries.map((entry) => (
                    <div key={entry.userId} className="seat">
                      <span>{entry.name}</span>
                      <span>{entry.result}</span>
                      <span>{entry.points} pts / {entry.amount}</span>
                      <span>{entry.walletBefore}{' -> '}{entry.walletAfter}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-row">
            <h2>Replay</h2>
            <button
              disabled={!selectedSummary || !canManage}
              onClick={() =>
                selectedSummary &&
                loadReplay(selectedSummary.id).catch((error: unknown) =>
                  pushLog(`replay failed: ${toErrorMessage(error)}`),
                )
              }
            >
              Reload
            </button>
          </div>
          {!replay ? (
            <p className="muted">No replay loaded.</p>
          ) : (
            <div className="stack">
              <div className="kv"><span>Since</span><strong>{replay.sinceId}</strong></div>
              <div className="kv"><span>Latest</span><strong>{replay.latestEventId}</strong></div>
              <div className="kv"><span>Events</span><strong>{replay.events.length}</strong></div>
              <div className="scroll mono">
                {replay.events.map((event) => (
                  <div key={event.id}>
                    #{event.id} {event.eventType} {toDateLabel(event.createdAt)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-row">
            <h2>Ledger</h2>
            <button
              disabled={!selectedSummary || !canManage}
              onClick={() =>
                selectedSummary &&
                loadLedger(selectedSummary.id).catch((error: unknown) =>
                  pushLog(`ledger failed: ${toErrorMessage(error)}`),
                )
              }
            >
              Reload
            </button>
          </div>
          <div className="scroll">
            {ledgerRows.map((entry) => (
              <div key={entry.id} className="seat">
                <span>#{entry.id}</span>
                <span>{entry.winnerUserId}</span>
                <span className="muted small">{toDateLabel(entry.createdAt)}</span>
                <button onClick={() => verifyLedger(entry.id)}>Verify</button>
              </div>
            ))}
            {ledgerRows.length === 0 && <p className="muted">No ledger rows yet.</p>}
          </div>
          {ledgerVerify && (
            <div className="stack">
              <h3>Verify Result</h3>
              <div className="kv"><span>Ledger</span><strong>#{ledgerVerify.ledgerId}</strong></div>
              <div className="kv"><span>Valid</span><strong>{ledgerVerify.valid ? 'YES' : 'NO'}</strong></div>
              <div className="kv"><span>Payload Hash</span><strong>{ledgerVerify.checks.payloadHashValid ? 'OK' : 'FAIL'}</strong></div>
              <div className="kv"><span>Signature</span><strong>{ledgerVerify.checks.signatureValid ? 'OK' : 'FAIL'}</strong></div>
              <div className="kv"><span>Chain</span><strong>{ledgerVerify.checks.chainValid ? 'OK' : 'FAIL'}</strong></div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Disputes</h2>
          <div className="stack">
            <textarea
              placeholder="Reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={3}
              disabled={!selectedSummary || !canManage}
            />
            <textarea
              placeholder="Evidence (optional)"
              value={disputeEvidence}
              onChange={(e) => setDisputeEvidence(e.target.value)}
              rows={2}
              disabled={!selectedSummary || !canManage}
            />
            <div className="actions">
              <button disabled={!selectedSummary || !canManage} onClick={createDispute}>
                Raise Dispute
              </button>
              <button
                disabled={!selectedSummary || !canManage}
                onClick={() =>
                  selectedSummary &&
                  loadDisputes(selectedSummary.id).catch((error: unknown) =>
                    pushLog(`dispute load failed: ${toErrorMessage(error)}`),
                  )
                }
              >
                Reload
              </button>
            </div>

            <h3>Resolve Dispute</h3>
            <input
              placeholder="Dispute id"
              value={resolveDisputeId}
              onChange={(e) => setResolveDisputeId(e.target.value)}
            />
            <select
              value={resolveStatus}
              onChange={(e) => setResolveStatus(e.target.value as 'REVIEWED' | 'RESOLVED' | 'REJECTED')}
            >
              <option value="REVIEWED">REVIEWED</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
            <textarea
              placeholder="Resolution note"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={2}
            />
            <button disabled={!selectedSummary || !canManage} onClick={resolveDispute}>
              Resolve
            </button>
          </div>

          <div className="scroll">
            {disputes.map((entry) => (
              <div key={entry.id} className="seat">
                <span>#{entry.id}</span>
                <span>{entry.status}</span>
                <span className="muted small">{entry.raisedBy}</span>
                <span className="muted small">{toDateLabel(entry.createdAt)}</span>
              </div>
            ))}
            {disputes.length === 0 && <p className="muted">No disputes yet.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-row">
            <h2>Audit</h2>
            <button
              disabled={!canManage}
              onClick={() =>
                loadAudit(selectedTableId || undefined).catch((error: unknown) =>
                  pushLog(`audit failed: ${toErrorMessage(error)}`),
                )
              }
            >
              Reload
            </button>
          </div>
          <div className="inline">
            <input
              placeholder="Action filter (optional)"
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
            />
            <button
              disabled={!canManage}
              onClick={() =>
                loadAudit(selectedTableId || undefined).catch((error: unknown) =>
                  pushLog(`audit failed: ${toErrorMessage(error)}`),
                )
              }
            >
              Apply
            </button>
          </div>
          <div className="scroll mono">
            {auditRows.map((row) => (
              <div key={row.id}>
                #{row.id} {row.action} actor={row.actorUserId || '-'} {toDateLabel(row.createdAt)}
              </div>
            ))}
            {auditRows.length === 0 && <p className="muted">No audit rows.</p>}
          </div>

          <h3>Wallet Transactions</h3>
          <div className="scroll mono">
            {walletTxns.map((txn) => (
              <div key={txn.id}>
                #{txn.id} {txn.type} {txn.amount} ({txn.balanceBefore}{' -> '}{txn.balanceAfter})
              </div>
            ))}
            {walletTxns.length === 0 && <p className="muted">No wallet transactions.</p>}
          </div>
        </section>

        <section className="panel">
          <h2>Activity</h2>
          <div className="log">
            {log.map((line, idx) => (
              <div key={`${idx}-${line}`}>{line}</div>
            ))}
            {log.length === 0 && <p className="muted">No activity yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
