import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { gamesAPI, liveMonitorAPI } from '../services/api';

type TableSummary = {
    id: string;
    name: string;
    status: string;
    maxPlayers: number;
    currentPlayers: number;
    betAmount: number;
    playerIds?: string[];
};

type TableState = {
    id: string;
    name: string;
    status: string;
    betAmount: number;
    currentPlayers: number;
    maxPlayers: number;
    seats?: Array<{
        seatNo: number;
        name: string;
        userId: string;
        status: string;
        connected?: boolean;
        timeoutCount?: number;
    }>;
    game?: {
        turn?: {
            userId: string;
            turnNo: number;
            expiresAt: string;
        };
        winnerUserId?: string | null;
    } | null;
    betControl?: {
        isBlocked: boolean;
        blockedBy: string | null;
        blockedReason: string | null;
        blockedAt: string | null;
        activeProposal: BetChangeProposal | null;
        lastResolvedProposal: BetChangeProposal | null;
    };
};

type BetChangeProposal = {
    id: string;
    requestedAmount: number;
    currentAmount: number;
    proposedByUserId: string;
    proposedByName: string;
    status: 'PENDING_PLAYERS' | 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED';
    playerApprovals: string[];
    playerRejections: string[];
    adminDecisionBy: string | null;
    adminDecisionReason: string | null;
    createdAt: string;
    updatedAt: string;
};

type ChatMessage = {
    id: string;
    tableId: string;
    userId: string;
    userName: string;
    role: 'PLAYER' | 'ADMIN' | 'SYSTEM';
    message: string;
    createdAt: string;
};

type TimeoutPayload = {
    tableId: string;
    userId: string;
    message: string;
};

type MonitorEvent = {
    id: string;
    level: 'info' | 'warn' | 'error';
    title: string;
    details: string;
    at: Date;
};

const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || window.location.origin;

