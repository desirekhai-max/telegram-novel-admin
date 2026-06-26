import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import AdminLayoutPage from './pages/AdminLayoutPage.jsx'
import DashboardConsolePage from './pages/DashboardConsolePage.jsx'
import ReadingListsPage from './pages/ReadingListsPage.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import ManualVipAdjustPage from './pages/ManualVipAdjustPage.jsx'
import UserManagementPage from './pages/UserManagementPage.jsx'
import AccountProfilePage from './pages/AccountProfilePage.jsx'
import SettingsAdminPage from './pages/SettingsAdminPage.jsx'
import NovelManagementPage from './pages/NovelManagementPage.jsx'
import ChapterManagementPage from './pages/ChapterManagementPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import HomeFiltersAdminPage from './pages/HomeFiltersAdminPage.jsx'
import NovelBackupCenterPage from './pages/NovelBackupCenterPage.jsx'
import VipPlansAdminPage from './pages/VipPlansAdminPage.jsx'
import NotificationsCenterPage from './pages/NotificationsCenterPage.jsx'
import { getToken } from './lib/adminAuth.js'

function ProtectedRoute({ children }) {
  const token = getToken()
  if (!token) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayoutPage />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardConsolePage />} />
        <Route path="lists" element={<ReadingListsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/manual" element={<ManualVipAdjustPage />} />
        <Route path="users" element={<UserManagementPage />} />
        <Route path="finance" element={<NovelManagementPage />} />
        <Route path="account" element={<AccountProfilePage />} />
        <Route path="stats" element={<ChapterManagementPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="app-filters" element={<HomeFiltersAdminPage />} />
        <Route path="vip-plans" element={<VipPlansAdminPage />} />
        <Route path="novel-backup" element={<NovelBackupCenterPage />} />
        <Route path="settings" element={<SettingsAdminPage />} />
        <Route path="notifications" element={<NotificationsCenterPage />} />
      </Route>
      <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}