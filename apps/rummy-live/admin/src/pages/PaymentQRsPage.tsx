import { useState, useEffect } from 'react';
import { depositsAPI } from '../services/api';

interface PaymentQr {
    id: number;
    name: string;
    type: string;
    upiId: string | null;
    qrImageUrl: string | null;
    isActive: boolean;
    createdAt: string;
}

export default function PaymentQRsPage() {
    const [qrs, setQrs] = useState<PaymentQr[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newQr, setNewQr] = useState({ name: '', upiId: '', type: 'UPI' });

    const loadQrs = async () => {
        setLoading(true);
        try {
            const res = await depositsAPI.getQrs();
            setQrs(res.data);
        } catch (err) {
            console.error('Failed to load QRs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadQrs();
    }, []);

    const handleCreate = async () => {
        if (!newQr.name || !newQr.upiId) return alert('Name and UPI ID are required');
        try {
            await depositsAPI.createQr(newQr);
            setShowAdd(false);
            setNewQr({ name: '', upiId: '', type: 'UPI' });
            loadQrs();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to create QR');
        }
    };

    const handleToggle = async (id: number, currentStatus: boolean) => {
        try {
            await depositsAPI.toggleQr(String(id), !currentStatus);
            loadQrs();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to toggle status');
        }
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>🏦 Payment QR Codes</h2>
                    <p className="page-subtitle">Manage payment methods for player deposits</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
                    {showAdd ? '✕ Cancel' : '+ Add New QR'}
                </button>
            </div>

            {showAdd && (
                <div className="card" style={{ marginBottom: '2rem' }}>
                    <div className="card-header"><h3>Add New Payment Method</h3></div>
                    <div className="card-body">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Display Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. PhonePe QR"
                                    value={newQr.name}
                                    onChange={e => setNewQr({ ...newQr, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>UPI ID</label>
                                <input
                                    type="text"
                                    placeholder="e.g. merchant@ybl"
                                    value={newQr.upiId}
                                    onChange={e => setNewQr({ ...newQr, upiId: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Type</label>
                                <select
                                    value={newQr.type}
                                    onChange={e => setNewQr({ ...newQr, type: e.target.value })}
                                    className="select-input"
                                >
                                    <option value="UPI">UPI</option>
                                    <option value="BANK">Bank Transfer</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-primary" onClick={handleCreate}>Create Method</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-body">
                    {loading ? (
                        <div className="page-loading">Loading methods...</div>
                    ) : qrs.length === 0 ? (
                        <div className="empty-state">No payment methods found</div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Details</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {qrs.map((qr) => (
                                        <tr key={qr.id}>
                                            <td style={{ fontWeight: 'bold' }}>{qr.name}</td>
                                            <td><span className="badge badge-muted">{qr.type}</span></td>
                                            <td><code>{qr.upiId}</code></td>
                                            <td>
                                                <span className={`badge ${qr.isActive ? 'badge-success' : 'badge-danger'}`}>
                                                    {qr.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>{new Date(qr.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <button
                                                    className={`btn-tiny ${qr.isActive ? 'btn-danger' : 'btn-success'}`}
                                                    onClick={() => handleToggle(qr.id, qr.isActive)}
                                                >
                                                    {qr.isActive ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </td>
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
