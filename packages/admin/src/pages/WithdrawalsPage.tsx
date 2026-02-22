import { useState, useEffect } from 'react';
import { withdrawalsAPI } from '../services/api';

interface Withdrawal {
    id: string;
    amount: number;
    status: string;
    payoutMethod: string;
    payoutDetails: any;
    createdAt: string;
    user: {
        id: string;
        email: string;
        displayName: string;
        wallet?: {
            balance: number;
            totalDeposited: number;
            totalWithdrawn: number;
            totalBetAmount: number;
            totalWon: number;
        };
    };
}

export default function WithdrawalsPage() {
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadWithdrawals();
    }, [statusFilter]);

    const loadWithdrawals = async (page = 1) => {
        setLoading(true);
        try {
            const res = await withdrawalsAPI.queue({ page, limit: 20, status: statusFilter });
            setWithdrawals(res.data.data);
            setMeta(res.data.meta);
        } catch (err) {
            console.error('Failed to load withdrawals:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        const paymentRef = prompt('Enter payment reference number:');
        if (!paymentRef) return;
        try {
            await withdrawalsAPI.approve(id, paymentRef, 'Approved');
            loadWithdrawals(meta.page);
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to approve');
        }
    };

    const handleReject = async (id: string) => {
        const reason = prompt('Enter rejection reason (amount will be refunded):');
        if (!reason) return;
        try {
            await withdrawalsAPI.reject(id, reason);
            loadWithdrawals(meta.page);
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to reject');
        }
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();
    const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString()}`;

    const getPayoutDisplay = (w: Withdrawal) => {
        if (w.payoutMethod === 'UPI') return w.payoutDetails?.upiId || '—';
        return `${w.payoutDetails?.bankName || 'Bank'} - ${w.payoutDetails?.accountNo || '—'}`;
    };

    return (
        <div className="page">
            <div className="page-header">
                <h2>Withdrawal Queue</h2>
                <p className="page-subtitle">{meta.total} {statusFilter.toLowerCase()} withdrawals</p>
            </div>

            <div className="card">
                <div className="card-header">
                    <div className="filter-tabs">
                        {['PENDING', 'COMPLETED', 'REJECTED', 'ON_HOLD'].map((s) => (
                            <button
                                key={s}
                                className={`filter-tab ${statusFilter === s ? 'active' : ''}`}
                                onClick={() => setStatusFilter(s)}
                            >
                                {s.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="card-body">
                    {loading ? (
                        <div className="page-loading">Loading withdrawals...</div>
                    ) : withdrawals.length === 0 ? (
                        <div className="empty-state">No {statusFilter.toLowerCase()} withdrawals</div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Amount</th>
                                        <th>Method</th>
                                        <th>Payout To</th>
                                        <th>User Stats</th>
                                        <th>Date</th>
                                        {statusFilter === 'PENDING' && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {withdrawals.map((w) => (
                                        <tr key={w.id}>
                                            <td>
                                                <div className="user-cell">
                                                    <div className="user-cell-avatar">
                                                        {w.user?.displayName?.charAt(0) || '?'}
                                                    </div>
                                                    <div>
                                                        <div className="user-cell-name">{w.user?.displayName}</div>
                                                        <div className="user-cell-email">{w.user?.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="amount-cell">{formatCurrency(w.amount)}</td>
                                            <td>{w.payoutMethod}</td>
                                            <td><code>{getPayoutDisplay(w)}</code></td>
                                            <td>
                                                <div className="mini-stats">
                                                    <span>Dep: {formatCurrency(w.user?.wallet?.totalDeposited || 0)}</span>
                                                    <span>Bet: {formatCurrency(w.user?.wallet?.totalBetAmount || 0)}</span>
                                                </div>
                                            </td>
                                            <td>{formatDate(w.createdAt)}</td>
                                            {statusFilter === 'PENDING' && (
                                                <td>
                                                    <div className="action-buttons">
                                                        <button className="btn-tiny btn-success" onClick={() => handleApprove(w.id)}>
                                                            ✓ Approve
                                                        </button>
                                                        <button className="btn-tiny btn-danger" onClick={() => handleReject(w.id)}>
                                                            ✕ Reject
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
