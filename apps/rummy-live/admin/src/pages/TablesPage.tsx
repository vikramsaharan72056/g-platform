import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function TablesPage() {
    const [tables, setTables] = useState<any[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [tableState, setTableState] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    const [newTableName, setNewTableName] = useState('Rummy Live Table');
    const [newTablePlayers, setNewTablePlayers] = useState(2);
    const [newTablePointValue, setNewTablePointValue] = useState(10);

    const loadTables = async () => {
        try {
            const res = await api.get('/tables');
            setTables(res.data.data || []);
        } catch (err) {
            console.error('Failed to load tables', err);
        } finally {
            setLoading(false);
        }
    };

    const loadTableState = async (id: string) => {
        try {
            const res = await api.get(`/tables/${id}`);
            setTableState(res.data.data || null);
        } catch (err) {
            console.error('Failed to load table state', err);
        }
    };

    useEffect(() => {
        loadTables();
        const interval = setInterval(loadTables, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedTableId) {
            loadTableState(selectedTableId);
        }
    }, [selectedTableId]);

    const handleCreateTable = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await api.post('/tables', {
                name: newTableName,
                maxPlayers: newTablePlayers,
                betAmount: newTablePointValue
            });
            setSelectedTableId(res.data.data?.id);
            loadTables();
        } catch (err: any) {
            alert(err.response?.data?.message || err.message);
        }
    };

    const handleJoin = async (id: string) => {
        try {
            await api.post(`/tables/${id}/join`);
            setSelectedTableId(id);
            loadTableState(id);
        } catch (err: any) {
            alert(err.response?.data?.message || err.message);
        }
    };

    const handleStart = async (id: string) => {
        try {
            await api.post(`/tables/${id}/start`);
            loadTableState(id);
        } catch (err: any) {
            alert(err.response?.data?.message || err.message);
        }
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>Table Management</h2>
                    <p className="page-subtitle">Configure and monitor live rummy tables</p>
                </div>
                <div className="header-actions">
                    <button className="btn-primary" onClick={() => (document.getElementById('create-modal') as any).showModal()}>
                        + New Table
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginTop: '1rem' }}>
                {/* Left Column: Table List */}
                <div className="card">
                    <div className="card-header">
                        <h3>Available Tables</h3>
                        <button className="btn-small" onClick={loadTables}>Refresh</button>
                    </div>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Players</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            Loading tables...
                                        </td>
                                    </tr>
                                ) : tables.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            No tables yet. Create one!
                                        </td>
                                    </tr>
                                ) : (
                                    tables.map((t) => (
                                        <tr
                                            key={t.id}
                                            onClick={() => setSelectedTableId(t.id)}
                                            style={{ cursor: 'pointer', background: selectedTableId === t.id ? 'var(--bg-hover)' : 'transparent' }}
                                        >
                                            <td>{t.name}</td>
                                            <td>{t.currentPlayers}/{t.maxPlayers}</td>
                                            <td>
                                                <span className={`badge ${t.status === 'IN_PROGRESS' ? 'badge-green' : 'badge-yellow'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td>
                                                <button className="btn-small" onClick={(e) => { e.stopPropagation(); handleJoin(t.id); }}>Join</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Column: Live State */}
                <div className="card">
                    <div className="card-header">
                        <h3>Live Monitor {tableState ? `- ${tableState.name}` : ''}</h3>
                        {tableState?.status === 'WAITING' && (
                            <button className="btn-small" style={{ background: 'var(--success)' }} onClick={() => handleStart(tableState.id)}>Start Game</button>
                        )}
                    </div>
                    <div className="card-body">
                        {!tableState ? (
                            <div className="empty-state">Select a table to monitor real-time updates</div>
                        ) : (
                            <div>
                                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1rem' }}>
                                    <div className="stat-card" style={{ padding: '0.75rem' }}>
                                        <div className="stat-info">
                                            <span className="stat-label">Point Value</span>
                                            <div className="stat-value" style={{ fontSize: '1.1rem' }}>₹{tableState.pointValue}</div>
                                        </div>
                                    </div>
                                    <div className="stat-card" style={{ padding: '0.75rem' }}>
                                        <div className="stat-info">
                                            <span className="stat-label">Host</span>
                                            <div className="stat-value" style={{ fontSize: '1rem' }}>{tableState.hostUserId?.slice(0, 8) || '-'}</div>
                                        </div>
                                    </div>
                                    <div className="stat-card" style={{ padding: '0.75rem' }}>
                                        <div className="stat-info">
                                            <span className="stat-label">Code</span>
                                            <div className="stat-value" style={{ fontSize: '1rem' }}>{tableState.mySeat?.reclaimCode || 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>

                                <h3>Players & Seats</h3>
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Seat</th>
                                                <th>Name</th>
                                                <th>Status</th>
                                                <th>Score</th>
                                                <th>Connection</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(tableState.seats || []).map((s: any) => (
                                                <tr key={s.seatNo}>
                                                    <td>#{s.seatNo}</td>
                                                    <td>{s.name}</td>
                                                    <td>{s.status}</td>
                                                    <td>{s.score}</td>
                                                    <td>
                                                        <span className={`badge ${s.connected ? 'badge-green' : 'badge-red'}`}>
                                                            {s.connected ? 'Connected' : 'Offline'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {tableState.game && (
                                    <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
                                        <h4 style={{ marginBottom: '0.5rem', color: 'var(--accent)' }}>Game State</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <div><span style={{ color: 'var(--text-muted)' }}>Current Turn:</span> <strong>{tableState.game.turn?.userId?.slice(0, 8) || '-'}</strong></div>
                                            <div><span style={{ color: 'var(--text-muted)' }}>Open Card:</span> <strong>{tableState.game.openTop || 'HIDDEN'}</strong></div>
                                            <div><span style={{ color: 'var(--text-muted)' }}>Joker:</span> <strong>{tableState.game.jokerCard || 'HIDDEN'}</strong></div>
                                            <div><span style={{ color: 'var(--text-muted)' }}>Deck Left:</span> <strong>{tableState.game.closedCount} cards</strong></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Simple Create Modal using HTML5 Dialog */}
            <dialog id="create-modal" className="modal-overlay" style={{ border: 'none', background: 'transparent' }}>
                <div className="modal">
                    <h3>Create New Table</h3>
                    <form className="login-form" onSubmit={(e) => { handleCreateTable(e); (document.getElementById('create-modal') as any).close(); }}>
                        <div className="form-group">
                            <label>Table Name</label>
                            <input value={newTableName} onChange={(e) => setNewTableName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Max Players (2-6)</label>
                            <input type="number" min="2" max="6" value={newTablePlayers} onChange={(e) => setNewTablePlayers(Number(e.target.value))} />
                        </div>
                        <div className="form-group">
                            <label>Point Value (₹)</label>
                            <input type="number" min="1" value={newTablePointValue} onChange={(e) => setNewTablePointValue(Number(e.target.value))} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button type="button" className="btn-small" style={{ background: 'var(--bg-hover)' }} onClick={() => (document.getElementById('create-modal') as any).close()}>Cancel</button>
                            <button type="submit" className="btn-primary">Create Table</button>
                        </div>
                    </form>
                </div>
            </dialog>
        </div>
    );
}
