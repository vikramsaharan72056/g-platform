import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type AdminUser = {
  userId: string;
  name: string;
  role: 'ADMIN';
};

type RuntimeConfig = {
  minBet: number;
  maxBet: number;
  bettingWindowSeconds: number;
  lockSeconds: number;
  waitingSeconds: number;
  multiplierTickMs: number;
  multiplierGrowthMs: number;
  maxCrashPoint: number;
  maintenanceMode: boolean;
};

type MonitorPayload = {
  round: null | {
    id: string;
    roundNumber: number;
    status: string;
    bettingEndAt: string;
    crashPoint: number | null;
    hash: string;
    currentMultiplier: number | null;
  };
  metrics: {
    totalBets: number;
    activePlayers: number;
    totalStaked: number;
    totalPayout: number;
    placed: number;
    won: number;
    lost: number;
    cancelled: number;
  };
  config: RuntimeConfig;
};

const API_URL = (import.meta.env.VITE_AVIATOR_API_URL || 'http://localhost:3501').replace(/\/+$/, '');
const STORAGE_KEY = 'aviator_admin_session';

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || 'Request failed');
  }
  return json.data as T;
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString();
}

export default function App() {
  const [email, setEmail] = useState('admin@aviator.live');
  const [password, setPassword] = useState('change-me-now');
  const [auth, setAuth] = useState<{ token: string; user: AdminUser } | null>(null);
  const [monitor, setMonitor] = useState<MonitorPayload | null>(null);
  const [configDraft, setConfigDraft] = useState<RuntimeConfig | null>(null);
  const [socketOnline, setSocketOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { token: string; user: AdminUser };
      setAuth(parsed);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const appendEvent = (message: string) => {
    setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${message}`, ...prev].slice(0, 28));
  };

  const loadMonitor = async (token: string) => {
    const payload = await apiRequest<MonitorPayload>('/aviator/admin/live-monitor', token);
    setMonitor(payload);
    setConfigDraft((current) => current || payload.config);
  };

  useEffect(() => {
    if (!auth) return;
    let stopped = false;
    const tick = async () => {
      try {
        await loadMonitor(auth.token);
      } catch (err: any) {
        if (!stopped) setError(err.message || 'Failed to fetch monitor');
      }
    };
    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    const socket: Socket = io(API_URL, {
      auth: { token: auth.token },
    });

    socket.on('connect', () => {
      setSocketOnline(true);
      appendEvent('socket connected');
    });

    socket.on('disconnect', () => {
      setSocketOnline(false);
      appendEvent('socket disconnected');
    });

    socket.on('round:created', (payload: { roundNumber: number }) => {
      appendEvent(`round created #${payload.roundNumber}`);
      void loadMonitor(auth.token);
    });

    socket.on('round:locked', () => {
      appendEvent('round locked');
      void loadMonitor(auth.token);
    });

    socket.on('aviator:takeoff', (payload: { roundNumber: number }) => {
      appendEvent(`takeoff #${payload.roundNumber}`);
      setMonitor((current) =>
        current?.round
          ? {
              ...current,
              round: { ...current.round, status: 'PLAYING' },
            }
          : current,
      );
    });

    socket.on('aviator:multiplier', (payload: { multiplier: number; roundId: string }) => {
      setMonitor((current) =>
        current?.round?.id === payload.roundId
          ? {
              ...current,
              round: { ...current.round, currentMultiplier: payload.multiplier },
            }
          : current,
      );
    });

    socket.on('aviator:crash', (payload: { crashPoint: number; roundNumber: number }) => {
      appendEvent(`crash #${payload.roundNumber} at ${payload.crashPoint.toFixed(2)}x`);
      void loadMonitor(auth.token);
    });

    socket.on('round:settled', (payload: { roundNumber: number; settlement: { totalPayout: number } }) => {
      appendEvent(`settled #${payload.roundNumber}, payout Rs ${formatCurrency(payload.settlement.totalPayout)}`);
      void loadMonitor(auth.token);
    });

    socket.on('aviator:config:updated', (payload: { config: RuntimeConfig }) => {
      setConfigDraft(payload.config);
      appendEvent('runtime config updated');
      void loadMonitor(auth.token);
    });

    return () => {
      socket.disconnect();
    };
  }, [auth]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetch(`${API_URL}/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await data.json();
      if (!data.ok) {
        throw new Error(json.message || 'Admin login failed');
      }
      const next = { token: json.data.token as string, user: json.data.user as AdminUser };
      setAuth(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err: any) {
      setError(err.message || 'Admin login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuth(null);
    setMonitor(null);
    setConfigDraft(null);
    setEvents([]);
    setSocketOnline(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const saveConfig = async () => {
    if (!auth || !configDraft) return;
    setSavingConfig(true);
    setError(null);
    try {
      const payload: RuntimeConfig = {
        ...configDraft,
        minBet: Number(configDraft.minBet),
        maxBet: Number(configDraft.maxBet),
        bettingWindowSeconds: Number(configDraft.bettingWindowSeconds),
        lockSeconds: Number(configDraft.lockSeconds),
        waitingSeconds: Number(configDraft.waitingSeconds),
        multiplierTickMs: Number(configDraft.multiplierTickMs),
        multiplierGrowthMs: Number(configDraft.multiplierGrowthMs),
        maxCrashPoint: Number(configDraft.maxCrashPoint),
      };
      const saved = await apiRequest<RuntimeConfig>('/aviator/admin/config', auth.token, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setConfigDraft(saved);
      appendEvent('config saved from dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  };

  const statusTone = useMemo(() => {
    const status = monitor?.round?.status;
    if (status === 'PLAYING') return 'tone-live';
    if (status === 'BETTING') return 'tone-betting';
    if (status === 'LOCKED') return 'tone-locked';
    if (status === 'SETTLED') return 'tone-settled';
    return 'tone-idle';
  }, [monitor?.round?.status]);

  if (!auth) {
    return (
      <main className="page login-page">
        <section className="panel login-panel">
          <h1>Aviator Admin</h1>
          <p>Live monitor and game controls</p>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button onClick={handleLogin} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in as Admin'}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="page dashboard-page">
      <header className="topbar">
        <div>
          <h1>Aviator Live Control</h1>
          <p>
            {auth.user.name} | API {API_URL}
          </p>
        </div>
        <div className="topbar-right">
          <span className={`socket-pill ${socketOnline ? 'socket-online' : 'socket-offline'}`}>
            {socketOnline ? 'Socket Live' : 'Socket Down'}
          </span>
          <button className="ghost" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {error ? <p className="error global-error">{error}</p> : null}

      <section className="grid metrics">
        <article className={`metric-card ${statusTone}`}>
          <h3>Round State</h3>
          <p className="metric-main">{monitor?.round ? `#${monitor.round.roundNumber}` : '--'}</p>
          <p className="metric-sub">{monitor?.round?.status || 'IDLE'}</p>
        </article>
        <article className="metric-card">
          <h3>Multiplier</h3>
          <p className="metric-main">
            {monitor?.round?.currentMultiplier ? `${monitor.round.currentMultiplier.toFixed(2)}x` : '--'}
          </p>
          <p className="metric-sub">Last crash {monitor?.round?.crashPoint ? `${monitor.round.crashPoint}x` : '--'}</p>
        </article>
        <article className="metric-card">
          <h3>Total Staked</h3>
          <p className="metric-main">Rs {formatCurrency(monitor?.metrics.totalStaked || 0)}</p>
          <p className="metric-sub">Payout Rs {formatCurrency(monitor?.metrics.totalPayout || 0)}</p>
        </article>
        <article className="metric-card">
          <h3>Players/Bets</h3>
          <p className="metric-main">{monitor?.metrics.activePlayers || 0}</p>
          <p className="metric-sub">{monitor?.metrics.totalBets || 0} bets</p>
        </article>
      </section>

      <section className="grid body-grid">
        <article className="panel config-panel">
          <h2>Runtime Config</h2>
          <div className="config-grid">
            <label>
              Min Bet
              <input
                type="number"
                value={configDraft?.minBet ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) => (current ? { ...current, minBet: Number(e.target.value) } : current))
                }
              />
            </label>
            <label>
              Max Bet
              <input
                type="number"
                value={configDraft?.maxBet ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) => (current ? { ...current, maxBet: Number(e.target.value) } : current))
                }
              />
            </label>
            <label>
              Betting Window (s)
              <input
                type="number"
                value={configDraft?.bettingWindowSeconds ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) =>
                    current ? { ...current, bettingWindowSeconds: Number(e.target.value) } : current,
                  )
                }
              />
            </label>
            <label>
              Lock (s)
              <input
                type="number"
                value={configDraft?.lockSeconds ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) => (current ? { ...current, lockSeconds: Number(e.target.value) } : current))
                }
              />
            </label>
            <label>
              Waiting (s)
              <input
                type="number"
                value={configDraft?.waitingSeconds ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) => (current ? { ...current, waitingSeconds: Number(e.target.value) } : current))
                }
              />
            </label>
            <label>
              Tick (ms)
              <input
                type="number"
                value={configDraft?.multiplierTickMs ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) =>
                    current ? { ...current, multiplierTickMs: Number(e.target.value) } : current,
                  )
                }
              />
            </label>
            <label>
              Growth (ms)
              <input
                type="number"
                value={configDraft?.multiplierGrowthMs ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) =>
                    current ? { ...current, multiplierGrowthMs: Number(e.target.value) } : current,
                  )
                }
              />
            </label>
            <label>
              Max Crash Point
              <input
                type="number"
                value={configDraft?.maxCrashPoint ?? ''}
                onChange={(e) =>
                  setConfigDraft((current) =>
                    current ? { ...current, maxCrashPoint: Number(e.target.value) } : current,
                  )
                }
              />
            </label>
            <label className="toggle">
              Maintenance Mode
              <input
                type="checkbox"
                checked={Boolean(configDraft?.maintenanceMode)}
                onChange={(e) =>
                  setConfigDraft((current) =>
                    current ? { ...current, maintenanceMode: e.target.checked } : current,
                  )
                }
              />
            </label>
          </div>
          <button onClick={saveConfig} disabled={savingConfig || !configDraft}>
            {savingConfig ? 'Saving...' : 'Save Runtime Config'}
          </button>
        </article>

        <article className="panel side-panel">
          <h2>Round Metrics</h2>
          <ul className="metrics-list">
            <li>
              <span>Placed</span>
              <strong>{monitor?.metrics.placed || 0}</strong>
            </li>
            <li>
              <span>Won</span>
              <strong>{monitor?.metrics.won || 0}</strong>
            </li>
            <li>
              <span>Lost</span>
              <strong>{monitor?.metrics.lost || 0}</strong>
            </li>
            <li>
              <span>Cancelled</span>
              <strong>{monitor?.metrics.cancelled || 0}</strong>
            </li>
            <li>
              <span>Betting Ends</span>
              <strong>{formatTime(monitor?.round?.bettingEndAt)}</strong>
            </li>
          </ul>
        </article>
      </section>

      <section className="panel event-panel">
        <h2>Live Event Tape</h2>
        {events.length === 0 ? (
          <p className="muted">Waiting for events...</p>
        ) : (
          <ul className="event-list">
            {events.map((event) => (
              <li key={event}>{event}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

