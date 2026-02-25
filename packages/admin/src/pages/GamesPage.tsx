import { useState, useEffect } from 'react';
import { gamesAPI } from '../services/api';

interface Game {
    id: string;
    name: string;
    slug: string;
    type: string;
    minBet: number;
    maxBet: number;
    roundDuration: number;
    bettingWindow: number;
    houseEdge: number;
    isActive: boolean;
    isMaintenanceMode: boolean;
    _count: { rounds: number };
}

export default function GamesPage() {
    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedGame, setSelectedGame] = useState<string | null>(null);
    const [gameStats, setGameStats] = useState<any>(null);

    useEffect(() => {
        loadGames();
    }, []);

    const loadGames = async () => {
        try {
            const res = await gamesAPI.list();
            setGames(res.data);
        } catch (err) {
            console.error('Failed to load games:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadGameStats = async (gameId: string) => {
        setSelectedGame(gameId);
        try {
            const res = await gamesAPI.stats(gameId);
            setGameStats(res.data);
        } catch (err) {
            console.error('Failed to load game stats:', err);
        }
    };

    const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString()}`;

    const gameIcons: Record<string, string> = {
        'teen-patti': '🃏',
        rummy: '🀄',
        'aviator': '✈️',
        'seven-up-down': '🎲',
        'dragon-tiger': '🐉',
        'poker': '♠️',
    };

    if (loading) return <div className="page-loading">Loading games...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <h2>Game Management</h2>
                <p className="page-subtitle">{games.length} games configured</p>
            </div>

            <div className="games-grid">
                {games.map((game) => (
                    <div
                        key={game.id}
                        className={`game-card-admin ${!game.isActive ? 'inactive' : ''} ${selectedGame === game.id ? 'selected' : ''}`}
                        onClick={() => loadGameStats(game.id)}
                    >
                        <div className="game-card-header">
                            <span className="game-card-icon">{gameIcons[game.slug] || '🎮'}</span>
                            <div>
                                <h3>{game.name}</h3>
                                <span className="game-card-type">{game.type.replace('_', ' ')}</span>
                            </div>
                            <span className={`badge ${game.isActive ? 'badge-green' : 'badge-gray'}`}>
                                {game.isActive ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                        </div>

                        <div className="game-card-stats">
                            <div className="game-stat">
                                <span className="game-stat-label">Min Bet</span>
                                <span className="game-stat-value">{formatCurrency(game.minBet)}</span>
                            </div>
                            <div className="game-stat">
                                <span className="game-stat-label">Max Bet</span>
                                <span className="game-stat-value">{formatCurrency(game.maxBet)}</span>
                            </div>
                            <div className="game-stat">
                                <span className="game-stat-label">Round Duration</span>
                                <span className="game-stat-value">{game.roundDuration}s</span>
                            </div>
                            <div className="game-stat">
                                <span className="game-stat-label">House Edge</span>
                                <span className="game-stat-value">{game.houseEdge}%</span>
                            </div>
                            <div className="game-stat">
                                <span className="game-stat-label">Total Rounds</span>
                                <span className="game-stat-value">{game._count?.rounds || 0}</span>
                            </div>
                            <div className="game-stat">
                                <span className="game-stat-label">Betting Window</span>
                                <span className="game-stat-value">{game.bettingWindow}s</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {selectedGame && gameStats && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                    <div className="card-header">
                        <h3>Game Statistics</h3>
                    </div>
                    <div className="card-body">
                        <div className="stats-grid">
                            <div className="stat-card mini">
                                <div className="stat-label">Total Rounds</div>
                                <div className="stat-value">{gameStats.totalRounds}</div>
                            </div>
                            <div className="stat-card mini">
                                <div className="stat-label">Total Bets</div>
                                <div className="stat-value">{gameStats.totalBets}</div>
                            </div>
                            <div className="stat-card mini">
                                <div className="stat-label">Total Bet Volume</div>
                                <div className="stat-value">{formatCurrency(gameStats.totalBetAmount)}</div>
                            </div>
                            <div className="stat-card mini">
                                <div className="stat-label">House P&L</div>
                                <div className="stat-value" style={{ color: Number(gameStats.housePnl) >= 0 ? '#27ae60' : '#e74c3c' }}>
                                    {formatCurrency(gameStats.housePnl)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
