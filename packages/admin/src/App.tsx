import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import DepositsPage from './pages/DepositsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import GamesPage from './pages/GamesPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div className="loading-screen">Loading...</div>;
    if (!user) return <Navigate to="/login" />;
    return <>{children}</>;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
                path="/*"
                element={
                    <PrivateRoute>
                        <Layout>
                            <Routes>
                                <Route path="/" element={<DashboardPage />} />
                                <Route path="/users" element={<UsersPage />} />
                                <Route path="/deposits" element={<DepositsPage />} />
                                <Route path="/withdrawals" element={<WithdrawalsPage />} />
                                <Route path="/games" element={<GamesPage />} />
                            </Routes>
                        </Layout>
                    </PrivateRoute>
                }
            />
        </Routes>
    );
}
