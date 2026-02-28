import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function WalletPage() {
    const [wallet, setWallet] = useState<any>(null);
    const [txns, setTxns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const [wRes, tRes] = await Promise.all([
                api.get('/wallet/me'),
                api.get('/wallet/me/transactions', { params: { limit: 50 } })
            ]);
            setWallet(wRes.data.data || null);
            setTxns(tRes.data.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading) return <div className="page-loading">Loading financial data...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>Wallet & Transactions</h2>
                    <p className="page-subtitle">Manage operator funds and view history</p>
                </div>
                <div className="header-actions">
                    <button className="btn-primary" onClick={loadData}>Refresh</button>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-info">
                        <span className="stat-label">Current Balance</span>
                        <div className="stat-value">₹{wallet?.balance ?? 0}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">📈</div>
                    <div className="stat-info">
                        <span className="stat-label">Total Volume</span>
                        <div className="stat-value">₹{txns.reduce((acc, curr) => acc + Math.abs(curr.amount || 0), 0).toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>Recent Transactions</h3>
                </div>
                <div className="table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Before</th>
                                <th>After</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {txns.map((t) => (
                                <tr key={t.id}>
                                    <td>#{t.id}</td>
                                    <td>
                                        <span className={`badge ${t.type === 'WIN' ? 'badge-green' : t.type === 'RAKE' ? 'badge-blue' : 'badge-yellow'}`}>
                                            {t.type}
                                        </span>
                                    </td>
                                    <td style={{ color: t.amount >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
                                        {t.amount >= 0 ? '+' : ''}{t.amount}
                                    </td>
                                    <td>₹{t.balanceBefore}</td>
                                    <td>₹{t.balanceAfter}</td>
                                    <td>{new Date(t.createdAt).toLocaleString()}</td>
                                </tr>
                            ))}
                            {txns.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        No transactions found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
