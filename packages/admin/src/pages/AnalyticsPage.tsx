import React, { useEffect, useState } from 'react';
import { gameControlsAPI } from '../services/api';
import {
    Activity,
    Users,
    TrendingUp,
    TrendingDown,
    Database,
    ArrowUpRight,
    ArrowDownRight,
    PieChart,
    BarChart3,
    Clock,
    Shield
} from 'lucide-react';
import '../styles/AnalyticsPage.css';

const AnalyticsPage: React.FC = () => {
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
            console.error('Failed to fetch analytics', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="page-loading">Generating Analytics...</div>;

    const maxRevenue = Math.max(...revenueData.map(d => Math.abs(d.revenue)), 1);
    const maxVolume = Math.max(...revenueData.map(d => d.betVolume), 1);

    return (
        <div className="analytics-container">
            <header className="analytics-header">
                <div>
                    <h1>Operational Intelligence</h1>
                    <p style={{ color: '#94a3b8' }}>Real-time revenue and engagement metrics across the Hub & Spokes</p>
                </div>
                <select
                    value={days}
                    onChange={e => setDays(Number(e.target.value))}
                    className="glass-select"
                >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                </select>
            </header>

            {/* KPI Cards */}
            <div className="stats-overview">
                <div className="stat-card premium glass shadow">
                    <div className="icon-box blue"><Users size={24} /></div>
                    <div className="stat-info">
                        <h4>Total Registered</h4>
                        <div className="value">{stats?.totalUsers?.toLocaleString()}</div>
                    </div>
                </div>
                <div className="stat-card premium glass shadow">
                    <div className="icon-box purple"><Activity size={24} /></div>
                    <div className="stat-info">
                        <h4>Active (24h)</h4>
                        <div className="value">{stats?.activeUsers24h?.toLocaleString()}</div>
                    </div>
                </div>
                <div className="stat-card premium glass shadow">
                    <div className="icon-box green"><TrendingUp size={24} /></div>
                    <div className="stat-info">
                        <h4>Today's Revenue</h4>
                        <div className="value">₹{stats?.todayRevenue?.toLocaleString()}</div>
                    </div>
                </div>
                <div className="stat-card premium glass shadow">
                    <div className="icon-box orange"><Database size={24} /></div>
                    <div className="stat-info">
                        <h4>Pending Payouts</h4>
                        <div className="value">{stats?.pendingWithdrawals || 0}</div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="charts-grid">
                <div className="chart-card glass shadow">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3><TrendingUp size={16} style={{ marginRight: 8 }} /> Profit / Loss Trend</h3>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Max Peak: ₹{maxRevenue.toLocaleString()}</div>
                    </div>
                    <div className="bar-chart-v2">
                        {revenueData.map((d, i) => (
                            <div
                                key={i}
                                className={`bar-v2 ${d.revenue >= 0 ? 'positive' : 'negative'}`}
                                style={{ height: `${Math.abs(d.revenue) / maxRevenue * 100}%` }}
                            >
                                <div className="bar-tooltip">₹{d.revenue.toLocaleString()} ({d.date.substring(5)})</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="chart-card glass shadow">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3><BarChart3 size={16} style={{ marginRight: 8 }} /> Bet Volume Velocity</h3>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Volume: ₹{revenueData.reduce((acc, d) => acc + d.betVolume, 0).toLocaleString()}</div>
                    </div>
                    <div className="bar-chart-v2">
                        {revenueData.map((d, i) => (
                            <div
                                key={i}
                                className="bar-v2 blue"
                                style={{ height: `${d.betVolume / maxVolume * 100}%` }}
                            >
                                <div className="bar-tooltip">₹{d.betVolume.toLocaleString()} ({d.date.substring(5)})</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Game Stats Table */}
            <div className="games-table-card glass shadow">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
                    <Shield size={20} color="#a78bfa" />
                    <h2>Spoke Performance Metrics</h2>
                </div>
                <table className="modern-table">
                    <thead>
                        <tr>
                            <th>Microservice (Game)</th>
                            <th>Operational Status</th>
                            <th>Rounds (24h)</th>
                            <th>Trend</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats?.gameStats?.map((g: any) => (
                            <tr key={g.id}>
                                <td style={{ fontWeight: 600 }}>{g.name}</td>
                                <td>
                                    <span className={`status-pill ${g.isActive ? 'status-active' : 'status-idle'}`}>
                                        {g.isActive ? 'ACTIVE' : 'IDLE'}
                                    </span>
                                </td>
                                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{g._count?.rounds || 0}</td>
                                <td>
                                    {g.isActive ? (
                                        <div style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
                                            <ArrowUpRight size={14} /> HEALHLY
                                        </div>
                                    ) : (
                                        <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
                                            STANDBY
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AnalyticsPage;
