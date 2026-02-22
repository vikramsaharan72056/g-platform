import { useState, useEffect } from 'react';
import { depositsAPI } from '../services/api';

interface Deposit {
    id: string;
    amount: number;
    status: string;
    utrNumber: string;
    paymentMethod: string;
    screenshotUrl: string;
    createdAt: string;
    user: {
        id: string;
        email: string;
        displayName: string;
    };
    paymentQr: {
        name: string;
        type: string;
    };
}

export default function DepositsPage() {
    const [deposits, setDeposits] = useState<Deposit[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDeposits();
    }, [statusFilter]);

    const loadDeposits = async (page = 1) => {
        setLoading(true);
        try {
            const res = await depositsAPI.queue({ page, limit: 20, status: statusFilter });
            setDeposits(res.data.data);
            setMeta(res.data.meta);
        } catch (err) {
            console.error('Failed to load deposits:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        if (!confirm('Approve this deposit? Wallet will be credited.')) return;
        try {
            await depositsAPI.approve(id, 'Approved by admin');
            loadDeposits(meta.page);
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to approve');
        }
    };

    const handleReject = async (id: string) => {
        const reason = prompt('Enter rejection reason:');
        if (!reason) return;
        try {
            await depositsAPI.reject(id, reason);
            loadDeposits(meta.page);
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to reject');
        }
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();
    const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString()}`;

    return (
        <div className="page">
            <div className="page-header">
                <h2>Deposit Queue</h2>
                <p className="page-subtitle">{meta.total} {statusFilter.toLowerCase()} deposits</p>
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
                        <div className="page-loading">Loading deposits...</div>
                    ) : deposits.length === 0 ? (
                        <div className="empty-state">No {statusFilter.toLowerCase()} deposits</div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Amount</th>
                                        <th>UTR</th>
                                        <th>Method</th>
                                        <th>QR Used</th>
                                        <th>Date</th>
                                        {statusFilter === 'PENDING' && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {deposits.map((d) => (
                                        <tr key={d.id}>
                                            <td>
                                                <div className="user-cell">
                                                    <div className="user-cell-avatar">
                                                        {d.user?.displayName?.charAt(0) || '?'}
                                                    </div>
                                                    <div>
                                                        <div className="user-cell-name">{d.user?.displayName}</div>
                                                        <div className="user-cell-email">{d.user?.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="amount-cell">{formatCurrency(d.amount)}</td>
                                            <td><code>{d.utrNumber || '—'}</code></td>
                                            <td>{d.paymentMethod}</td>
                                            <td>{d.paymentQr?.name}</td>
                                            <td>{formatDate(d.createdAt)}</td>
                                            {statusFilter === 'PENDING' && (
                                                <td>
                                                    <div className="action-buttons">
                                                        <button className="btn-tiny btn-success" onClick={() => handleApprove(d.id)}>
                                                            ✓ Approve
                                                        </button>
                                                        <button className="btn-tiny btn-danger" onClick={() => handleReject(d.id)}>
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
