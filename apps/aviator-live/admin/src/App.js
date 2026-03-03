import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
const API_URL = (import.meta.env.VITE_AVIATOR_API_URL || 'http://localhost:3501').replace(/\/+$/, '');
const STORAGE_KEY = 'aviator_admin_session';
async function apiRequest(path, token, init) {
    const headers = new Headers(init?.headers || {});
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const json = await response.json();
    if (!response.ok) {
        throw new Error(json.message || 'Request failed');
    }
    return json.data;
}
function formatCurrency(value) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatTime(iso) {
    if (!iso)
        return '--';
    return new Date(iso).toLocaleTimeString();
}
export default function App() {
    const [email, setEmail] = useState('admin@aviator.live');
    const [password, setPassword] = useState('change-me-now');
    const [auth, setAuth] = useState(null);
    const [monitor, setMonitor] = useState(null);
    const [configDraft, setConfigDraft] = useState(null);
    const [socketOnline, setSocketOnline] = useState(false);
    const [loading, setLoading] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [error, setError] = useState(null);
    const [events, setEvents] = useState([]);
    useEffect(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return;
        try {
            const parsed = JSON.parse(raw);
            setAuth(parsed);
        }
        catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);
    const appendEvent = (message) => {
        setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${message}`, ...prev].slice(0, 28));
    };
    const loadMonitor = async (token) => {
        const payload = await apiRequest('/aviator/admin/live-monitor', token);
        setMonitor(payload);
        setConfigDraft((current) => current || payload.config);
    };
    useEffect(() => {
        if (!auth)
            return;
        let stopped = false;
        const tick = async () => {
            try {
                await loadMonitor(auth.token);
            }
            catch (err) {
                if (!stopped)
                    setError(err.message || 'Failed to fetch monitor');
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
        if (!auth)
            return;
        const socket = io(API_URL, {
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
        socket.on('round:created', (payload) => {
            appendEvent(`round created #${payload.roundNumber}`);
            void loadMonitor(auth.token);
        });
        socket.on('round:locked', () => {
            appendEvent('round locked');
            void loadMonitor(auth.token);
        });
        socket.on('aviator:takeoff', (payload) => {
            appendEvent(`takeoff #${payload.roundNumber}`);
            setMonitor((current) => current?.round
                ? {
                    ...current,
                    round: { ...current.round, status: 'PLAYING' },
                }
                : current);
        });
        socket.on('aviator:multiplier', (payload) => {
            setMonitor((current) => current?.round?.id === payload.roundId
                ? {
                    ...current,
                    round: { ...current.round, currentMultiplier: payload.multiplier },
                }
                : current);
        });
        socket.on('aviator:crash', (payload) => {
            appendEvent(`crash #${payload.roundNumber} at ${payload.crashPoint.toFixed(2)}x`);
            void loadMonitor(auth.token);
        });
        socket.on('round:settled', (payload) => {
            appendEvent(`settled #${payload.roundNumber}, payout Rs ${formatCurrency(payload.settlement.totalPayout)}`);
            void loadMonitor(auth.token);
        });
        socket.on('aviator:config:updated', (payload) => {
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
            const next = { token: json.data.token, user: json.data.user };
            setAuth(next);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
        catch (err) {
            setError(err.message || 'Admin login failed');
        }
        finally {
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
        if (!auth || !configDraft)
            return;
        setSavingConfig(true);
        setError(null);
        try {
            const payload = {
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
            const saved = await apiRequest('/aviator/admin/config', auth.token, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
            setConfigDraft(saved);
            appendEvent('config saved from dashboard');
        }
        catch (err) {
            setError(err.message || 'Failed to save config');
        }
        finally {
            setSavingConfig(false);
        }
    };
    const statusTone = useMemo(() => {
        const status = monitor?.round?.status;
        if (status === 'PLAYING')
            return 'tone-live';
        if (status === 'BETTING')
            return 'tone-betting';
        if (status === 'LOCKED')
            return 'tone-locked';
        if (status === 'SETTLED')
            return 'tone-settled';
        return 'tone-idle';
    }, [monitor?.round?.status]);
    if (!auth) {
        return (_jsx("main", { className: "page login-page", children: _jsxs("section", { className: "panel login-panel", children: [_jsx("h1", { children: "Aviator Admin" }), _jsx("p", { children: "Live monitor and game controls" }), _jsx("label", { children: "Email" }), _jsx("input", { value: email, onChange: (e) => setEmail(e.target.value) }), _jsx("label", { children: "Password" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value) }), _jsx("button", { onClick: handleLogin, disabled: loading, children: loading ? 'Signing in...' : 'Sign in as Admin' }), error ? _jsx("p", { className: "error", children: error }) : null] }) }));
    }
    return (_jsxs("main", { className: "page dashboard-page", children: [_jsxs("header", { className: "topbar", children: [_jsxs("div", { children: [_jsx("h1", { children: "Aviator Live Control" }), _jsxs("p", { children: [auth.user.name, " | API ", API_URL] })] }), _jsxs("div", { className: "topbar-right", children: [_jsx("span", { className: `socket-pill ${socketOnline ? 'socket-online' : 'socket-offline'}`, children: socketOnline ? 'Socket Live' : 'Socket Down' }), _jsx("button", { className: "ghost", onClick: handleLogout, children: "Logout" })] })] }), error ? _jsx("p", { className: "error global-error", children: error }) : null, _jsxs("section", { className: "grid metrics", children: [_jsxs("article", { className: `metric-card ${statusTone}`, children: [_jsx("h3", { children: "Round State" }), _jsx("p", { className: "metric-main", children: monitor?.round ? `#${monitor.round.roundNumber}` : '--' }), _jsx("p", { className: "metric-sub", children: monitor?.round?.status || 'IDLE' })] }), _jsxs("article", { className: "metric-card", children: [_jsx("h3", { children: "Multiplier" }), _jsx("p", { className: "metric-main", children: monitor?.round?.currentMultiplier ? `${monitor.round.currentMultiplier.toFixed(2)}x` : '--' }), _jsxs("p", { className: "metric-sub", children: ["Last crash ", monitor?.round?.crashPoint ? `${monitor.round.crashPoint}x` : '--'] })] }), _jsxs("article", { className: "metric-card", children: [_jsx("h3", { children: "Total Staked" }), _jsxs("p", { className: "metric-main", children: ["Rs ", formatCurrency(monitor?.metrics.totalStaked || 0)] }), _jsxs("p", { className: "metric-sub", children: ["Payout Rs ", formatCurrency(monitor?.metrics.totalPayout || 0)] })] }), _jsxs("article", { className: "metric-card", children: [_jsx("h3", { children: "Players/Bets" }), _jsx("p", { className: "metric-main", children: monitor?.metrics.activePlayers || 0 }), _jsxs("p", { className: "metric-sub", children: [monitor?.metrics.totalBets || 0, " bets"] })] })] }), _jsxs("section", { className: "grid body-grid", children: [_jsxs("article", { className: "panel config-panel", children: [_jsx("h2", { children: "Runtime Config" }), _jsxs("div", { className: "config-grid", children: [_jsxs("label", { children: ["Min Bet", _jsx("input", { type: "number", value: configDraft?.minBet ?? '', onChange: (e) => setConfigDraft((current) => (current ? { ...current, minBet: Number(e.target.value) } : current)) })] }), _jsxs("label", { children: ["Max Bet", _jsx("input", { type: "number", value: configDraft?.maxBet ?? '', onChange: (e) => setConfigDraft((current) => (current ? { ...current, maxBet: Number(e.target.value) } : current)) })] }), _jsxs("label", { children: ["Betting Window (s)", _jsx("input", { type: "number", value: configDraft?.bettingWindowSeconds ?? '', onChange: (e) => setConfigDraft((current) => current ? { ...current, bettingWindowSeconds: Number(e.target.value) } : current) })] }), _jsxs("label", { children: ["Lock (s)", _jsx("input", { type: "number", value: configDraft?.lockSeconds ?? '', onChange: (e) => setConfigDraft((current) => (current ? { ...current, lockSeconds: Number(e.target.value) } : current)) })] }), _jsxs("label", { children: ["Waiting (s)", _jsx("input", { type: "number", value: configDraft?.waitingSeconds ?? '', onChange: (e) => setConfigDraft((current) => (current ? { ...current, waitingSeconds: Number(e.target.value) } : current)) })] }), _jsxs("label", { children: ["Tick (ms)", _jsx("input", { type: "number", value: configDraft?.multiplierTickMs ?? '', onChange: (e) => setConfigDraft((current) => current ? { ...current, multiplierTickMs: Number(e.target.value) } : current) })] }), _jsxs("label", { children: ["Growth (ms)", _jsx("input", { type: "number", value: configDraft?.multiplierGrowthMs ?? '', onChange: (e) => setConfigDraft((current) => current ? { ...current, multiplierGrowthMs: Number(e.target.value) } : current) })] }), _jsxs("label", { children: ["Max Crash Point", _jsx("input", { type: "number", value: configDraft?.maxCrashPoint ?? '', onChange: (e) => setConfigDraft((current) => current ? { ...current, maxCrashPoint: Number(e.target.value) } : current) })] }), _jsxs("label", { className: "toggle", children: ["Maintenance Mode", _jsx("input", { type: "checkbox", checked: Boolean(configDraft?.maintenanceMode), onChange: (e) => setConfigDraft((current) => current ? { ...current, maintenanceMode: e.target.checked } : current) })] })] }), _jsx("button", { onClick: saveConfig, disabled: savingConfig || !configDraft, children: savingConfig ? 'Saving...' : 'Save Runtime Config' })] }), _jsxs("article", { className: "panel side-panel", children: [_jsx("h2", { children: "Round Metrics" }), _jsxs("ul", { className: "metrics-list", children: [_jsxs("li", { children: [_jsx("span", { children: "Placed" }), _jsx("strong", { children: monitor?.metrics.placed || 0 })] }), _jsxs("li", { children: [_jsx("span", { children: "Won" }), _jsx("strong", { children: monitor?.metrics.won || 0 })] }), _jsxs("li", { children: [_jsx("span", { children: "Lost" }), _jsx("strong", { children: monitor?.metrics.lost || 0 })] }), _jsxs("li", { children: [_jsx("span", { children: "Cancelled" }), _jsx("strong", { children: monitor?.metrics.cancelled || 0 })] }), _jsxs("li", { children: [_jsx("span", { children: "Betting Ends" }), _jsx("strong", { children: formatTime(monitor?.round?.bettingEndAt) })] })] })] })] }), _jsxs("section", { className: "panel event-panel", children: [_jsx("h2", { children: "Live Event Tape" }), events.length === 0 ? (_jsx("p", { className: "muted", children: "Waiting for events..." })) : (_jsx("ul", { className: "event-list", children: events.map((event) => (_jsx("li", { children: event }, event))) }))] })] }));
}
