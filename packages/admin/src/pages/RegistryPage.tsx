import React, { useState, useEffect } from 'react';
import { registryAPI, gamesAPI, usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    Activity,
    Shield,
    Server,
    Link as LinkIcon,
    Plus,
    Trash2,
    CheckCircle,
    XCircle,
    Clock,
    UserPlus,
    Lock
} from 'lucide-react';
import '../styles/RegistryPage.css';

const RegistryPage: React.FC = () => {
    const { user } = useAuth();
    const [services, setServices] = useState<any[]>([]);
    const [allocations, setAllocations] = useState<any[]>([]);
    const [allGames, setAllGames] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showAllocateModal, setShowAllocateModal] = useState(false);
    const [selectedService, setSelectedService] = useState<any>(null);
    const [admins, setAdmins] = useState<any[]>([]);
    const [formData, setFormData] = useState({ gameId: '', serviceUrl: '', wsUrl: '', internalKey: '', isGlobal: false });
    const [allocData, setAllocData] = useState({ userId: '', allocatedRole: 'ADMIN' as any });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [svcRes, gamesRes, allocRes, adminsRes] = await Promise.all([
                registryAPI.listServices(),
                gamesAPI.list(),
                user?.role === 'SUPER_ADMIN' ? registryAPI.listAllAllocations() : null,
                user?.role === 'SUPER_ADMIN' ? usersAPI.list({ role: 'ADMIN', limit: 100 }) : null
            ]);
            setServices(svcRes.data);
            setAllGames(gamesRes.data);
            if (allocRes) setAllocations(allocRes.data);
            if (adminsRes) setAdmins(adminsRes.data.data);
        } catch (err) {
            console.error('Failed to fetch registry data', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await registryAPI.registerService(formData);
            setShowRegisterModal(false);
            fetchData();
        } catch (err) {
            alert('Failed to register service');
        }
    };

    const handleRevoke = async (id: string) => {
        if (!window.confirm('Are you sure you want to revoke this access?')) return;
        try {
            await registryAPI.revokeAllocation(id, 'Admin revocation');
            fetchData();
        } catch (err) {
            alert('Revocation failed');
        }
    };

    const handleApprove = async (id: string) => {
        try {
            await registryAPI.approveAllocation(id);
            fetchData();
        } catch (err) {
            alert('Approval failed');
        }
    };

    const handleAllocateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await registryAPI.createAllocation({
                gameServiceId: selectedService.id,
                ...allocData
            });
            setShowAllocateModal(false);
            fetchData();
        } catch (err) {
            alert('Allocation failed');
        }
    };

    const getHealthColor = (status: string) => {
        switch (status) {
            case 'HEALTHY': return '#10b981';
            case 'DEGRADED': return '#f59e0b';
            case 'DOWN': return '#ef4444';
            default: return '#6b7280';
        }
    };

    return (
        <div className="registry-container">
            <header className="registry-header">
                <div className="header-info">
                    <h1>Service Registry</h1>
                    <p>Manage Hub & Spoke microservice architecture and allocations</p>
                </div>
                {user?.role === 'SUPER_ADMIN' && (
                    <button className="btn-primary" onClick={() => setShowRegisterModal(true)}>
                        <Plus size={18} /> Register Service
                    </button>
                )}
            </header>

            <div className="stats-grid">
                <div className="stat-card glass shadow">
                    <div className="stat-icon purple"><Server /></div>
                    <div className="stat-data">
                        <h3>{services.length}</h3>
                        <p>Services Registered</p>
                    </div>
                </div>
                <div className="stat-card glass shadow">
                    <div className="stat-icon green"><Activity /></div>
                    <div className="stat-data">
                        <h3>{services.filter(s => s.healthStatus === 'HEALTHY').length}</h3>
                        <p>Healthy Instances</p>
                    </div>
                </div>
                <div className="stat-card glass shadow">
                    <div className="stat-icon gold"><Shield /></div>
                    <div className="stat-data">
                        <h3>{allocations.length}</h3>
                        <p>Total Allocations</p>
                    </div>
                </div>
            </div>

            <section className="services-section">
                <div className="section-title">
                    <Activity size={20} />
                    <h2>Active Spoke Microservices</h2>
                </div>
                <div className="services-grid">
                    {services.map(svc => (
                        <div key={svc.id} className="service-card glass shadow">
                            <div
                                className={`service-badge ${svc.healthStatus === 'HEALTHY' ? 'pulse' : ''}`}
                                style={{ backgroundColor: getHealthColor(svc.healthStatus), color: getHealthColor(svc.healthStatus) }}
                            >
                                {svc.healthStatus}
                            </div>
                            <div className="service-icon">
                                <img src={svc.game.thumbnail || '/placeholder.png'} alt={svc.game.name} />
                            </div>
                            <h3>{svc.game.name}</h3>
                            <div className="service-details">
                                <div className="detail-row">
                                    <LinkIcon size={14} />
                                    <span>{svc.serviceUrl}</span>
                                </div>
                                <div className="detail-row">
                                    <Clock size={14} />
                                    <span>Last Ping: {svc.lastHealthAt ? new Date(svc.lastHealthAt).toLocaleTimeString() : 'Never'}</span>
                                </div>
                            </div>
                            {svc.isGlobal ? (
                                <div className="global-tag"><Shield size={12} /> Global Access</div>
                            ) : (
                                <div className="private-tag"><Lock size={12} /> Private (Allocated)</div>
                            )}
                            <div className="card-actions">
                                {user?.role === 'SUPER_ADMIN' && !svc.isGlobal && (
                                    <button className="btn-primary btn-sm" onClick={() => {
                                        setSelectedService(svc);
                                        setShowAllocateModal(true);
                                    }}>
                                        <Plus size={14} /> Allocate
                                    </button>
                                )}
                                <button className="btn-icon text-red" onClick={() => registryAPI.removeService(svc.id).then(fetchData)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {user?.role === 'SUPER_ADMIN' && (
                <section className="allocations-section">
                    <div className="section-title">
                        <UserPlus size={20} />
                        <h2>Access Allocations</h2>
                    </div>
                    <div className="table-container glass shadow">
                        <table className="dt-table">
                            <thead>
                                <tr>
                                    <th>User ID</th>
                                    <th>Game Service</th>
                                    <th>Capacity</th>
                                    <th>Status</th>
                                    <th>Requested At</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocations.map(alloc => (
                                    <tr key={alloc.id}>
                                        <td><code>{alloc.userId.substring(0, 8)}...</code></td>
                                        <td>{alloc.gameService.game.name}</td>
                                        <td><span className={`badge ${alloc.allocatedRole.toLowerCase()}`}>{alloc.allocatedRole}</span></td>
                                        <td>
                                            <span className={`status-pill ${alloc.status.toLowerCase()}`}>
                                                {alloc.status}
                                            </span>
                                        </td>
                                        <td>{new Date(alloc.requestedAt).toLocaleDateString()}</td>
                                        <td>
                                            <div className="row-actions">
                                                {alloc.status === 'PENDING' && (
                                                    <button className="btn-icon text-green" onClick={() => handleApprove(alloc.id)}>
                                                        <CheckCircle size={18} />
                                                    </button>
                                                )}
                                                {alloc.status === 'APPROVED' && (
                                                    <button className="btn-icon text-red" onClick={() => handleRevoke(alloc.id)}>
                                                        <XCircle size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {showRegisterModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass shadow">
                        <h2>Register New Game Microservice</h2>
                        <form onSubmit={handleRegister}>
                            <div className="form-group">
                                <label>Target Game</label>
                                <select
                                    className="glass-input"
                                    value={formData.gameId}
                                    onChange={e => setFormData({ ...formData, gameId: e.target.value })}
                                    required
                                >
                                    <option value="">Select a game...</option>
                                    {allGames.filter(g => !services.find(s => s.gameId === g.id)).map(g => (
                                        <option key={g.id} value={g.id}>{g.name} ({g.slug})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>API Base URL</label>
                                <input
                                    className="glass-input"
                                    type="url"
                                    placeholder="http://localhost:3402"
                                    value={formData.serviceUrl}
                                    onChange={e => setFormData({ ...formData, serviceUrl: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>WebSocket URL (Optional)</label>
                                <input
                                    className="glass-input"
                                    type="url"
                                    placeholder="ws://localhost:3402"
                                    value={formData.wsUrl}
                                    onChange={e => setFormData({ ...formData, wsUrl: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Internal Security Key</label>
                                <input
                                    className="glass-input"
                                    type="text"
                                    placeholder="Shared secret with Spoke"
                                    value={formData.internalKey}
                                    onChange={e => setFormData({ ...formData, internalKey: e.target.value })}
                                />
                            </div>
                            <div className="form-group checkbox">
                                <input
                                    type="checkbox"
                                    id="isGlobal"
                                    checked={formData.isGlobal}
                                    onChange={e => setFormData({ ...formData, isGlobal: e.target.checked })}
                                />
                                <label htmlFor="isGlobal">Globally Visible to Players</label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-text" onClick={() => setShowRegisterModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Register Instance</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAllocateModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass shadow">
                        <h2>Delegate Game to Admin</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            Grant access to <strong>{selectedService?.game.name}</strong> for a specific business unit / admin.
                        </p>
                        <form onSubmit={handleAllocateSubmit}>
                            <div className="form-group">
                                <label>Target Administrator / Merchant</label>
                                <select
                                    className="glass-input"
                                    value={allocData.userId}
                                    onChange={e => setAllocData({ ...allocData, userId: e.target.value })}
                                    required
                                >
                                    <option value="">Select an admin...</option>
                                    {admins.map(a => (
                                        <option key={a.id} value={a.id}>{a.displayName || a.email} (ID: {a.id.substring(0, 6)})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Assigned Capacity</label>
                                <select
                                    className="glass-input"
                                    value={allocData.allocatedRole}
                                    onChange={e => setAllocData({ ...allocData, allocatedRole: e.target.value as any })}
                                    required
                                >
                                    <option value="ADMIN">Merchant Admin (Full Controls)</option>
                                    <option value="PLAYER">Sub-Player (Restricted Access)</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-text" onClick={() => setShowAllocateModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Grant Access</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegistryPage;
