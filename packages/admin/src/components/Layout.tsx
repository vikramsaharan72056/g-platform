import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ReactNode } from 'react';

const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/users', label: 'Users', icon: '👥' },
    { path: '/deposits', label: 'Deposits', icon: '💰' },
    { path: '/withdrawals', label: 'Withdrawals', icon: '🏧' },
    { path: '/games', label: 'Games', icon: '🎮' },
    { path: '/game-controls', label: 'Game Controls', icon: '🎛️' },
    { path: '/analytics', label: 'Analytics', icon: '📈' },
    { path: '/audit-logs', label: 'Audit Logs', icon: '📝' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
    { path: '/live-monitor', label: 'Live Monitor', icon: '📡' },
];

export default function Layout({ children }: { children: ReactNode }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="layout">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo">
                        <span className="logo-icon">AR</span>
                        <div>
                            <h1>ABCRummy</h1>
                            <span className="logo-subtitle">Admin Panel</span>
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) =>
                                `nav-item ${isActive ? 'active' : ''}`
                            }
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {user?.displayName?.charAt(0) || 'A'}
                        </div>
                        <div>
                            <div className="user-name">{user?.displayName}</div>
                            <div className="user-role">{user?.role}</div>
                        </div>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </aside>

            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
