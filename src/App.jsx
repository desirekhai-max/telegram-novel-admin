import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
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
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}