import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearAuth,
  fetchAdminSession,
  getStoredUsername,
  getToken,
  logoutAdmin,
  saveAuth,
} from '../lib/adminAuth.js'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const verifySession = async () => {
      const token = getToken()
      const localUsername = getStoredUsername()
      if (!token) {
        navigate('/login', { replace: true })
        return
      }

      if (localUsername) {
        setUsername(localUsername)
      }

      const session = await fetchAdminSession(token)
      if (!session.ok) {
        clearAuth()
        navigate('/login', { replace: true })
        return
      }

      if (session.username) {
        saveAuth(token, session.username)
        setUsername(session.username)
      }

      setChecking(false)
    }

    verifySession()
  }, [navigate])

  const onLogout = async () => {
    await logoutAdmin()
    clearAuth()
    navigate('/login', { replace: true })
  }

  if (checking) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-top-card">正在校验登录状态...</div>
      </main>
    )
  }

  return (
    <main className="admin-dashboard-page">
      <div className="admin-top-card">
        <div className="admin-header-user">
          <p className="admin-current-user-label">当前账号</p>
          <p className="admin-current-user">{username || '管理员'}</p>
        </div>
        <div>
          <p className="admin-welcome">欢迎光临</p>
          <h2 className="admin-name">{username || '管理员'}</h2>
        </div>
        <button className="admin-btn" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </main>
  )
}