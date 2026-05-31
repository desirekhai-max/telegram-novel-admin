import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  clearAuth,
  fetchAdminSession,
  getStoredUsername,
  getToken,
  getLegacyToken,
  logoutAdmin,
  saveAuth,
} from '../lib/adminAuth.js'
import { formatCambodiaNowText } from '../lib/cambodiaTime.js'

const MENUS = [
  { to: '/admin/dashboard', label: '控制台' },
  { to: '/admin/lists', label: '阅读记录' },
  { to: '/admin/orders', label: '订单管理' },
  { to: '/admin/account', label: '账户资料' },
  { to: '/admin/finance', label: '财务' },
  { to: '/admin/stats', label: '数据统计' },
  { to: '/admin/reports', label: '举报管理' },
  { to: '/admin/settings', label: '设置' },
]

const INITIAL_TIME_TEXT = formatCambodiaNowText(new Date())

export default function AdminLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [nowText, setNowText] = useState(INITIAL_TIME_TEXT)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowText(formatCambodiaNowText(new Date()))
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
          saveAuth(token, session.username, getLegacyToken())
          setUsername(session.username)
        }
      } catch {
        clearAuth()
        navigate('/login', { replace: true })
      }
    }
    verifySession()
    return () => {
      active = false
    }
  }, [navigate])

  useEffect(() => {
    const onDocumentClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
    }
  }, [])

  const confirmLogout = async () => {
    await logoutAdmin()
    clearAuth()
    navigate('/login', { replace: true })
  }

  const pageTitle = useMemo(() => {
    const item = MENUS.find((m) => location.pathname.startsWith(m.to))
    return item?.label || '后台'
  }, [location.pathname])

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
          </div>
          <div className="admin-top-right">
            <p className="admin-shell-time">{nowText}</p>
            <div className="admin-user-menu" ref={userMenuRef}>
              <button
                className="admin-user-card"
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <img className="admin-user-avatar" src="/admin-avatar.svg" alt="用户头像" />
                <div className="admin-user-meta">
                  <p className="admin-current-user-label">当前账号</p>
                  <p className="admin-current-user">{username || '管理员'}</p>
                </div>
              </button>
              {menuOpen ? (
                <div className="admin-user-menu-panel" role="menu">
                  <button
                    className="admin-user-menu-item"
                    type="button"
                    onClick={() => setLogoutConfirmOpen(true)}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <Outlet />
      </section>
      {logoutConfirmOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card">
            <p className="admin-modal-title">确认退出登录？</p>
            <p className="admin-modal-sub">点击“确定”后将返回登录页。</p>
            <div className="admin-modal-actions">
              <button
                className="admin-btn admin-modal-btn-cancel"
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
              >
                取消
              </button>
              <button
                className="admin-btn admin-btn-primary"
                type="button"
                onClick={confirmLogout}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