export default function LiveMonitorPage() {
    const [tables, setTables] = useState<TableSummary[]>([]);
    const [tableStates, setTableStates] = useState<Record<string, TableState>>({});
    const [tableChats, setTableChats] = useState<Record<string, ChatMessage[]>>({});
    const [selectedTableId, setSelectedTableId] = useState<string>('');
    const [moderationReason, setModerationReason] = useState('');
    const [chatDraft, setChatDraft] = useState('');
    const [events, setEvents] = useState<MonitorEvent[]>([]);
    const [connected, setConnected] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [chatLoading, setChatLoading] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const subscriptionsRef = useRef<Set<string>>(new Set());

    const pushEvent = (level: MonitorEvent['level'], title: string, details: string) => {
        setEvents((prev) => [
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                level,
                title,
                details,
                at: new Date(),
            },
            ...prev.slice(0, 79),
        ]);
    };

    const syncSubscriptions = (socket: Socket, nextTableIds: string[]) => {
        const current = subscriptionsRef.current;
        const next = new Set(nextTableIds);

        for (const tableId of current) {
            if (next.has(tableId)) continue;
            socket.emit('table:unsubscribe', { tableId });
            current.delete(tableId);
        }

        for (const tableId of next) {
            if (current.has(tableId)) continue;
            socket.emit('table:subscribe', { tableId });
            current.add(tableId);
        }
    };

    const appendChatMessage = (message: ChatMessage) => {
        setTableChats((prev) => {
            const existing = prev[message.tableId] || [];
            return {
                ...prev,
                [message.tableId]: [...existing, message].slice(-300),
            };
        });
    };

    const loadTableState = async (tableId: string) => {
        if (!tableId) return;
        const res = await liveMonitorAPI.tableState(tableId);
        const state = res.data as TableState;
        if (state?.id) {
            setTableStates((prev) => ({ ...prev, [state.id]: state }));
        }
    };

    const loadTableChat = async (tableId: string, limit = 200) => {
        if (!tableId) return;
        setChatLoading(true);
        try {
            const res = await liveMonitorAPI.tableChat(tableId, limit);
            const rows = (Array.isArray(res.data) ? res.data : []) as ChatMessage[];
            setTableChats((prev) => ({ ...prev, [tableId]: rows }));
        } finally {
            setChatLoading(false);
        }
    };

    const loadTables = async () => {
        try {
            const res = await gamesAPI.list();
            const payload = res.data as any;
            const rows: TableSummary[] = Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];
            setTables(rows);
        } catch (error) {
            pushEvent('error', 'Table Load Failed', String((error as Error)?.message || error));
        }
    };

    useEffect(() => {
        loadTables();
        const interval = setInterval(loadTables, 15000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (tables.length === 0) {
            setSelectedTableId('');
            return;
        }
        setSelectedTableId((prev) => {
            if (prev && tables.some((table) => table.id === prev)) return prev;
            return tables[0]!.id;
        });
    }, [tables]);

    useEffect(() => {
        if (!selectedTableId) return;
        loadTableState(selectedTableId).catch((error) => {
            pushEvent('error', 'Table State', String((error as Error)?.message || error));
        });
        loadTableChat(selectedTableId).catch((error) => {
            pushEvent('error', 'Table Chat', String((error as Error)?.message || error));
        });
    }, [selectedTableId]);

    useEffect(() => {
        const token = localStorage.getItem('admin_token') || '';
        if (!token) {
            pushEvent('error', 'Socket Auth', 'Missing admin token for live monitor');
            return;
        }

        const socket = io(SOCKET_URL, {
            auth: { token },
            autoConnect: true,
        });

        socket.on('connect', () => {
            setConnected(true);
            pushEvent('info', 'Socket Connected', `Connected to ${SOCKET_URL}`);
            syncSubscriptions(socket, tables.map((t) => t.id));
        });

        socket.on('disconnect', (reason) => {
            setConnected(false);
            pushEvent('warn', 'Socket Disconnected', reason || 'Disconnected');
        });

        socket.on('connect_error', (err) => {
            setConnected(false);
            pushEvent('error', 'Socket Connection Error', err.message || 'Connection failed');
        });

        socket.on('table:list', (payload: unknown) => {
            if (!Array.isArray(payload)) return;
            const next = payload as TableSummary[];
            setTables(next);
            syncSubscriptions(socket, next.map((t) => t.id));
        });

        socket.on('table:state', (payload: unknown) => {
            const state = payload as TableState;
            if (!state?.id) return;
            setTableStates((prev) => ({ ...prev, [state.id]: state }));
        });

        socket.on('chat:new', (payload: unknown) => {
            const message = payload as ChatMessage;
            if (!message?.id || !message.tableId) return;
            appendChatMessage(message);
        });

        socket.on('table:timeout', (payload: unknown) => {
            const timeout = payload as TimeoutPayload;
            pushEvent(
                'warn',
                'Turn Timeout',
                `Table ${timeout.tableId} user ${timeout.userId}: ${timeout.message}`,
            );
        });

        socket.on('table:error', (payload: unknown) => {
            const message =
                (payload as { message?: string })?.message || 'Unknown socket error';
            pushEvent('error', 'Table Error', message);
        });

        socketRef.current = socket;

        return () => {
            const current = subscriptionsRef.current;
            for (const tableId of current) {
                socket.emit('table:unsubscribe', { tableId });
            }
            current.clear();
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;
        syncSubscriptions(socket, tables.map((t) => t.id));
    }, [tables]);

    const selectedTableState = selectedTableId ? tableStates[selectedTableId] : undefined;
    const selectedTableChat = selectedTableId ? (tableChats[selectedTableId] || []) : [];
    const activeProposal = selectedTableState?.betControl?.activeProposal || null;

    const handleReviewBetChange = async (approve: boolean) => {
        if (!selectedTableId || !activeProposal) return;
        setActionLoading(true);
        try {
            await liveMonitorAPI.reviewBetChange(
                selectedTableId,
                approve,
                moderationReason.trim() || undefined,
            );
            await Promise.all([loadTableState(selectedTableId), loadTableChat(selectedTableId), loadTables()]);
            pushEvent(
                'info',
                approve ? 'Bet Change Approved' : 'Bet Change Rejected',
                `Table ${selectedTableId}`,
            );
            setModerationReason('');
        } catch (error) {
            pushEvent('error', 'Bet Review Failed', String((error as Error)?.message || error));
        } finally {
            setActionLoading(false);
        }
    };

    const handleBetLock = async (blocked: boolean) => {
        if (!selectedTableId) return;
        setActionLoading(true);
        try {
            await liveMonitorAPI.setBetLock(selectedTableId, blocked, moderationReason.trim() || undefined);
            await Promise.all([loadTableState(selectedTableId), loadTableChat(selectedTableId), loadTables()]);
            pushEvent('warn', blocked ? 'Bet Locked' : 'Bet Lock Removed', `Table ${selectedTableId}`);
            setModerationReason('');
        } catch (error) {
            pushEvent('error', 'Bet Lock Failed', String((error as Error)?.message || error));
        } finally {
            setActionLoading(false);
        }
    };

    const handleSendAdminMessage = () => {
        if (!selectedTableId || !socketRef.current) return;
        const message = chatDraft.replace(/\s+/g, ' ').trim();
        if (!message) return;
        socketRef.current.emit('chat:send', { tableId: selectedTableId, message });
        setChatDraft('');
    };

    const formatChatAt = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleTimeString();
    };

    const tableCards = useMemo(() => {
        return tables.map((table) => {
            const state = tableStates[table.id];
            const currentPlayers = state?.currentPlayers ?? table.currentPlayers ?? 0;
            const maxPlayers = state?.maxPlayers ?? table.maxPlayers ?? 0;
            const status = state?.status ?? table.status ?? 'UNKNOWN';
            const turn = state?.game?.turn;
            const activeTurnName = turn?.userId
                ? state?.seats?.find((seat) => seat.userId === turn.userId)?.name || turn.userId
                : null;
            return {
                id: table.id,
                name: table.name,
                status,
                currentPlayers,
                maxPlayers,
                betAmount: state?.betAmount ?? table.betAmount ?? 0,
                activeTurnUser: activeTurnName,
                turnNo: turn?.turnNo || null,
                seatCount: state?.seats?.length ?? 0,
            };
        });
    }, [tables, tableStates]);

    const eventClass = (level: MonitorEvent['level']) => {
        if (level === 'error') return 'result-item';
        if (level === 'warn') return 'bet-item';
        return '';
    };

    return (
        <div>
            <div className="page-header">
                <h1>Live Table Monitor</h1>
                <div className={`live-indicator ${connected ? 'live-connected' : 'live-disconnected'}`}>
                    <span className="live-dot" />
                    {connected ? 'Connected' : 'Disconnected'}
                </div>
            </div>

            <div className="live-games-grid">
                {tableCards.map((table) => (
                    <div
                        key={table.id}
                        className="live-game-card"
                        onClick={() => setSelectedTableId(table.id)}
                        style={{
                            cursor: 'pointer',
                            borderColor: selectedTableId === table.id ? 'var(--accent)' : undefined,
                        }}
                    >
                        <div className="live-game-header">
                            <span className="live-game-icon">TB</span>
                            <div>
                                <h3>{table.name}</h3>
                            </div>
                        </div>

                        <div className="live-game-stats">
                            <div className="live-stat">
                                <span className="live-stat-label">Status</span>
                                <span className="live-stat-value">{table.status}</span>
                            </div>
                            <div className="live-stat">
                                <span className="live-stat-label">Players</span>
                                <span className="live-stat-value">
                                    {table.currentPlayers}/{table.maxPlayers}
                                </span>
                            </div>
                            <div className="live-stat">
                                <span className="live-stat-label">Bet</span>
                                <span className="live-stat-value">Rs {table.betAmount}</span>
                            </div>
                            <div className="live-stat">
                                <span className="live-stat-label">Turn</span>
                                <span className="live-stat-value">
                                    {table.turnNo ? `#${table.turnNo}` : 'NA'}
                                </span>
                            </div>
                            <div className="live-stat">
                                <span className="live-stat-label">Turn User</span>
                                <span className="live-stat-value">
                                    {table.activeTurnUser || 'NA'}
                                </span>
                            </div>
                            <div className="live-stat">
                                <span className="live-stat-label">Seats</span>
                                <span className="live-stat-value">{table.seatCount}</span>
                            </div>
                        </div>
                    </div>
                ))}

                {tableCards.length === 0 && (
                    <p style={{ color: '#94A3B8', gridColumn: '1/-1' }}>No active tables</p>
                )}
            </div>

            <div className="live-feeds">
                <div className="live-feed-panel">
                    <h2>Bet Moderation</h2>
                    {selectedTableId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="form-group">
                                <label>Selected Table</label>
                                <select
                                    className="select-input"
                                    value={selectedTableId}
                                    onChange={(e) => setSelectedTableId(e.target.value)}
                                >
                                    {tables.map((table) => (
                                        <option key={table.id} value={table.id}>
                                            {table.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <div>Current Bet: Rs {selectedTableState?.betAmount ?? 0}</div>
                                <div>
                                    Bet Lock:{' '}
                                    <span style={{ color: selectedTableState?.betControl?.isBlocked ? 'var(--danger)' : 'var(--success)' }}>
                                        {selectedTableState?.betControl?.isBlocked ? 'BLOCKED' : 'OPEN'}
                                    </span>
                                </div>
                                {selectedTableState?.betControl?.blockedReason && (
                                    <div>Reason: {selectedTableState.betControl.blockedReason}</div>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Admin Reason / Note</label>
                                <input
                                    className="search-input"
                                    value={moderationReason}
                                    onChange={(e) => setModerationReason(e.target.value)}
                                    placeholder="Optional reason shown in system chat"
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-warning btn-sm"
                                    onClick={() => handleBetLock(true)}
                                    disabled={actionLoading || !!selectedTableState?.betControl?.isBlocked}
                                >
                                    Block Bet
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleBetLock(false)}
                                    disabled={actionLoading || !selectedTableState?.betControl?.isBlocked}
                                >
                                    Remove Block
                                </button>
                            </div>

                            {activeProposal ? (
                                <div
                                    style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '0.75rem',
                                        background: 'var(--bg-input)',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Active Bet Change Request</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                        <div>
                                            Requested: Rs {activeProposal.requestedAmount} (from Rs {activeProposal.currentAmount})
                                        </div>
                                        <div>By: {activeProposal.proposedByName}</div>
                                        <div>Status: {activeProposal.status}</div>
                                        <div>
                                            Player approvals: {activeProposal.playerApprovals.length} | rejections:{' '}
                                            {activeProposal.playerRejections.length}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                                        <button
                                            className="btn btn-warning btn-sm"
                                            onClick={() => handleReviewBetChange(true)}
                                            disabled={actionLoading}
                                        >
                                            Approve Request
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleReviewBetChange(false)}
                                            disabled={actionLoading}
                                        >
                                            Reject Request
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    No pending bet change request.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="live-feed-empty">Select a table to moderate.</p>
                    )}
                </div>

                <div className="live-feed-panel">
                    <h2>Session Chat Monitor</h2>
                    <p style={{ color: 'var(--warning)', fontSize: '0.76rem', marginBottom: '0.6rem' }}>
                        Fixed banner: Off-platform money settlement discussion can trigger bet lock for both players.
                    </p>
                    <div className="live-feed-list">
                        {chatLoading && <p className="live-feed-empty">Loading chat...</p>}
                        {!chatLoading && selectedTableChat.length === 0 && (
                            <p className="live-feed-empty">No chat messages for this table.</p>
                        )}
                        {!chatLoading &&
                            selectedTableChat.map((entry) => (
                                <div key={entry.id} className="live-feed-item">
                                    <div className="feed-item-main">
                                        <span className="feed-game">
                                            {entry.role === 'SYSTEM' ? 'System' : `${entry.userName} (${entry.role})`}
                                        </span>
                                        <span className="feed-detail">{entry.message}</span>
                                    </div>
                                    <div className="feed-item-right">
                                        <span className="feed-time">{formatChatAt(entry.createdAt)}</span>
                                    </div>
                                </div>
                            ))}
                    </div>
                    {selectedTableId && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                            <input
                                className="search-input"
                                value={chatDraft}
                                onChange={(e) => setChatDraft(e.target.value)}
                                placeholder="Send admin notice in session chat"
                            />
                            <button
                                className="btn-primary"
                                type="button"
                                onClick={handleSendAdminMessage}
                                disabled={chatDraft.trim().length === 0}
                            >
                                Send
                            </button>
                        </div>
                    )}
                </div>

                <div className="live-feed-panel">
                    <h2>Socket Events</h2>
                    <div className="live-feed-list">
                        {events.length === 0 && (
                            <p className="live-feed-empty">Waiting for table events...</p>
                        )}
                        {events.map((entry) => (
                            <div key={entry.id} className={`live-feed-item ${eventClass(entry.level)}`}>
                                <div className="feed-item-main">
                                    <span className="feed-game">{entry.title}</span>
                                    <span className="feed-detail">{entry.details}</span>
                                </div>
                                <div className="feed-item-right">
                                    <span className="feed-time">{entry.at.toLocaleTimeString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
