import { useState, useEffect } from 'react';
import { usersAPI } from '../services/api';

interface User {
    id: string;
    email: string;
    displayName: string;
    phone: string;
    status: string;
    role: string;
    createdAt: string;
    wallet?: {
        balance: number;
        bonusBalance: number;
        totalDeposited: number;
        totalWithdrawn: number;
    };
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async (page = 1) => {
        setLoading(true);
        try {
            const res = await usersAPI.list({ page, limit: 20, search: search || undefined });
            setUsers(res.data.data);
            setMeta(res.data.meta);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadUsers(1);
    };

    const handleStatusChange = async (userId: string, status: string) => {
        if (!confirm(`Are you sure you want to set status to ${status}?`)) return;
        try {
            await usersAPI.updateStatus(userId, status);
            loadUsers(meta.page);
        } catch (err) {
            console.error('Failed to update status:', err);
        }
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();
    const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString()}`;

    return (
        <div className="page">
            <div className="page-header">
                <h2>User Management</h2>
                <p className="page-subtitle">{meta.total} total users</p>
            </div>

            <div className="card">
                <div className="card-header">
                    <form onSubmit={handleSearch} className="search-form">
                        <input
                            type="text"
                            placeholder="Search by email, name, or phone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="search-input"
                        />
                        <button type="submit" className="btn-small">Search</button>
                    </form>
                </div>

                <div className="card-body">
                    {loading ? (
                        <div className="page-loading">Loading users...</div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th>Status</th>
                                        <th>Balance</th>
                                        <th>Total Deposited</th>
                                        <th>Joined</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.id}>
                                            <td>
                                                <div className="user-cell">
                                                    <div className="user-cell-avatar">
                                                        {user.displayName?.charAt(0) || user.email.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="user-cell-name">{user.displayName || 'No Name'}</div>
                                                        <div className="user-cell-email">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge badge-${user.role === 'SUPER_ADMIN' ? 'red' : user.role === 'ADMIN' ? 'blue' : 'gray'}`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge badge-${user.status === 'ACTIVE' ? 'green' : user.status === 'BANNED' ? 'red' : 'yellow'}`}>
                                                    {user.status}
                                                </span>
                                            </td>
                                            <td>{formatCurrency(user.wallet?.balance || 0)}</td>
                                            <td>{formatCurrency(user.wallet?.totalDeposited || 0)}</td>
                                            <td>{formatDate(user.createdAt)}</td>
                                            <td>
                                                <div className="action-buttons">
                                                    {user.status === 'ACTIVE' && (
                                                        <>
                                                            <button
                                                                className="btn-tiny btn-warn"
                                                                onClick={() => handleStatusChange(user.id, 'SUSPENDED')}
                                                            >Suspend</button>
                                                            <button
                                                                className="btn-tiny btn-danger"
                                                                onClick={() => handleStatusChange(user.id, 'BANNED')}
                                                            >Ban</button>
                                                        </>
                                                    )}
                                                    {user.status !== 'ACTIVE' && (
                                                        <button
                                                            className="btn-tiny btn-success"
                                                            onClick={() => handleStatusChange(user.id, 'ACTIVE')}
                                                        >Activate</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {meta.totalPages > 1 && (
                        <div className="pagination">
                            <button
                                disabled={meta.page <= 1}
                                onClick={() => loadUsers(meta.page - 1)}
                            >Previous</button>
                            <span>Page {meta.page} of {meta.totalPages}</span>
                            <button
                                disabled={meta.page >= meta.totalPages}
                                onClick={() => loadUsers(meta.page + 1)}
                            >Next</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
