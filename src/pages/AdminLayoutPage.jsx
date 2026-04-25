import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  clearAuth,
  fetchAdminSession,
  getStoredUsername,
  getToken,
  logoutAdmin,
  saveAuth,
} from '../lib/adminAuth.js'

const MENUS = [
  { to: '/admin/dashboard', label: '控制台' },
  { to: '/admin/lists', label: '阅读记录管理' },
  { to: '/admin/orders', label: '订单管理' },
  { to: '/admin/users', label: '用户' },
  { to: '/admin/finance', label: '财务' },
  { to: '/admin/account', label: '账户资料' },
  { to: '/admin/stats', label: '数据统计' },
  { to: '/admin/reports', label: '报表' },
  { to: '/admin/settings', label: '设置' },
]
const INITIAL_TIME_TEXT = new Date().toLocaleString('zh-CN', { hour12: false })

export default function AdminLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [checking, setChecking] = useState(true)
  const [nowText, setNowText] = useState(INITIAL_TIME_TEXT)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowText(new Date().toLocaleString('zh-CN', { hour12: false }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    const verifySession = async () => {
      try {
        const token = getToken()
        const localUsername = getStoredUsername()
        if (!token) {
          navigate('/login', { replace: true })
          return
        }
        if (localUsername) setUsername(localUsername)

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
      } catch {
        clearAuth()
        navigate('/login', { replace: true })
      } finally {
        if (active) setChecking(false)
      }
    }
    verifySession()
    return () => {
      active = false
    }
  }, [navigate])

  const onLogout = async () => {
    const token = getToken()
    await logoutAdmin(token)
    clearAuth()
    navigate('/login', { replace: true })
  }

  const pageTitle = useMemo(() => {
    const item = MENUS.find((m) => location.pathname.startsWith(m.to))
    return item?.label || '后台'
  }, [location.pathname])

  if (checking) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-top-card">正在校验登录状态...</div>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <p className="admin-sidebar-name">69KKH Novel</p>
          <p className="admin-sidebar-sub">独立系统后台</p>
        </div>
        <nav className="admin-menu">
          {MENUS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `admin-menu-item${isActive ? ' admin-menu-item-active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-top-card admin-shell-top">
          <div className="admin-top-left">
            <h2 className="admin-shell-title">{pageTitle}</h2>
            <p className="admin-shell-time">{nowText}</p>
          </div>
          <div className="admin-header-user">
            <p className="admin-current-user-label">当前账号</p>
            <p className="admin-current-user">{username || '管理员'}</p>
          </div>
          <button className="admin-btn" onClick={onLogout}>
            退出登录
          </button>
        </header>
        <Outlet />
      </section>
    </main>
  )
}
