import { useNavigate } from 'react-router-dom'
import { CATEGORY_META } from '../lib/adminNotificationsApi.js'
import { formatNotificationTime } from '../lib/notificationTime.js'

export default function AdminNotificationPanel({
  open,
  items,
  unreadCount,
  loading,
  onClose,
  onMarkAllRead,
  onItemClick,
}) {
  const navigate = useNavigate()

  if (!open) return null

  return (
    <div className="admin-notify-panel" role="dialog" aria-label="通知面板">
      <div className="admin-notify-panel-head">
        <span className="admin-notify-panel-title">🔔 未读通知（{unreadCount}）</span>
      </div>

      <div className="admin-notify-panel-body">
        {loading ? (
          <p className="admin-notify-empty">加载中…</p>
        ) : items.length ? (
          items.map((row) => {
            const meta = CATEGORY_META[row.category] || { icon: '🔔', label: row.title }
            return (
              <button
                key={row.id}
                type="button"
                className={['admin-notify-item', !row.read ? 'admin-notify-item--unread' : ''].join(' ')}
                onClick={() => onItemClick?.(row)}
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
          <p className="admin-notify-empty">暂无通知</p>
        )}
      </div>

      <div className="admin-notify-panel-foot">
        <button className="admin-notify-foot-btn" type="button" onClick={onMarkAllRead}>
          ✓ 全部已读
        </button>
        <button
          className="admin-notify-foot-btn"
          type="button"
          onClick={() => {
            onClose?.()
            navigate('/admin/notifications')
          }}
        >
          📋 查看通知中心
        </button>
        <button
          className="admin-notify-foot-btn"
          type="button"
          onClick={() => {
            onClose?.()
            navigate('/admin/notifications?tab=settings')
          }}
        >
          ⚙️ 通知设置
        </button>
      </div>
    </div>
  )
}
