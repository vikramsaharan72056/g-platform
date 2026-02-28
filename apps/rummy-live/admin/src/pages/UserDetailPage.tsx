import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usersAPI, walletAPI } from '../services/api';

export default function UserDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('transactions');
    const [showCreditModal, setShowCreditModal] = useState(false);
    const [showDebitModal, setShowDebitModal] = useState(false);
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');

    useEffect(() => {
        fetchUser();
    }, [id]);

    const fetchUser = async () => {
        try {
            const res = await usersAPI.detail(id!);
            setUser(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleWalletOp = async (type: 'credit' | 'debit') => {
        const parsedAmount = parseFloat(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        try {
            const fn = type === 'credit' ? walletAPI.adminCredit : walletAPI.adminDebit;
            await fn(id!, parsedAmount, reason || 'Manual adjustment');
            setShowCreditModal(false);
            setShowDebitModal(false);
            setAmount('');
            setReason('');
            fetchUser();
        } catch (err) {
            alert(`Failed to ${type} wallet`);
        }
    };

    if (loading) return <div className="page-loading">Loading...</div>;
    if (!user) return <div className="page-error">User not found</div>;

    const wallet = user.wallet;
    const transactions = user.transactions || [];
    const tabs = ['transactions'];

    return (
        <div className="page user-detail-page">
            <div className="page-header">
                <button className="btn btn-ghost" onClick={() => navigate('/users')}>{'<-'} Back</button>
                <h2>User Detail</h2>
            </div>

            <div className="card profile-card">
                <div className="profile-header">
                    <div className="avatar-large">{user.displayName?.charAt(0) || '?'}</div>
                    <div className="profile-info">
                        <h3>{user.displayName}</h3>
                        <p>{user.email}</p>
                        <div className="badges">
                            <span className={`badge badge-${user.status?.toLowerCase()}`}>{user.status}</span>
                            <span className="badge">{user.role}</span>
                        </div>
                    </div>
                    <div className="profile-actions">
                        <button className="btn btn-primary" onClick={() => setShowCreditModal(true)}>Credit</button>
                        <button className="btn btn-secondary" onClick={() => setShowDebitModal(true)}>Debit</button>
                    </div>
                </div>
            </div>

            {wallet && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-label">Balance</span>
                        <span className="stat-value">Rs {Number(wallet.balance).toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Total Deposited</span>
                        <span className="stat-value">Rs {Number(wallet.totalDeposited).toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Total Withdrawn</span>
                        <span className="stat-value">Rs {Number(wallet.totalWithdrawn).toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Total Won</span>
                        <span className="stat-value">Rs {Number(wallet.totalWon).toLocaleString()}</span>
                    </div>
                </div>
            )}

            <div className="tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        className={`tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            <div className="card tab-content">
                {activeTab === 'transactions' && (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Before</th>
                                <th>After</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((txn: any) => (
                                <tr key={txn.id}>
                                    <td>{txn.id}</td>
                                    <td>{txn.type}</td>
                                    <td>Rs {Number(txn.amount).toLocaleString()}</td>
                                    <td>Rs {Number(txn.balanceBefore).toLocaleString()}</td>
                                    <td>Rs {Number(txn.balanceAfter).toLocaleString()}</td>
                                    <td>{new Date(txn.createdAt).toLocaleString()}</td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ color: 'var(--text-secondary)' }}>
                                        No wallet transactions found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {(showCreditModal || showDebitModal) && (
                <div className="modal-overlay" onClick={() => { setShowCreditModal(false); setShowDebitModal(false); }}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>{showCreditModal ? 'Credit' : 'Debit'} Wallet</h3>
                        <div className="form-group">
                            <label>Amount (Rs)</label>
                            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount" />
                        </div>
                        <div className="form-group">
                            <label>Reason</label>
                            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Enter reason" />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => { setShowCreditModal(false); setShowDebitModal(false); }}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => handleWalletOp(showCreditModal ? 'credit' : 'debit')}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
