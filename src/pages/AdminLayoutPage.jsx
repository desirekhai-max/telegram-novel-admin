import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  MenuIconBackup,
  MenuIconBook,
  MenuIconCart,
  MenuIconChapter,
  MenuIconDashboard,
  MenuIconFilter,
  MenuIconFlag,
  MenuIconReading,
  MenuIconSettings,
  MenuIconUser,
  MenuIconUsers,
  MenuIconVip,
} from '../components/admin/AdminMenuIcons.jsx'
import {
  clearAuth,
  fetchAdminSession,
  getStoredUsername,
  getToken,
  getLegacyToken,
  logoutAdmin,
  refreshLegacyTokenFromAdminSession,
  saveAuth,
} from '../lib/adminAuth.js'
import { formatCambodiaNowText } from '../lib/cambodiaTime.js'
import AdminNotificationPanel from '../components/AdminNotificationPanel.jsx'
import {
  fetchAdminNotifications,
  fetchAdminNotificationsUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/adminNotificationsApi.js'
import { clearReadingRecordsCache } from '../lib/readingRecordsCache.js'

const MENUS = [
  { to: '/admin/dashboard', label: '仪表盘', Icon: MenuIconDashboard },
  { to: '/admin/finance', label: '小说管理', Icon: MenuIconBook },
  { to: '/admin/stats', label: '章节管理', Icon: MenuIconChapter },
  { to: '/admin/lists', label: '阅读管理', Icon: MenuIconReading },
  {
    key: 'orders',
    label: '订单管理',
    Icon: MenuIconCart,
    children: [
      { to: '/admin/orders', label: '订单列表', end: true },
      { to: '/admin/orders/manual', label: '人工加减' },
    ],
  },
  { to: '/admin/users', label: '用户管理', Icon: MenuIconUsers },
  { to: '/admin/reports', label: '举报管理', Icon: MenuIconFlag },
  { to: '/admin/account', label: '账户资料', Icon: MenuIconUser },
  { to: '/admin/app-filters', label: '筛选管理', Icon: MenuIconFilter },
  { to: '/admin/vip-plans', label: '套餐管理', Icon: MenuIconVip },
  { to: '/admin/novel-backup', label: '备份中心', Icon: MenuIconBackup },
  { to: '/admin/settings', label: '设置', Icon: MenuIconSettings },
]

const INITIAL_TIME_TEXT = formatCambodiaNowText(new Date())

export default function AdminLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [nowText, setNowText] = useState(INITIAL_TIME_TEXT)
  const [menuOpen, setMenuOpen] = useState(false)
  const [ordersOpen, setOrdersOpen] = useState(() => location.pathname.startsWith('/admin/orders'))
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyItems, setNotifyItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const userMenuRef = useRef(null)
  const notifyRef = useRef(null)

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
          const existingLegacy = getLegacyToken()
          saveAuth(token, session.username, existingLegacy || undefined)
          setUsername(session.username)
        }
        await refreshLegacyTokenFromAdminSession()
      } catch {
        // 网络波动时不强制登出，保留本地登录态供各页重试
      }
    }
    verifySession()
    return () => {
      active = false
    }
  }, [navigate])

  useEffect(() => {
    if (location.pathname.startsWith('/admin/orders')) setOrdersOpen(true)
  }, [location.pathname])

  useEffect(() => {
    const onDocumentClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
      if (!notifyRef.current?.contains(event.target)) {
        setNotifyOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
    }
  }, [])

  const loadNotifications = useCallback(async () => {
    if (!getLegacyToken()) return
    setNotifyLoading(true)
    try {
      const [listData, count] = await Promise.all([
        fetchAdminNotifications({ limit: 20 }),
        fetchAdminNotificationsUnreadCount(),
      ])
      setNotifyItems(Array.isArray(listData?.items) ? listData.items : [])
      setUnreadCount(count)
    } catch {
      setNotifyItems([])
      setUnreadCount(0)
    } finally {
      setNotifyLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!getLegacyToken()) return
    void loadNotifications()
    const timer = window.setInterval(() => void loadNotifications(), 60000)
    return () => window.clearInterval(timer)
  }, [loadNotifications])

  const toggleNotify = () => {
    setNotifyOpen((prev) => {
      const next = !prev
      if (next) void loadNotifications()
      return next
    })
  }

  const onMarkAllNotifyRead = async () => {
    try {
      await markAllNotificationsRead()
      await loadNotifications()
    } catch {
      /* ignore */
    }
  }

  const onNotifyItemClick = async (row) => {
    try {
      if (!row.read) await markNotificationRead(row.id)
      setNotifyOpen(false)
      await loadNotifications()
      if (row.href) navigate(row.href)
    } catch {
      /* ignore */
    }
  }

  const confirmLogout = async () => {
    await logoutAdmin()
    clearReadingRecordsCache()
    clearAuth()
    navigate('/login', { replace: true })
  }

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith('/admin/notifications')) return '通知中心'
    for (const item of MENUS) {
      if (!item.children?.length) continue
      const child = item.children.find((c) => location.pathname.startsWith(c.to))
      if (child) return child.label
    }
    const item = MENUS.find((m) => m.to && location.pathname.startsWith(m.to))
    if (item) return item.label
    const group = MENUS.find((m) => m.children?.some((c) => location.pathname.startsWith(c.to)))
    return group?.label || '后台'
  }, [location.pathname])

  useEffect(() => {
    document.title = location.pathname.startsWith('/admin/dashboard')
      ? '69KKH Admin'
      : pageTitle
  }, [location.pathname, pageTitle])

  return (
    <main className="admin-shell admin-theme-dark">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-logo">
            <img src="/favicon.png" alt="69KKH NOVEL" className="admin-sidebar-logo-img" />
          </div>
          <div>
            <p className="admin-sidebar-name">69KKH NOVEL</p>
            <p className="admin-sidebar-sub">小说管理后台</p>
          </div>
        </div>
        <nav className="admin-menu">
          {MENUS.map((item) =>
            item.children ? (
              <div key={item.key} className="admin-menu-group">
                <button
                  type="button"
                  className={[
                    'admin-menu-item',
                    'admin-menu-item--parent',
                    location.pathname.startsWith('/admin/orders') ? 'admin-menu-item-active' : '',
                  ].join(' ')}
                  onClick={() => setOrdersOpen((prev) => !prev)}
                  aria-expanded={ordersOpen}
                >
                  <item.Icon className="admin-menu-item-icon" />
                  <span className="admin-menu-item-label">{item.label}</span>
                  <span className={['admin-menu-chevron', ordersOpen ? 'is-open' : ''].join(' ')} aria-hidden>
                    ›
                  </span>
                </button>
                {ordersOpen ? (
                  <div className="admin-menu-sub">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.end}
                        className={({ isActive }) =>
                          `admin-menu-sub-item${isActive ? ' admin-menu-sub-item--active' : ''}`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `admin-menu-item${isActive ? ' admin-menu-item-active' : ''}`
                }
              >
                <item.Icon className="admin-menu-item-icon" />
                <span>{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <div className="admin-sidebar-footer">
          <p className="admin-sidebar-footer-title">69KKH Novel</p>
          <p className="admin-sidebar-footer-version">v1.0.0</p>
          <p className="admin-sidebar-footer-status">
            <span className="admin-sidebar-status-dot" />
            系统正常
          </p>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-top-card admin-shell-top">
          <div className="admin-top-left">
            <h2 className="admin-shell-title">{pageTitle}</h2>
          </div>
          <div className="admin-top-right">
            <div className="admin-notify-wrap" ref={notifyRef}>
              <button
                className="admin-notify-btn"
                type="button"
                aria-label="通知"
                aria-expanded={notifyOpen}
                onClick={toggleNotify}
              >
                <span>🔔</span>
                {unreadCount > 0 ? <span className="admin-notify-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
              </button>
              <AdminNotificationPanel
                open={notifyOpen}
                items={notifyItems}
                unreadCount={unreadCount}
                loading={notifyLoading}
                onClose={() => setNotifyOpen(false)}
                onMarkAllRead={onMarkAllNotifyRead}
                onItemClick={onNotifyItemClick}
              />
            </div>
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
                  <p className="admin-current-user">{username || 'Admin'}</p>
                  <p className="admin-current-user-label">超级管理员</p>
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
