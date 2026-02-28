import { useEffect, useState } from 'react';
import { gameControlsAPI } from '../services/api';

export default function AnalyticsPage() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const statsRes = await gameControlsAPI.dashboard();
            setStats(statsRes.data || null);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="page-loading">Loading...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <h2>Analytics</h2>
            </div>

            {stats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-label">Total Users</span>
                        <span className="stat-value">{stats.totalUsers?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Active (24h)</span>
                        <span className="stat-value">{stats.activeUsers24h?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card highlight-green">
                        <span className="stat-label">Today Revenue</span>
                        <span className="stat-value">Rs {stats.todayRevenue?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Today Bet Volume</span>
                        <span className="stat-value">Rs {stats.todayBetVolume?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card highlight-green">
                        <span className="stat-label">Weekly Revenue</span>
                        <span className="stat-value">Rs {stats.weeklyRevenue?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card highlight-green">
                        <span className="stat-label">Monthly Revenue</span>
                        <span className="stat-value">Rs {stats.monthlyRevenue?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card highlight-orange">
                        <span className="stat-label">Pending Deposits</span>
                        <span className="stat-value">{stats.pendingDeposits}</span>
                    </div>
                    <div className="stat-card highlight-orange">
                        <span className="stat-label">Pending Withdrawals</span>
                        <span className="stat-value">{stats.pendingWithdrawals}</span>
                    </div>
                </div>
            )}

            <div className="card">
                <h3>Revenue And Volume Trend</h3>
                <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                    Trend endpoints are not available in the current backend contract.
                </p>
            </div>

            {stats?.gameStats && (
                <div className="card">
                    <h3>Game Performance</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Game</th>
                                <th>Status</th>
                                <th>Rounds</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.gameStats.map((g: any) => (
                                <tr key={g.id}>
                                    <td>{g.name}</td>
                                    <td>
                                        <span className={`badge ${g.isActive ? 'badge-success' : 'badge-muted'}`}>
                                            {g.isActive ? 'Active' : 'Off'}
                                        </span>
                                    </td>
                                    <td>{g._count?.rounds || 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
