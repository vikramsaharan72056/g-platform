import { useEffect, useState } from 'react';
import { gamesAPI } from '../services/api';

type GameRow = {
    id: string;
    name?: string;
    status?: string;
    currentPlayers?: number;
    betAmount?: number;
};

export default function GameControlsPage() {
    const [games, setGames] = useState<GameRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const gamesRes = await gamesAPI.list();
            const payload = gamesRes.data?.data ?? gamesRes.data ?? [];
            setGames(Array.isArray(payload) ? payload : []);
        } catch (err) {
            console.error(err);
            setGames([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="page-loading">Loading...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <h2>Game Controls</h2>
            </div>

            <div className="card">
                <h3>Control Actions</h3>
                <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                    Force result and win-rate control endpoints are not available in this backend.
                </p>
            </div>

            <div className="card">
                <h3>Table Operations View</h3>
                {games.length === 0 ? (
                    <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No tables available</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Table</th>
                                <th>Status</th>
                                <th>Players</th>
                                <th>Bet Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {games.map((g) => (
                                <tr key={g.id}>
                                    <td>{g.name || g.id}</td>
                                    <td>
                                        <span className={`badge ${g.status === 'IN_PROGRESS' ? 'badge-success' : 'badge-muted'}`}>
                                            {g.status || 'UNKNOWN'}
                                        </span>
                                    </td>
                                    <td>{g.currentPlayers ?? 0}</td>
                                    <td>Rs {(g.betAmount ?? 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
