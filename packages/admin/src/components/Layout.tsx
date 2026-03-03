import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ReactNode } from 'react';
import {
    LayoutDashboard,
    Users,
    CircleDollarSign,
    Banknote,
    Gamepad2,
    Settings2,
    BarChart3,
    Server,
    FileText,
    ClipboardList,
    Settings,
    MonitorDot,
    LogOut
} from 'lucide-react';

const navItems = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/users', label: 'Users', icon: <Users size={20} /> },
    { path: '/deposits', label: 'Deposits', icon: <CircleDollarSign size={20} /> },
    { path: '/withdrawals', label: 'Withdrawals', icon: <Banknote size={20} /> },
    { path: '/games', label: 'Games', icon: <Gamepad2 size={20} /> },
    { path: '/game-controls', label: 'Game Controls', icon: <Settings2 size={20} /> },
    { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
    { path: '/registry', label: 'Service Registry', icon: <Server size={20} /> },
    { path: '/reports', label: 'Merchant Reports', icon: <FileText size={20} /> },
    { path: '/audit-logs', label: 'Audit Logs', icon: <ClipboardList size={20} /> },
    { path: '/live-monitor', label: 'Live Monitor', icon: <MonitorDot size={20} /> },
    { path: '/settings', label: 'Settings', icon: <Settings size={20} /> },
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
                        <span className="logo-icon">GP</span>
                        <div>
                            <h1>G-Platform</h1>
                            <span className="logo-subtitle">COMMAND CENTER</span>
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
                            <div className="user-role">{user?.role?.replace('_', ' ')}</div>
                        </div>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={14} style={{ marginRight: 8 }} /> Logout
                    </button>
                </div>
            </aside>

            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
