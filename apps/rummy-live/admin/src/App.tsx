import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UserDetailPage from './pages/UserDetailPage';
import DepositsPage from './pages/DepositsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import GamesPage from './pages/GamesPage';
import GameControlsPage from './pages/GameControlsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import SettingsPage from './pages/SettingsPage';
import LiveMonitorPage from './pages/LiveMonitorPage';
import UsersPage from './pages/UsersPage';
import PaymentQRsPage from './pages/PaymentQRsPage';

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
                <Route path="/users/:id" element={<UserDetailPage />} />
                <Route path="/deposits" element={<DepositsPage />} />
                <Route path="/withdrawals" element={<WithdrawalsPage />} />
                <Route path="/games" element={<GamesPage />} />
                <Route path="/game-controls" element={<GameControlsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/audit-logs" element={<AuditLogsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/payment-qrs" element={<PaymentQRsPage />} />
                <Route path="/live-monitor" element={<LiveMonitorPage />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
