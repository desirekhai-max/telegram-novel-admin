import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import AdminLayoutPage from './pages/AdminLayoutPage.jsx'
import DashboardConsolePage from './pages/DashboardConsolePage.jsx'
import ReadingListsPage from './pages/ReadingListsPage.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
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
        <Route path="users" element={<PlaceholderPage title="用户" />} />
        <Route path="finance" element={<PlaceholderPage title="财务" />} />
        <Route path="account" element={<PlaceholderPage title="账户资料" />} />
        <Route path="stats" element={<PlaceholderPage title="数据统计" />} />
        <Route path="reports" element={<PlaceholderPage title="报表" />} />
        <Route path="settings" element={<PlaceholderPage title="设置" />} />
      </Route>
      <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}