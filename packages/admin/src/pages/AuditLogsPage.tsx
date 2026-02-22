import { useEffect, useState } from 'react';
import { auditAPI } from '../services/api';

export default function AuditLogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [actionFilter, setActionFilter] = useState('');
    const [resourceFilter, setResourceFilter] = useState('');

    useEffect(() => {
        fetchLogs();
    }, [page, actionFilter, resourceFilter]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params: any = { page, limit: 20 };
            if (actionFilter) params.action = actionFilter;
            if (resourceFilter) params.resource = resourceFilter;
            const res = await auditAPI.list(params);
            setLogs(res.data.data || []);
            setTotalPages(res.data.totalPages || 1);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const actionTypes = [
        '', 'game.force_result', 'game.win_rate_control', 'game.player_limit',
        'game.control_removed', 'game.config_update', 'admin.user.status_change',
        'deposit.approve', 'deposit.reject', 'withdrawal.approve', 'withdrawal.reject',
    ];

    return (
        <div className="page">
            <div className="page-header">
                <h2>📝 Audit Logs</h2>
            </div>

            <div className="filters" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} className="select-input">
                    <option value="">All Actions</option>
                    {actionTypes.filter(Boolean).map(a => (
                        <option key={a} value={a}>{a}</option>
                    ))}
                </select>
                <select value={resourceFilter} onChange={e => { setResourceFilter(e.target.value); setPage(1); }} className="select-input">
                    <option value="">All Resources</option>
                    <option value="game">Game</option>
                    <option value="user">User</option>
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                    <option value="game_admin_control">Game Control</option>
                </select>
            </div>

            <div className="card">
                {loading ? (
                    <div className="page-loading">Loading...</div>
                ) : logs.length === 0 ? (
                    <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No audit logs found</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Admin ID</th>
                                <th>Action</th>
                                <th>Resource</th>
                                <th>Resource ID</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log: any) => (
                                <tr key={log.id}>
                                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                                    <td title={log.userId}>{log.userId.substring(0, 8)}...</td>
                                    <td><span className="badge">{log.action}</span></td>
                                    <td>{log.resource}</td>
                                    <td title={log.resourceId}>{log.resourceId.substring(0, 8)}...</td>
                                    <td><code>{JSON.stringify(log.details || {}).substring(0, 50)}</code></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="pagination">
                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
        </div>
    );
}
