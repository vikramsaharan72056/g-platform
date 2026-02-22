import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { gamesAPI } from '../services/api';

interface GameInfo {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    isMaintenanceMode: boolean;
}

interface LiveGameState {
    game: GameInfo;
    roundNumber: number | null;
    status: string;
    players: number;
    lastResult: string | null;
}

interface BetEvent {
    id: string;
    userId: string;
    amount: number;
    betType: string;
    gameName: string;
    timestamp: Date;
}

interface RoundEvent {
    gameId: string;
    gameName: string;
    roundNumber: number;
    result: string;
    timestamp: Date;
}

const SOCKET_URL = window.location.origin.replace(/:\d+$/, ':3000');

export default function LiveMonitorPage() {
    const [games, setGames] = useState<LiveGameState[]>([]);
    const [bets, setBets] = useState<BetEvent[]>([]);
    const [roundResults, setRoundResults] = useState<RoundEvent[]>([]);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        loadGames();
        connectSocket();

        const interval = setInterval(loadGames, 30000); // refresh every 30s

        return () => {
            clearInterval(interval);
            socketRef.current?.disconnect();
        };
    }, []);

    const loadGames = async () => {
        try {
            const res = await gamesAPI.list();
            const gameList: GameInfo[] = res.data.data || res.data || [];
            setGames((prev) =>
                gameList.map((g) => {
                    const existing = prev.find((p) => p.game.id === g.id);
                    return {
                        game: g,
                        roundNumber: existing?.roundNumber ?? null,
                        status: existing?.status ?? 'IDLE',
                        players: existing?.players ?? 0,
                        lastResult: existing?.lastResult ?? null,
                    };
                }),
            );
        } catch {
            // silent
        }
    };

    const connectSocket = () => {
        const socket = io(`${SOCKET_URL}/game`, {
            transports: ['websocket'],
            autoConnect: true,
        });

        socket.on('connect', () => {
            setConnected(true);
            // Join all game rooms
            games.forEach((g) => {
                socket.emit('join:game', { gameId: g.game.id });
            });
        });

        socket.on('disconnect', () => setConnected(false));

        // Listen for round events
        socket.on('round:start', (data: any) => {
            setGames((prev) =>
                prev.map((g) =>
                    g.game.id === data.gameId
                        ? { ...g, roundNumber: data.roundNumber, status: 'BETTING' }
                        : g,
                ),
            );
        });

        socket.on('round:locked', (data: any) => {
            setGames((prev) =>
                prev.map((g) =>
                    g.game.id === data.gameId ? { ...g, status: 'LOCKED' } : g,
                ),
            );
        });

        socket.on('round:result', (data: any) => {
            setGames((prev) =>
                prev.map((g) =>
                    g.game.id === data.gameId
                        ? { ...g, status: 'COMPLETED', lastResult: data.result || JSON.stringify(data) }
                        : g,
                ),
            );
            setRoundResults((prev) => [
                {
                    gameId: data.gameId,
                    gameName: data.gameName || data.gameId,
                    roundNumber: data.roundNumber,
                    result: typeof data.result === 'object' ? JSON.stringify(data.result) : String(data.result),
                    timestamp: new Date(),
                },
                ...prev.slice(0, 49),
            ]);
        });

        socket.on('bet:placed', (data: any) => {
            setBets((prev) => [
                {
                    id: data.betId || Math.random().toString(36),
                    userId: data.userId,
                    amount: data.amount,
                    betType: data.betType,
                    gameName: data.gameName || 'Unknown',
                    timestamp: new Date(),
                },
                ...prev.slice(0, 49),
            ]);
        });

        // Aviator specific
        socket.on('aviator:tick', (data: any) => {
            setGames((prev) =>
                prev.map((g) =>
                    g.game.slug === 'aviator'
                        ? { ...g, status: `FLYING ${data.multiplier}x` }
                        : g,
                ),
            );
        });

        socketRef.current = socket;
    };

    // Join rooms when games list updates
    useEffect(() => {
        if (socketRef.current?.connected) {
            games.forEach((g) => {
                socketRef.current?.emit('join:game', { gameId: g.game.id });
            });
        }
    }, [games.length]);

    const getStatusColor = (status: string) => {
        if (status.includes('FLYING')) return '#F59E0B';
        switch (status) {
            case 'BETTING': return '#10B981';
            case 'LOCKED': return '#F97316';
            case 'PLAYING': return '#6C5CE7';
            case 'COMPLETED': return '#94A3B8';
            default: return '#4B5563';
        }
    };

    const getGameIcon = (slug: string) => {
        const icons: Record<string, string> = {
            'seven-up-down': '🎲',
            'dragon-tiger': '🐉',
            'teen-patti': '🃏',
            'aviator': '✈️',
            'poker': '♠️',
        };
        return icons[slug] || '🎮';
    };

    return (
        <div>
            <div className="page-header">
                <h1>📡 Live Game Monitor</h1>
                <div className={`live-indicator ${connected ? 'live-connected' : 'live-disconnected'}`}>
                    <span className="live-dot" />
                    {connected ? 'Connected' : 'Disconnected'}
                </div>
            </div>

            {/* Game Status Cards */}
            <div className="live-games-grid">
                {games.map((g) => (
                    <div key={g.game.id} className="live-game-card">
                        <div className="live-game-header">
                            <span className="live-game-icon">{getGameIcon(g.game.slug)}</span>
                            <div>
                                <h3>{g.game.name}</h3>
                                {g.game.isMaintenanceMode && (
                                    <span className="badge badge-warning">Maintenance</span>
                                )}
                            </div>
                        </div>
                        <div className="live-game-stats">
                            <div className="live-stat">
                                <span className="live-stat-label">Status</span>
                                <span
                                    className="live-status-badge"
                                    style={{ backgroundColor: getStatusColor(g.status) }}
                                >
                                    {g.status}
                                </span>
                            </div>
                            <div className="live-stat">
                                <span className="live-stat-label">Round</span>
                                <span className="live-stat-value">{g.roundNumber ?? '—'}</span>
                            </div>
                            <div className="live-stat">
                                <span className="live-stat-label">Players</span>
                                <span className="live-stat-value">{g.players}</span>
                            </div>
                        </div>
                        {g.lastResult && (
                            <div className="live-game-result">
                                Last: <strong>{g.lastResult}</strong>
                            </div>
                        )}
                    </div>
                ))}
                {games.length === 0 && (
                    <p style={{ color: '#94A3B8', gridColumn: '1/-1' }}>Loading games...</p>
                )}
            </div>

            {/* Two-column: Live Bets + Round Results */}
            <div className="live-feeds">
                {/* Live Bet Feed */}
                <div className="live-feed-panel">
                    <h2>💰 Live Bets</h2>
                    <div className="live-feed-list">
                        {bets.length === 0 && (
                            <p className="live-feed-empty">Waiting for bets...</p>
                        )}
                        {bets.map((b) => (
                            <div key={b.id} className="live-feed-item bet-item">
                                <div className="feed-item-main">
                                    <span className="feed-game">{b.gameName}</span>
                                    <span className="feed-detail">{b.betType}</span>
                                </div>
                                <div className="feed-item-right">
                                    <span className="feed-amount">₹{b.amount}</span>
                                    <span className="feed-time">
                                        {b.timestamp.toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Round Results Feed */}
                <div className="live-feed-panel">
                    <h2>🎯 Round Results</h2>
                    <div className="live-feed-list">
                        {roundResults.length === 0 && (
                            <p className="live-feed-empty">Waiting for results...</p>
                        )}
                        {roundResults.map((r, i) => (
                            <div key={`${r.gameId}-${r.roundNumber}-${i}`} className="live-feed-item result-item">
                                <div className="feed-item-main">
                                    <span className="feed-game">{r.gameName}</span>
                                    <span className="feed-detail">Round #{r.roundNumber}</span>
                                </div>
                                <div className="feed-item-right">
                                    <span className="feed-result">{r.result}</span>
                                    <span className="feed-time">
                                        {r.timestamp.toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
