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

    const handleStatusChange = async (status: string) => {
        if (!confirm(`Are you sure you want to ${status.toLowerCase()} this user?`)) return;
        try {
            await usersAPI.updateStatus(id!, status);
            fetchUser();
        } catch (err) {
            alert('Failed to update status');
        }
    };

    const handleWalletOp = async (type: 'credit' | 'debit') => {
        try {
            const fn = type === 'credit' ? walletAPI.adminCredit : walletAPI.adminDebit;
            await fn(id!, parseFloat(amount), reason);
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
    const tabs = ['transactions', 'bets', 'logins'];

    return (
        <div className="page user-detail-page">
            <div className="page-header">
                <button className="btn btn-ghost" onClick={() => navigate('/users')}>← Back</button>
                <h2>User Detail</h2>
            </div>

            {/* Profile Card */}
            <div className="card profile-card">
                <div className="profile-header">
                    <div className="avatar-large">{user.displayName?.charAt(0) || '?'}</div>
                    <div className="profile-info">
                        <h3>{user.displayName}</h3>
                        <p>{user.email}</p>
                        {user.phone && <p>{user.phone}</p>}
                        <div className="badges">
                            <span className={`badge badge-${user.status?.toLowerCase()}`}>{user.status}</span>
                            <span className="badge">{user.role}</span>
                            <span className={`badge badge-${user.kycStatus?.toLowerCase()}`}>KYC: {user.kycStatus}</span>
                            {user.twoFactorEnabled && <span className="badge badge-success">2FA ✓</span>}
                        </div>
                    </div>
                    <div className="profile-actions">
                        {user.status === 'ACTIVE' && (
                            <>
                                <button className="btn btn-warning" onClick={() => handleStatusChange('SUSPENDED')}>Suspend</button>
                                <button className="btn btn-danger" onClick={() => handleStatusChange('BANNED')}>Ban</button>
                            </>
                        )}
                        {user.status !== 'ACTIVE' && (
                            <button className="btn btn-success" onClick={() => handleStatusChange('ACTIVE')}>Activate</button>
                        )}
                        <button className="btn btn-primary" onClick={() => setShowCreditModal(true)}>Credit</button>
                        <button className="btn btn-secondary" onClick={() => setShowDebitModal(true)}>Debit</button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            {wallet && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-label">Balance</span>
                        <span className="stat-value">₹{Number(wallet.balance).toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Total Deposited</span>
                        <span className="stat-value">₹{Number(wallet.totalDeposited).toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Total Withdrawn</span>
                        <span className="stat-value">₹{Number(wallet.totalWithdrawn).toLocaleString()}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Total Won</span>
                        <span className="stat-value">₹{Number(wallet.totalWon).toLocaleString()}</span>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="tabs">
                {tabs.map(tab => (
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
                {activeTab === 'bets' && user.bets && (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Game</th>
                                <th>Bet Type</th>
                                <th>Amount</th>
                                <th>Payout</th>
                                <th>Status</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {user.bets.map((bet: any) => (
                                <tr key={bet.id}>
                                    <td>{bet.gameRound?.game?.name || '—'}</td>
                                    <td>{bet.betType}</td>
                                    <td>₹{Number(bet.amount).toLocaleString()}</td>
                                    <td>₹{Number(bet.actualPayout).toLocaleString()}</td>
                                    <td><span className={`badge badge-${bet.status?.toLowerCase()}`}>{bet.status}</span></td>
                                    <td>{new Date(bet.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {activeTab === 'logins' && user.loginHistory && (
                    <table className="data-table">
                        <thead>
                            <tr><th>IP Address</th><th>Device</th><th>Date</th></tr>
                        </thead>
                        <tbody>
                            {user.loginHistory.map((l: any) => (
                                <tr key={l.id}>
                                    <td>{l.ipAddress}</td>
                                    <td>{l.userAgent?.substring(0, 50)}...</td>
                                    <td>{new Date(l.loginAt).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {activeTab === 'transactions' && (
                    <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                        Transaction history for this user is viewable via the wallet module.
                    </p>
                )}
            </div>

            {/* Credit/Debit Modals */}
            {(showCreditModal || showDebitModal) && (
                <div className="modal-overlay" onClick={() => { setShowCreditModal(false); setShowDebitModal(false); }}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>{showCreditModal ? 'Credit' : 'Debit'} Wallet</h3>
                        <div className="form-group">
                            <label>Amount (₹)</label>
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
