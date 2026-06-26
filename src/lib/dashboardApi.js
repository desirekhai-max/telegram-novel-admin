import { getToken } from './adminAuth.js'
import { apiUrl, getApiOriginLabel } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'
import { countTodayOrdersFromList, getTodayRevenueFromList } from './ordersApi.js'
import { fetchAdminUsers, countOnlineUsers, countTodayNewUsersFromList, countVipUsers, countNormalUsers } from './usersApi.js'

async function requestJson(path, { query } = {}) {
  const token = getToken()
  if (!token) throw new Error('需要管理员登录，请重新登录')

  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })
  const qs = params.toString()

  const response = await fetch(apiUrl(`${path}${qs ? `?${qs}` : ''}`), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const raw = data?.error || `请求失败(${response.status})`
    throw new Error(humanizeApiError(raw, `请求失败(${response.status})`))
  }
  return data
}

function normalizeChartRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
    label: String(row?.label || ''),
    dateLabel: String(row?.dateLabel || ''),
    amountUsd: Number(row?.amountUsd) || 0,
    activeUsers: Number(row?.activeUsers) || 0,
  }))
}

function normalizeLatestOrders(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, index) => ({
    orderNo: String(row?.orderNo || row?.order_no || ''),
    tranId: String(row?.tranId || row?.tran_id || ''),
    telegramUserId: String(row?.telegramUserId || row?.telegram_user_id || ''),
    avatar: String(row?.avatar || row?.photoUrl || row?.userAvatar || '').trim(),
    amount: row?.amount,
    amountUsd: Number(row?.amountUsd ?? row?.amount) || 0,
    status: String(row?.status || ''),
    paymentChannel: String(row?.paymentChannel || row?.payment_channel || ''),
    planId: String(row?.planId || row?.plan_id || ''),
    createdAtMs: Number(row?.createdAtMs || row?.created_at || 0),
    paidAtMs: Number(row?.paidAtMs || row?.paid_at || 0),
    id: String(row?.orderNo || row?.tranId || `order-${index}`),
  }))
}

function normalizeLatestUsers(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, index) => ({
    tgId: String(row?.tgId || row?.telegramId || ''),
    firstName: String(row?.firstName || row?.nickname || ''),
    username: String(row?.username || ''),
    avatar: String(row?.avatar || row?.photoUrl || '').trim(),
    userType: String(row?.userType || 'normal'),
    lastSeenAt: Number(row?.lastSeenAt || 0),
    ipLocation: String(row?.ipLocation || ''),
    id: String(row?.tgId || `user-${index}`),
  }))
}

function normalizeLatestComments(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
    id: String(row?.id || ''),
    type: String(row?.type || ''),
    novelId: String(row?.novelId || ''),
    novelTitle: String(row?.novelTitle || ''),
    userName: String(row?.userName || ''),
    userId: String(row?.userId || row?.telegramUserId || '').trim(),
    avatar: String(row?.avatar || row?.userAvatar || row?.photoUrl || '').trim(),
    text: String(row?.text || ''),
    at: Number(row?.at || 0),
  }))
}

