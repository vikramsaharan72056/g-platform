import { useState, useEffect } from 'react';
import { usersAPI } from '../services/api';

export default function DashboardPage() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeUsers: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const res = await usersAPI.list({ limit: 1 });
            setStats({
                totalUsers: res.data.meta.total,
                activeUsers: res.data.meta.total,
            });
        } catch (err) {
            console.error('Failed to load stats:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="page-loading">Loading dashboard...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <h2>Dashboard</h2>
                <p className="page-subtitle">Welcome to ABCRummy Admin Panel</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>👥</div>
                    <div className="stat-info">
                        <div className="stat-label">Total Users</div>
                        <div className="stat-value">{stats.totalUsers}</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f093fb, #f5576c)' }}>🟢</div>
                    <div className="stat-info">
                        <div className="stat-label">Active Users</div>
                        <div className="stat-value">{stats.activeUsers}</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #4facfe, #00f2fe)' }}>💰</div>
                    <div className="stat-info">
                        <div className="stat-label">Today's Revenue</div>
                        <div className="stat-value">₹0</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)' }}>🎮</div>
                    <div className="stat-info">
                        <div className="stat-label">Active Games</div>
                        <div className="stat-value">1</div>
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                <div className="card">
                    <div className="card-header">
                        <h3>Quick Actions</h3>
                    </div>
                    <div className="card-body">
                        <div className="quick-actions">
                            <a href="/deposits" className="quick-action-btn">
                                <span>💰</span> Deposit Queue
                            </a>
                            <a href="/withdrawals" className="quick-action-btn">
                                <span>🏧</span> Withdrawal Queue
                            </a>
                            <a href="/users" className="quick-action-btn">
                                <span>👥</span> Manage Users
                            </a>
                            <a href="/games" className="quick-action-btn">
                                <span>🎮</span> Game Control
                            </a>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>System Status</h3>
                    </div>
                    <div className="card-body">
                        <div className="status-item">
                            <span>API Server</span>
                            <span className="status-badge status-online">Online</span>
                        </div>
                        <div className="status-item">
                            <span>Database</span>
                            <span className="status-badge status-online">Connected</span>
                        </div>
                        <div className="status-item">
                            <span>WebSocket</span>
                            <span className="status-badge status-online">Active</span>
                        </div>
                        <div className="status-item">
                            <span>Game Engine</span>
                            <span className="status-badge status-online">Running</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
