import { useEffect, useState } from 'react';
import { gameControlsAPI } from '../services/api';

export default function AnalyticsPage() {
    const [stats, setStats] = useState<any>(null);
    const [revenueData, setRevenueData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    useEffect(() => {
        fetchData();
    }, [days]);

    const fetchData = async () => {
        try {
            const [statsRes, chartRes] = await Promise.all([
                gameControlsAPI.dashboard(),
                gameControlsAPI.revenueChart(days),
            ]);
            setStats(statsRes.data);
            setRevenueData(chartRes.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="page-loading">Loading...</div>;

    const maxRevenue = Math.max(...revenueData.map(d => Math.abs(d.revenue)), 1);
    const maxVolume = Math.max(...revenueData.map(d => d.betVolume), 1);

    return (
        <div className="page">
            <div className="page-header">
                <h2>📈 Analytics</h2>
                <select
                    value={days}
                    onChange={e => setDays(Number(e.target.value))}
                    className="select-input"
                >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                </select>
            </div>

            {/* KPI Cards */}
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
                        <span className="stat-label">Today's Revenue</span>
                        <span className="stat-value">₹{stats.todayRevenue?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Today's Bet Volume</span>
                        <span className="stat-value">₹{stats.todayBetVolume?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card highlight-green">
                        <span className="stat-label">Weekly Revenue</span>
                        <span className="stat-value">₹{stats.weeklyRevenue?.toLocaleString()}</span>
                    </div>
                    <div className="stat-card highlight-green">
                        <span className="stat-label">Monthly Revenue</span>
                        <span className="stat-value">₹{stats.monthlyRevenue?.toLocaleString()}</span>
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

            {/* Revenue Chart (CSS bar chart) */}
            <div className="card">
                <h3>Revenue Trend ({days} days)</h3>
                {revenueData.length === 0 ? (
                    <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No data available</p>
                ) : (
                    <div className="chart-container">
                        <div className="bar-chart">
                            {revenueData.map((d, i) => (
                                <div key={i} className="bar-group" title={`${d.date}\nRevenue: ₹${d.revenue.toLocaleString()}\nVolume: ₹${d.betVolume.toLocaleString()}`}>
                                    <div className="bar-wrapper">
                                        <div
                                            className={`bar ${d.revenue >= 0 ? 'bar-positive' : 'bar-negative'}`}
                                            style={{ height: `${Math.abs(d.revenue) / maxRevenue * 100}%` }}
                                        />
                                    </div>
                                    <span className="bar-label">{d.date.substring(5)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Bet Volume Chart */}
            <div className="card">
                <h3>Bet Volume ({days} days)</h3>
                {revenueData.length === 0 ? (
                    <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No data</p>
                ) : (
                    <div className="chart-container">
                        <div className="bar-chart">
                            {revenueData.map((d, i) => (
                                <div key={i} className="bar-group" title={`${d.date}: ₹${d.betVolume.toLocaleString()}`}>
                                    <div className="bar-wrapper">
                                        <div
                                            className="bar bar-blue"
                                            style={{ height: `${d.betVolume / maxVolume * 100}%` }}
                                        />
                                    </div>
                                    <span className="bar-label">{d.date.substring(5)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Per-Game Stats */}
            {stats?.gameStats && (
                <div className="card">
                    <h3>Game Performance (Today)</h3>
                    <table className="data-table">
                        <thead>
                            <tr><th>Game</th><th>Status</th><th>Rounds Today</th></tr>
                        </thead>
                        <tbody>
                            {stats.gameStats.map((g: any) => (
                                <tr key={g.id}>
                                    <td>{g.name}</td>
                                    <td><span className={`badge ${g.isActive ? 'badge-success' : 'badge-muted'}`}>{g.isActive ? 'Active' : 'Off'}</span></td>
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
