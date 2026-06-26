import { getToken } from './adminAuth.js'
import { apiUrl, getApiOriginLabel } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'
import { getSettlementStartMs } from './cambodiaTime.js'

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

/** 列表「状态」列：在线 / 离线 / 已封禁（与 VIP 列分离） */
export function resolveUserPresenceStatus(row) {
  if (Boolean(row?.isBanned)) {
    return { label: '已封禁', variant: 'banned' }
  }
  if (row?.isOnline === true) {
    return { label: '在线', variant: 'online' }
  }
  return { label: '离线', variant: 'offline' }
}

/** 与用户管理「状态」列一致：统计当前在线人数（不含已封禁） */
export function countOnlineUsers(users = []) {
  if (!Array.isArray(users)) return 0
  return users.filter((row) => resolveUserPresenceStatus(row).variant === 'online').length
}

export function hasUserAvatar(row) {
  return Boolean(String(row?.avatar || row?.photoUrl || '').trim())
}

/** 今日新增：与用户管理同源，仅含今日注册且有头像的用户 */
export function getTodayNewUsersFromList(users = [], nowMs = Date.now()) {
  if (!Array.isArray(users)) return []
  const startMs = getSettlementStartMs(nowMs)
  const endMs = startMs + 24 * 60 * 60 * 1000
  return users
    .filter(hasUserAvatar)
    .filter((row) => {
      const ts = Number(row?.registeredAtMs || 0)
      return Number.isFinite(ts) && ts >= startMs && ts < endMs
    })
    .sort((a, b) => Number(b.registeredAtMs || 0) - Number(a.registeredAtMs || 0))
}

export function countTodayNewUsersFromList(users = [], nowMs = Date.now()) {
  return getTodayNewUsersFromList(users, nowMs).length
}

/** 与用户管理「会员」列一致：VIP / 普通 */
export function countVipUsers(users = []) {
  if (!Array.isArray(users)) return 0
  return users.filter((row) => row?.vipActive === true).length
}

export function countNormalUsers(users = []) {
  if (!Array.isArray(users)) return 0
  return users.filter((row) => row?.vipActive !== true && hasUserAvatar(row)).length
}

export function normalizeAdminUserRow(row, idx = 0) {
  const tgId = String(row?.tgId || row?.telegramId || row?.userId || row?.id || idx)
  const userType = String(row?.userType || row?.role || 'normal')
  const vipActive = row?.vipActive === true || userType === 'vip'
  const isBanned = Boolean(row?.isBanned)
  const isOnline = row?.isOnline === true
  const presence = resolveUserPresenceStatus({ isBanned, isOnline })
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
    presenceLabel: presence.label,
    presenceVariant: presence.variant,
    statusLabel: presence.label,
    userType: userType === 'author' ? 'author' : vipActive ? 'vip' : 'normal',
    isBanned,
    whitelist: Boolean(row?.whitelist),
    isOnline,
    ipLocation: row?.ipLocation || '—',
    lastSeenAt: Number(row?.lastSeenAt) || 0,
    registeredAtMs: Number(row?.registeredAtMs || row?.firstSeenAt || row?.createdAt || 0),
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
