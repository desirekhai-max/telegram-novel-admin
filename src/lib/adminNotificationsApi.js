import { getLegacyToken } from './adminAuth.js'
import { apiUrl } from './apiBase.js'

async function requestJson(path, { method = 'GET', body, query } = {}) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })
  const qs = params.toString()

  const response = await fetch(apiUrl(`${path}${qs ? `?${qs}` : ''}`), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `请求失败(${response.status})`)
  }
  return data
}

export async function fetchAdminNotifications(query = {}) {
  return requestJson('/api/admin-legacy/notifications', { query })
}

export async function fetchAdminNotificationsUnreadCount() {
  const data = await requestJson('/api/admin-legacy/notifications/unread-count')
  return Number(data?.count) || 0
}

export async function markNotificationRead(id) {
  return requestJson(`/api/admin-legacy/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead() {
  return requestJson('/api/admin-legacy/notifications/read-all', { method: 'POST' })
}

export async function fetchNotificationSettings() {
  const data = await requestJson('/api/admin-legacy/notifications/settings')
  return data?.settings || {}
}

export async function saveNotificationSettings(settings) {
  const data = await requestJson('/api/admin-legacy/notifications/settings', {
    method: 'PUT',
    body: { settings },
  })
  return data?.settings || settings
}

export const NOTIFICATION_CATEGORIES = [
  { key: 'order', icon: '💰', label: '订单通知' },
  { key: 'user', icon: '👤', label: '用户通知' },
  { key: 'novel', icon: '📖', label: '小说通知' },
  { key: 'comment', icon: '💬', label: '评论通知' },
  { key: 'report', icon: '🚩', label: '举报通知' },
  { key: 'vip', icon: '👑', label: 'VIP通知' },
  { key: 'system', icon: '⚙️', label: '系统通知' },
  { key: 'announcement', icon: '📢', label: '公告通知' },
]

export const CATEGORY_META = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, { icon: c.icon, label: c.label }]),
)
