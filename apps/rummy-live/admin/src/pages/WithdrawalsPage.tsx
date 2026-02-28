import { useState, useEffect } from 'react';
import { withdrawalsAPI } from '../services/api';

interface Withdrawal {
    id: string;
    amount: number;
    status: string;
    bankName: string | null;
    accountNumber: string | null;
    ifscCode: string | null;
    upiId: string | null;
    paymentRef: string | null;
    remarks: string | null;
    rejectionReason: string | null;
    createdAt: string;
    user: {
        id: string;
        displayName: string;
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
            setWithdrawals(res.data.data || []);
            setMeta(res.data.meta || { total: 0, page: 1, totalPages: 1 });
        } catch (err) {
            console.error('Failed to load withdrawals:', err);
            setWithdrawals([]);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        const paymentRef = prompt('Enter payment reference / UTR number:');
        if (!paymentRef) return;
        try {
            await withdrawalsAPI.approve(id, paymentRef, 'Approved by admin');
            loadWithdrawals(meta.page);
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to approve');
        }
    };

    const handleReject = async (id: string) => {
        const reason = prompt('Enter rejection reason (amount will be refunded to user):');
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
        if (w.upiId) return `UPI: ${w.upiId}`;
        if (w.accountNumber) return `${w.bankName || 'Bank'} - ${w.accountNumber} (${w.ifscCode || '-'})`;
        return '—';
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
                        {['PENDING', 'APPROVED', 'REJECTED'].map((s) => (
                            <button
                                key={s}
                                className={`filter-tab ${statusFilter === s ? 'active' : ''}`}
                                onClick={() => setStatusFilter(s)}
                            >
                                {s}
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
                                        <th>Payout To</th>
                                        <th>Date</th>
                                        {statusFilter === 'APPROVED' && <th>Payment Ref</th>}
                                        {statusFilter === 'REJECTED' && <th>Reason</th>}
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
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="amount-cell">{formatCurrency(w.amount)}</td>
                                            <td><code>{getPayoutDisplay(w)}</code></td>
                                            <td>{formatDate(w.createdAt)}</td>
                                            {statusFilter === 'APPROVED' && <td><code>{w.paymentRef || '—'}</code></td>}
                                            {statusFilter === 'REJECTED' && <td style={{ color: '#ef4444' }}>{w.rejectionReason || '—'}</td>}
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
