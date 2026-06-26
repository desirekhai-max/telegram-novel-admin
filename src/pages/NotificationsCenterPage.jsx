import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { hasLegacyToken } from '../lib/adminAuth.js'
import {
  CATEGORY_META,
  NOTIFICATION_CATEGORIES,
  fetchAdminNotifications,
  fetchNotificationSettings,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationSettings,
} from '../lib/adminNotificationsApi.js'
import { formatNotificationTime } from '../lib/notificationTime.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'

export default function NotificationsCenterPage() {
  const hasLegacy = hasLegacyToken()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'settings' ? 'settings' : 'list'
  const categoryFilter = searchParams.get('category') || 'all'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [settings, setSettings] = useState({ categories: {} })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [listData, settingsData] = await Promise.all([
        fetchAdminNotifications({
          limit: 100,
          category: categoryFilter === 'all' ? '' : categoryFilter,
        }),
        fetchNotificationSettings(),
      ])
      setItems(Array.isArray(listData?.items) ? listData.items : [])
      setTotal(Number(listData?.total) || 0)
      setUnreadCount(Number(listData?.unreadCount) || 0)
      setSettings(settingsData)
    } catch (err) {
      setError(err?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    if (!hasLegacy) return
    void load()
  }, [hasLegacy, load])

  const onMarkAll = async () => {
    try {
      await markAllNotificationsRead()
      setMessage('已全部标记为已读')
      await load()
    } catch (err) {
      setError(err?.message || '操作失败')
    }
  }

  const onItemClick = async (row) => {
    try {
      if (!row.read) await markNotificationRead(row.id)
      if (row.href) navigate(row.href)
      else await load()
    } catch (err) {
      setError(err?.message || '操作失败')
    }
  }

  const onSaveSettings = async () => {
    setSaving(true)
    setError('')
    try {
      await saveNotificationSettings(settings)
      setMessage('通知设置已保存')
      await load()
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const categoryTabs = useMemo(
    () => [{ key: 'all', icon: '🔔', label: '全部' }, ...NOTIFICATION_CATEGORIES],
    [],
  )

  if (!hasLegacy) {
    return <LegacyRequiredNotice title="通知中心" />
  }

  return (
    <section className="admin-panel admin-notify-center">
      {error ? <p className="admin-error admin-notify-center-alert">{error}</p> : null}
      {message ? <p className="admin-success admin-notify-center-alert">{message}</p> : null}

      <div className="admin-novel-mgmt-table-card admin-notify-center-card">
        <div className="admin-novel-mgmt-table-head admin-notify-center-head">
          <div>
            <h3>通知中心</h3>
            <span className="admin-novel-mgmt-meta">
              {total} 条 · 未读 {unreadCount}
            </span>
          </div>
          <div className="admin-notify-center-head-actions">
            {tab === 'list' ? (
              <button className="admin-btn" type="button" onClick={onMarkAll}>
                ✓ 全部已读
              </button>
            ) : null}
            <button
              className="admin-btn"
              type="button"
              onClick={() => {
                const next = tab === 'settings' ? 'list' : 'settings'
                setSearchParams(next === 'settings' ? { tab: 'settings' } : {})
              }}
            >
              {tab === 'settings' ? '返回列表' : '⚙️ 通知设置'}
            </button>
          </div>
        </div>

        {tab === 'list' ? (
          <>
            <div className="admin-notify-center-filters">
              {categoryTabs.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={[
                    'admin-notify-filter-chip',
                    categoryFilter === c.key ? 'admin-notify-filter-chip--active' : '',
                  ].join(' ')}
                  onClick={() => {
                    const next = c.key === 'all' ? {} : { category: c.key }
                    setSearchParams(next)
                  }}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            <div className="admin-notify-center-list">
              {loading ? (
                <p className="admin-table-empty">加载中…</p>
              ) : items.length ? (
                items.map((row) => {
                  const meta = CATEGORY_META[row.category] || { icon: '🔔', label: row.title }
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={['admin-notify-center-item', !row.read ? 'admin-notify-center-item--unread' : ''].join(' ')}
                      onClick={() => onItemClick(row)}
                    >
                      <div className="admin-notify-item-head">
                        <span className="admin-notify-item-cat">
                          {meta.icon} {meta.label}
                        </span>
                        {!row.read ? <span className="admin-notify-item-dot" aria-hidden /> : null}
                      </div>
                      <p className="admin-notify-item-msg">{row.message}</p>
                      <div className="admin-notify-item-foot">
                        {row.status ? <span className="admin-notify-item-status">{row.status}</span> : null}
                        <span className="admin-notify-item-time">{formatNotificationTime(row.createdAtMs)}</span>
                      </div>
                    </button>
                  )
                })
              ) : (
                <p className="admin-table-empty">暂无通知</p>
              )}
            </div>
          </>
        ) : (
          <div className="admin-notify-settings">
            {NOTIFICATION_CATEGORIES.map((c) => (
              <div key={c.key} className="admin-settings-toggle-row">
                <span>
                  {c.icon} {c.label}
                </span>
                <button
                  type="button"
                  className={[
                    'admin-hfilter-status',
                    settings.categories?.[c.key] !== false ? 'admin-hfilter-status--on' : 'admin-hfilter-status--off',
                  ].join(' ')}
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      categories: { ...p.categories, [c.key]: p.categories?.[c.key] === false },
                    }))
                  }
                >
                  {settings.categories?.[c.key] !== false ? '已开启' : '已关闭'}
                </button>
              </div>
            ))}
            <div className="admin-notify-settings-save">
              <button className="admin-btn admin-btn-primary" type="button" disabled={saving} onClick={onSaveSettings}>
                {saving ? '保存中…' : '保存设置'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