function commentNameCandidates(userName) {
  const raw = String(userName || '').trim()
  if (!raw) return []
  const parts = raw
    .split(/[|·/\\>,\-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const digits = raw.match(/\d{6,}/g) || []
  return [...new Set([raw, ...parts, ...digits])]
}

function buildAvatarLookup(users = []) {
  const byTgId = new Map()
  const byUsername = new Map()
  const byNickname = new Map()

  users.forEach((row) => {
    const avatar = String(row?.avatar || row?.photoUrl || '').trim()
    if (!avatar) return
    const tgId = String(row?.tgId || row?.id || '').trim()
    if (tgId) byTgId.set(tgId, avatar)
    const username = String(row?.username || '').trim().replace(/^@/, '').toLowerCase()
    if (username) byUsername.set(username, avatar)
    const nickname = String(row?.nickname || row?.firstName || '').trim().toLowerCase()
    if (nickname && nickname !== '—') byNickname.set(nickname, avatar)
  })

  return { byTgId, byUsername, byNickname }
}

function resolveDashboardAvatar(row, lookup) {
  const direct = String(row?.avatar || row?.userAvatar || row?.photoUrl || '').trim()
  if (direct) return direct

  const tgId = String(row?.tgId || row?.telegramUserId || row?.userId || '').trim()
  if (tgId && lookup.byTgId.has(tgId)) return lookup.byTgId.get(tgId)

  const username = String(row?.username || '').trim().replace(/^@/, '').toLowerCase()
  if (username && lookup.byUsername.has(username)) return lookup.byUsername.get(username)

  const candidates = commentNameCandidates(row?.userName || row?.firstName || row?.nickname)
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase()
    if (lookup.byTgId.has(candidate)) return lookup.byTgId.get(candidate)
    if (lookup.byNickname.has(lower)) return lookup.byNickname.get(lower)
    const uname = lower.replace(/^@/, '')
    if (lookup.byUsername.has(uname)) return lookup.byUsername.get(uname)
  }

  return ''
}

async function fetchPublicJson(path) {
  try {
    const response = await fetch(apiUrl(path), { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return null
    return data
  } catch {
    return null
  }
}

/** 评论头像存于书评/回复快照，从公开接口按 novelId + commentId 补全 */
async function enrichLatestCommentAvatars(comments = []) {
  const rows = Array.isArray(comments) ? comments : []
  if (!rows.length) return rows

  const novelIds = [...new Set(rows.map((row) => String(row?.novelId || '').trim()).filter(Boolean))]
  const avatarByCommentId = new Map()
  const avatarByUserId = new Map()

  await Promise.all(
    novelIds.map(async (novelId) => {
      const encoded = encodeURIComponent(novelId)
      const [reviewsData, repliesData] = await Promise.all([
        fetchPublicJson(`/api/reviews?novelId=${encoded}`),
        fetchPublicJson(`/api/replies?novelId=${encoded}`),
      ])

      const items = [
        ...(Array.isArray(reviewsData?.items) ? reviewsData.items : []),
        ...(Array.isArray(repliesData?.items) ? repliesData.items : []),
      ]

      items.forEach((item) => {
        const avatar = String(item?.userAvatar || item?.avatar || '').trim()
        if (!avatar) return
        const id = String(item?.id || '').trim()
        if (id) avatarByCommentId.set(id, avatar)
        const userId = String(item?.userId || '').trim()
        if (userId) avatarByUserId.set(userId, avatar)
      })
    }),
  )

  return rows.map((row) => {
    const existing = String(row?.avatar || row?.userAvatar || '').trim()
    if (existing) return row
    const id = String(row?.id || '').trim()
    const userId = String(row?.userId || '').trim()
    const avatar = (id && avatarByCommentId.get(id)) || (userId && avatarByUserId.get(userId)) || ''
    return avatar ? { ...row, avatar } : row
  })
}

function enrichDashboardAvatars(payload, users = []) {
  const lookup = buildAvatarLookup(users)
  return {
    ...payload,
    latestOrders: (payload.latestOrders || []).map((row) => ({
      ...row,
      avatar: resolveDashboardAvatar(row, lookup),
    })),
    latestUsers: (payload.latestUsers || []).map((row) => ({
      ...row,
      avatar: resolveDashboardAvatar(row, lookup),
    })),
    latestComments: (payload.latestComments || []).map((row) => ({
      ...row,
      avatar: resolveDashboardAvatar(row, lookup),
    })),
  }
}

/** 与正式 APP 同源：GET /api/admin/dashboard */
export async function fetchAdminDashboardPayload() {
  const [dashboardResult, usersResult, ordersTodayResult, todayRevenueResult] = await Promise.allSettled([
    requestJson('/api/admin/dashboard', { query: { t: Date.now() } }),
    fetchAdminUsers(),
    countTodayOrdersFromList(),
    getTodayRevenueFromList(),
  ])

  if (dashboardResult.status === 'rejected') {
    throw dashboardResult.reason
  }

  const data = dashboardResult.value
  const stats = data?.stats && typeof data.stats === 'object' ? data.stats : {}
  const users = usersResult.status === 'fulfilled' ? usersResult.value : []

  const payload = {
    ok: data?.ok !== false,
    stats: {
      onlineCount: users.length ? countOnlineUsers(users) : Number(stats.onlineCount) || 0,
      todayNewUsers: users.length
        ? countTodayNewUsersFromList(users)
        : Number(stats.todayNewUsers) || 0,
      vipUsers: users.length ? countVipUsers(users) : Number(stats.vipUsers) || 0,
      normalUsers: users.length ? countNormalUsers(users) : Number(stats.normalUsers) || 0,
      todayOrders:
        ordersTodayResult.status === 'fulfilled'
          ? ordersTodayResult.value
          : Number(stats.todayOrders) || 0,
      todayRevenueUsd:
        todayRevenueResult.status === 'fulfilled'
          ? todayRevenueResult.value
          : Number(stats.todayRevenueUsd) || 0,
      todayComments: Number(stats.todayComments) || 0,
      todayReports: Number(stats.todayReports) || 0,
      novelTotal: Number(stats.novelTotal) || 0,
      chapterTotal: Number(stats.chapterTotal) || 0,
      pendingReports: Number(stats.pendingReports) || 0,
      pendingOrders: Number(stats.pendingOrders) || 0,
    },
    revenueLast7Days: normalizeChartRows(data?.revenueLast7Days),
    activityLast7Days: normalizeChartRows(data?.activityLast7Days),
    latestOrders: normalizeLatestOrders(data?.latestOrders),
    latestUsers: normalizeLatestUsers(data?.latestUsers),
    latestComments: await enrichLatestCommentAvatars(normalizeLatestComments(data?.latestComments)),
  }

  return enrichDashboardAvatars(payload, users)
}

export { getApiOriginLabel }
