import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAdmin } from './components/RequireAdmin';
import { RequireAuth } from './components/RequireAuth';
import { AccountSecurity } from './pages/AccountSecurity';
import { AdminControls } from './pages/AdminControls';
import { AdminDashboard } from './pages/AdminDashboard';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { SecurityMonitoring } from './pages/SecurityMonitoring';
import { WalletManagement } from './pages/WalletManagement';
import { WalletStatus } from './pages/WalletStatus';

function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/wallet-status" element={<WalletStatus />} />
          <Route path="/security" element={<AccountSecurity />} />
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/wallets" element={<WalletManagement />} />
          <Route path="/admin/security" element={<SecurityMonitoring />} />
          <Route path="/admin/controls" element={<AdminControls />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
