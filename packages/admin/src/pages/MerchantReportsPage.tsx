import { useEffect, useState } from 'react';
import { gameControlsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Users, TrendingUp, DollarSign, Activity, ChevronRight, Download } from 'lucide-react';

export default function MerchantReportsPage() {
    const { user } = useAuth();
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(7);

    useEffect(() => {
        fetchData();
    }, [days]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await gameControlsAPI.merchantReports(days);
            setReports(res.data || []);
        } catch (err) {
            console.error('Failed to fetch merchant reports:', err);
        } finally {
            setLoading(false);
        }
    };

    const isSuperAdmin = user?.role === 'SUPER_ADMIN';

    // Calculate totals
    const totals = reports.reduce((acc, curr) => ({
        betVolume: acc.betVolume + curr.betVolume,
        revenue: acc.revenue + curr.revenue,
        totalBets: acc.totalBets + curr.totalBets,
        activePlayers: acc.activePlayers + curr.activePlayers
    }), { betVolume: 0, revenue: 0, totalBets: 0, activePlayers: 0 });

    if (loading && reports.length === 0) return <div className="page-loading">Generating reports...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>💼 Merchant Reports</h2>
                    <p className="subtitle">Hierarchical revenue and performance tracking</p>
                </div>
                <div className="page-header-actions">
                    <select
                        value={days}
                        onChange={e => setDays(Number(e.target.value))}
                        className="select-input"
                    >
                        <option value={1}>Today</option>
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                    </select>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            {/* Top Stats Summary */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon-wrapper blue">
                        <TrendingUp size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Total Volume</span>
                        <span className="stat-value">₹{totals.betVolume.toLocaleString()}</span>
                    </div>
                </div>
                <div className="stat-card highlight-green">
                    <div className="stat-icon-wrapper green">
                        <DollarSign size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Net Profit (Revenue)</span>
                        <span className="stat-value">₹{totals.revenue.toLocaleString()}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon-wrapper purple">
                        <Activity size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Total Bets</span>
                        <span className="stat-value">{totals.totalBets.toLocaleString()}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon-wrapper orange">
                        <Users size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Unique Players</span>
                        <span className="stat-value">{totals.activePlayers.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Merchant Detail Table */}
            <div className="card">
                <div className="card-header">
                    <h3>{isSuperAdmin ? 'Merchant Performance Breakdown' : 'Your Merchant Performance'}</h3>
                </div>
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Merchant / Admin</th>
                                <th style={{ textAlign: 'center' }}>Players</th>
                                <th style={{ textAlign: 'center' }}>Total Bets</th>
                                <th style={{ textAlign: 'right' }}>Bet Volume</th>
                                <th style={{ textAlign: 'right' }}>Payouts</th>
                                <th style={{ textAlign: 'right' }}>Revenue (P&L)</th>
                                <th style={{ textAlign: 'right' }}>Profit %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                                        No financial data found for this period.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((report, idx) => {
                                    const profitMargin = report.betVolume > 0
                                        ? (report.revenue / report.betVolume * 100).toFixed(1)
                                        : '0.0';

                                    return (
                                        <tr key={idx}>
                                            <td>
                                                <div className="merchant-name-cell">
                                                    <span className="merchant-avatar">
                                                        {report.adminName.charAt(0).toUpperCase()}
                                                    </span>
                                                    <div>
                                                        <strong>{report.adminName}</strong>
                                                        <span className="merchant-id">{report.adminId}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className="badge badge-muted">{report.activePlayers}</span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {report.totalBets.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                ₹{report.betVolume.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'right', color: '#e53e3e' }}>
                                                ₹{report.payout.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: report.revenue >= 0 ? '#38a169' : '#e53e3e' }}>
                                                ₹{report.revenue.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="profit-margin-cell">
                                                    <div className="progress-mini">
                                                        <div
                                                            className={`progress-mini-bar ${Number(profitMargin) >= 5 ? 'green' : 'orange'}`}
                                                            style={{ width: `${Math.min(Number(profitMargin) * 5, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span>{profitMargin}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {reports.length > 0 && (
                            <tfoot style={{ background: 'rgba(0,0,0,0.02)', fontWeight: 'bold' }}>
                                <tr>
                                    <td>TOTAL SYSTEM</td>
                                    <td style={{ textAlign: 'center' }}>{totals.activePlayers}</td>
                                    <td style={{ textAlign: 'center' }}>{totals.totalBets.toLocaleString()}</td>
                                    <td style={{ textAlign: 'right' }}>₹{totals.betVolume.toLocaleString()}</td>
                                    <td style={{ textAlign: 'right' }}>₹{(totals.betVolume - totals.revenue).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', color: '#38a169' }}>₹{totals.revenue.toLocaleString()}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        {(totals.revenue / totals.betVolume * 100).toFixed(1)}%
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            <style>{`
                .merchant-name-cell { display: flex; align-items: center; gap: 0.75rem; }
                .merchant-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; }
                .merchant-id { display: block; font-size: 0.7rem; opacity: 0.5; margin-top: 2px; }
                .subtitle { font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; }
                .stat-icon-wrapper { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 0.5rem; }
                .stat-icon-wrapper.blue { background: rgba(66, 153, 225, 0.1); color: #4299e1; }
                .stat-icon-wrapper.green { background: rgba(72, 187, 120, 0.1); color: #48bb78; }
                .stat-icon-wrapper.purple { background: rgba(159, 122, 234, 0.1); color: #9f7aea; }
                .stat-icon-wrapper.orange { background: rgba(237, 137, 54, 0.1); color: #ed8936; }
                .profit-margin-cell { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; }
                .progress-mini { width: 40px; height: 4px; background: rgba(0,0,0,0.05); border-radius: 2px; overflow: hidden; }
                .progress-mini-bar { height: 100%; border-radius: 2px; }
                .progress-mini-bar.green { background: #38a169; }
                .progress-mini-bar.orange { background: #ed8936; }
                @media print {
                    .sidebar, .page-header-actions { display: none; }
                    .page { padding: 0; }
                    .card { box-shadow: none; border: 1px solid #eee; }
                }
            `}</style>
        </div>
    );
}
