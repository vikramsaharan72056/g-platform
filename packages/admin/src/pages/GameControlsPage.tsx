import { useEffect, useState } from 'react';
import { gameControlsAPI, gamesAPI } from '../services/api';

export default function GameControlsPage() {
    const [games, setGames] = useState<any[]>([]);
    const [controls, setControls] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForceModal, setShowForceModal] = useState(false);
    const [showWinRateModal, setShowWinRateModal] = useState(false);
    const [showPlayerLimitModal, setShowPlayerLimitModal] = useState(false);

    // Form state
    const [selectedGameId, setSelectedGameId] = useState('');
    const [winner, setWinner] = useState('');
    const [reason, setReason] = useState('');
    const [targetHouseEdge, setTargetHouseEdge] = useState('5');
    const [lowCrash, setLowCrash] = useState('60');
    const [medCrash, setMedCrash] = useState('30');
    const [highCrash, setHighCrash] = useState('10');
    const [targetUserId, setTargetUserId] = useState('');
    const [maxWinPerRound, setMaxWinPerRound] = useState('');
    const [maxWinPerDay, setMaxWinPerDay] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [gamesRes, controlsRes] = await Promise.all([
                gamesAPI.list(),
                gameControlsAPI.getControls(),
            ]);
            setGames(gamesRes.data?.data || gamesRes.data || []);
            setControls(controlsRes.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleForceResult = async () => {
        try {
            await gameControlsAPI.forceResult({
                gameId: selectedGameId,
                winner,
                reason,
            });
            setShowForceModal(false);
            resetForm();
            fetchData();
        } catch (err) {
            alert('Failed to set force result');
        }
    };

    const handleWinRate = async () => {
        try {
            await gameControlsAPI.setWinRate({
                gameId: selectedGameId,
                targetHouseEdge: parseFloat(targetHouseEdge),
                lowCrashProbability: parseFloat(lowCrash),
                mediumCrashProbability: parseFloat(medCrash),
                highCrashProbability: parseFloat(highCrash),
                reason,
            });
            setShowWinRateModal(false);
            resetForm();
            fetchData();
        } catch (err) {
            alert('Failed to set win rate control');
        }
    };

    const handlePlayerLimit = async () => {
        try {
            await gameControlsAPI.setPlayerLimit({
                targetUserId,
                maxWinPerRound: maxWinPerRound ? parseFloat(maxWinPerRound) : undefined,
                maxWinPerDay: maxWinPerDay ? parseFloat(maxWinPerDay) : undefined,
                reason,
            });
            setShowPlayerLimitModal(false);
            resetForm();
            fetchData();
        } catch (err) {
            alert('Failed to set player limit');
        }
    };

    const handleRemoveControl = async (id: string) => {
        if (!confirm('Remove this control?')) return;
        try {
            await gameControlsAPI.removeControl(id);
            fetchData();
        } catch (err) {
            alert('Failed to remove control');
        }
    };

    const resetForm = () => {
        setSelectedGameId('');
        setWinner('');
        setReason('');
        setTargetUserId('');
        setMaxWinPerRound('');
        setMaxWinPerDay('');
    };

    if (loading) return <div className="page-loading">Loading...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <h2>🎛️ Game Controls</h2>
                <div className="header-actions">
                    <button className="btn btn-danger" onClick={() => setShowForceModal(true)}>Force Result</button>
                    <button className="btn btn-warning" onClick={() => setShowWinRateModal(true)}>Win Rate</button>
                    <button className="btn btn-secondary" onClick={() => setShowPlayerLimitModal(true)}>Player Limit</button>
                </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                ⚠️ SUPER_ADMIN only. All actions are logged in the audit trail.
            </p>

            {/* Active Controls */}
            <div className="card">
                <h3>Active Controls</h3>
                {controls.length === 0 ? (
                    <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>No active controls</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Game</th>
                                <th>Type</th>
                                <th>Config</th>
                                <th>Status</th>
                                <th>Expires</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {controls.map((ctrl: any) => (
                                <tr key={ctrl.id}>
                                    <td>{ctrl.game?.name || 'All'}</td>
                                    <td><span className="badge">{ctrl.controlType}</span></td>
                                    <td><code>{JSON.stringify(ctrl.config).substring(0, 60)}...</code></td>
                                    <td><span className={`badge ${ctrl.isActive ? 'badge-success' : 'badge-muted'}`}>{ctrl.isActive ? 'Active' : 'Inactive'}</span></td>
                                    <td>{ctrl.expiresAt ? new Date(ctrl.expiresAt).toLocaleDateString() : '—'}</td>
                                    <td>
                                        <button className="btn btn-sm btn-danger" onClick={() => handleRemoveControl(ctrl.id)}>Remove</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Force Result Modal */}
            {showForceModal && (
                <div className="modal-overlay" onClick={() => setShowForceModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Force Next Round Result</h3>
                        <div className="form-group">
                            <label>Game</label>
                            <select value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)}>
                                <option value="">Select game...</option>
                                {games.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Winner</label>
                            <input value={winner} onChange={e => setWinner(e.target.value)} placeholder="e.g. DRAGON, UP, PLAYER_A" />
                        </div>
                        <div className="form-group">
                            <label>Reason *</label>
                            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you forcing this result?" />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowForceModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleForceResult} disabled={!selectedGameId || !reason}>Apply</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Win Rate Modal */}
            {showWinRateModal && (
                <div className="modal-overlay" onClick={() => setShowWinRateModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Win Rate Control</h3>
                        <div className="form-group">
                            <label>Game</label>
                            <select value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)}>
                                <option value="">Select game...</option>
                                {games.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Target House Edge (%)</label>
                            <input type="number" value={targetHouseEdge} onChange={e => setTargetHouseEdge(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Low Crash Probability (%)</label>
                            <input type="number" value={lowCrash} onChange={e => setLowCrash(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Medium Crash Probability (%)</label>
                            <input type="number" value={medCrash} onChange={e => setMedCrash(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>High Crash Probability (%)</label>
                            <input type="number" value={highCrash} onChange={e => setHighCrash(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Reason *</label>
                            <input value={reason} onChange={e => setReason(e.target.value)} />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowWinRateModal(false)}>Cancel</button>
                            <button className="btn btn-warning" onClick={handleWinRate} disabled={!selectedGameId || !reason}>Apply</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Player Limit Modal */}
            {showPlayerLimitModal && (
                <div className="modal-overlay" onClick={() => setShowPlayerLimitModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Player Limit Control</h3>
                        <div className="form-group">
                            <label>Target User ID</label>
                            <input value={targetUserId} onChange={e => setTargetUserId(e.target.value)} placeholder="Enter user ID" />
                        </div>
                        <div className="form-group">
                            <label>Max Win Per Round (₹)</label>
                            <input type="number" value={maxWinPerRound} onChange={e => setMaxWinPerRound(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Max Win Per Day (₹)</label>
                            <input type="number" value={maxWinPerDay} onChange={e => setMaxWinPerDay(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Reason *</label>
                            <input value={reason} onChange={e => setReason(e.target.value)} />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowPlayerLimitModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handlePlayerLimit} disabled={!targetUserId || !reason}>Apply</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
