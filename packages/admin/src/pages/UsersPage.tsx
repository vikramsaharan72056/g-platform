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

    const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
    const isSuperAdmin = adminUser.role === 'SUPER_ADMIN';

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

    const handleAssignParent = async (userId: string) => {
        const parentId = prompt('Enter the ID of the Managing Admin:');
        if (!parentId) return;
        try {
            await usersAPI.assignParent(userId, parentId);
            alert('Parent assigned successfully!');
            loadUsers(meta.page);
        } catch (err: any) {
            alert('Failed to assign parent: ' + (err.response?.data?.message || err.message));
        }
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();
    const formatCurrency = (val: number) => `₹${(val || 0).toLocaleString()}`;

    return (
        <div className="page">
            <div className="page-header">
                <h2>{isSuperAdmin ? 'Global User Management' : 'Managed Users'}</h2>
                <p className="page-subtitle">{meta.total} users {isSuperAdmin ? 'system-wide' : 'under your management'}</p>
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
                                        {isSuperAdmin && <th>Manager</th>}
                                        {isSuperAdmin && <th>Games</th>}
                                        <th>Joined</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user: any) => (
                                        <tr key={user.id}>
                                            <td>
                                                <div className="user-cell">
                                                    <div className="user-cell-avatar">
                                                        {user.displayName?.charAt(0) || user.email.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="user-cell-name">{user.displayName || 'No Name'}</div>
                                                        <div className="user-cell-email">{user.email}</div>
                                                        <div className="user-cell-id">ID: {user.id}</div>
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
                                            {isSuperAdmin && (
                                                <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                                    {user.parentAdminId || '-'}
                                                </td>
                                            )}
                                            {isSuperAdmin && (
                                                <td>
                                                    {user.role === 'ADMIN' ? (
                                                        <span className="badge badge-blue">
                                                            {user._count?.serviceAllocations || 0}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            )}
                                            <td>{formatDate(user.createdAt)}</td>
                                            <td>
                                                <div className="action-buttons">
                                                    {isSuperAdmin && user.role !== 'SUPER_ADMIN' && (
                                                        <button
                                                            className="btn-tiny"
                                                            onClick={() => handleAssignParent(user.id)}
                                                        >Assign Mgr</button>
                                                    )}

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
