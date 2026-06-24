import { getToken } from './adminAuth.js'
import { apiUrl, getApiOriginLabel } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'

async function requestJson(path, { method = 'GET', body, query } = {}) {
  const token = getToken()
  if (!token) throw new Error('需要管理员登录，请重新登录')

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
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const raw = data?.error || `请求失败(${response.status})`
    throw new Error(humanizeApiError(raw, `请求失败(${response.status})`))
  }
  return data
}

const CLIENT_TEST_TELEGRAM_IDS = new Set([
  '123',
  '123456789',
  '22334455',
  '998877665',
  '887766554',
])

/** 客户端二次过滤：仅展示 TG Mini App 真实用户 */
export function isTelegramAppUserRow(row) {
  const tgId = String(row?.tgId || row?.id || '').trim()
  if (!tgId || !/^\d{8,}$/.test(tgId)) return false
  if (CLIENT_TEST_TELEGRAM_IDS.has(tgId)) return false
  if (row?.fromTelegramApp === false) return false
  if (row?.authVerified === false) return false
  return true
}

export function normalizeAdminUserRow(row, idx = 0) {
  const tgId = String(row?.tgId || row?.telegramId || row?.userId || row?.id || idx)
  const userType = String(row?.userType || row?.role || 'normal')
  const vipActive = row?.vipActive === true || userType === 'vip'
  return {
    id: tgId,
    tgId,
    avatar: row?.avatar || row?.photoUrl || '',
    nickname: row?.nickname || row?.firstName || row?.displayName || '—',
    username: row?.username || '',
    vipActive,
    packageName: row?.packageName || '—',
    vipExpiresAt: row?.vipExpiresAt || '—',
    spendUsd: Number(row?.spendUsd) || 0,
    commentCount: Number(row?.commentCount) || 0,
    favoriteCount: Number(row?.favoriteCount) || 0,
    readCount: Number(row?.readCount) || 0,
    statusLabel:
      row?.statusLabel ||
      (row?.isBanned ? '已封禁' : userType === 'author' ? '作者' : vipActive ? 'VIP' : row?.isOnline ? '在线' : '普通'),
    userType: userType === 'author' ? 'author' : vipActive ? 'vip' : 'normal',
    isBanned: Boolean(row?.isBanned),
    whitelist: Boolean(row?.whitelist),
    isOnline: row?.isOnline === true,
    ipLocation: row?.ipLocation || '—',
    lastSeenAt: Number(row?.lastSeenAt) || 0,
    authVerified: row?.authVerified,
    fromTelegramApp: row?.fromTelegramApp,
  }
}

export function normalizeAdminUsers(data) {
  const list = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : []
  return list.map((row, idx) => normalizeAdminUserRow(row, idx))
}

/** 与正式 APP 同源：GET /api/users */
export async function fetchAdminUsers() {
  const data = await requestJson('/api/users', { query: { t: Date.now() } })
  return normalizeAdminUsers(data)
}

/** PATCH /api/users/:id/flags */
export async function patchAdminUserFlags(userId, patch) {
  const id = String(userId || '').trim()
  if (!id) throw new Error('用户 ID 无效')
  const data = await requestJson(`/api/users/${encodeURIComponent(id)}/flags`, {
    method: 'PATCH',
    body: patch,
  })
  return data?.user ? normalizeAdminUserRow(data.user) : null
}

export { getApiOriginLabel }
