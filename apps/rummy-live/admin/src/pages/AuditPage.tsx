import React, { useEffect, useState } from 'react';
import { auditAPI } from '../services/api';

export default function AuditPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    const loadAudit = async () => {
        setLoading(true);
        try {
            const res = await auditAPI.list({ action: filter || undefined });
            setRows(res.data.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAudit();
    }, [filter]);

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>Audit Logs</h2>
                    <p className="page-subtitle">Historical record of all platform actions</p>
                </div>
                <div className="header-actions">
                    <input
                        className="search-input"
                        placeholder="Search by action (e.g. TABLE_CREATE)..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <button className="btn-primary" onClick={loadAudit}>Refresh</button>
                </div>
            </div>

            <div className="card">
                <div className="table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Action</th>
                                <th>Actor</th>
                                <th>Table</th>
                                <th>Payload</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        Loading audit logs...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        No audit logs found
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <tr key={row.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(row.createdAt).toLocaleString()}</td>
                                        <td><span className="badge badge-blue">{row.action}</span></td>
                                        <td>{row.actorUserId?.slice(0, 8) || 'SYSTEM'}</td>
                                        <td>{row.tableId?.slice(0, 8) || '-'}</td>
                                        <td>
                                            <details>
                                                <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>View Data</summary>
                                                <pre style={{ fontSize: '0.7rem', marginTop: '0.5rem', maxHeight: '150px', overflow: 'auto' }}>
                                                    {JSON.stringify(row.payload, null, 2)}
                                                </pre>
                                            </details>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
