import { apiUrl } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'
import { fetchAdminDashboardPayload } from './dashboardApi.js'
import {
  fetchAdminOrderDetail,
  fetchAdminOrdersList,
  fetchAdminOrdersSummary as loadAdminOrdersSummary,
  refundAdminOrderById,
  searchAdminOrdersList,
} from './ordersApi.js'
import { fetchAdminReadingRecords } from './readingRecordsApi.js'
import {
  fetchAdminReports as loadAdminReports,
  patchAdminReportStatus,
} from './reportsApi.js'
import { postAdminUserAction, fetchAdminUserProfileDetail, postAdminUserVipPurchase } from './userProfileApi.js'
import { fetchAdminUsers, patchAdminUserFlags } from './usersApi.js'

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

async function requestJson(path, { token, method = 'GET', body, query } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(apiUrl(`${path}${buildQuery(query)}`), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const raw = data?.error || `请求失败(${response.status})`
    throw new Error(humanizeApiError(raw, `请求失败(${response.status})`))
  }
  return data
}

export function extractItems(data) {
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data)) return data
  return []
}

function buildPresenceQuery({ from, to } = {}) {
  const fromText = String(from || '').trim()
  const toText = String(to || '').trim()
  if (fromText && toText && fromText !== toText) {
    return { start: fromText, end: toText }
  }
  if (fromText) {
    return { date: fromText }
  }
  return {}
}

export async function fetchPresenceStats({ from, to } = {}) {
  const data = await requestJson('/api/presence/online', {
    query: buildPresenceQuery({ from, to }),
  })
  return data?.counts || {}
}

/** @deprecated Use fetchPresenceStats */
export async function fetchHomeStats({ from, to }) {
  return fetchPresenceStats({ from, to })
}

export async function fetchReports({ token } = {}) {
  void token
  return loadAdminReports()
}

export async function updateReportStatus({ token, novelId, reportId, status }) {
  void token
  return patchAdminReportStatus({ novelId, reportId, status })
}

export async function fetchReadingRecords({ token } = {}) {
  void token
  const result = await fetchAdminReadingRecords()
  return result.rows
}

export async function fetchMemberIps({ token }) {
  const data = await requestJson('/api/admin-legacy/member-ips', { token })
  return extractItems(data)
}

export async function fetchVipOrdersForTelegramUser(telegramUserId) {
  const id = String(telegramUserId || '').trim()
  if (!id) return []

  const data = await requestJson('/api/vip-orders/list', {
    method: 'POST',
    body: {
      telegramUser: {
        id: Number(id) || id,
        telegramUserId: id,
      },
    },
  })
  return extractItems(data)
}

/** 从 member-ips 的 tg_* 用户聚合 vipOrdersByUser（POST /api/vip-orders/list） */
export async function fetchAllVipOrdersFromMemberIps({ token, memberIps: memberIpsInput }) {
  const memberIps = Array.isArray(memberIpsInput) ? memberIpsInput : await fetchMemberIps({ token })
  const tgIds = []
  const seen = new Set()

  memberIps.forEach((row) => {
    const matched = String(row?.memberId || '').trim().match(/^tg_(\d+)$/i)
    if (!matched || seen.has(matched[1])) return
    seen.add(matched[1])
    tgIds.push(matched[1])
  })

  const batches = await Promise.all(
    tgIds.map(async (telegramUserId) => {
      try {
        const items = await fetchVipOrdersForTelegramUser(telegramUserId)
        return items.map((order) => ({
          ...order,
          telegramUserId,
          memberId: `tg_${telegramUserId}`,
        }))
      } catch (err) {
        console.warn('Dashboard vip orders fetch failed', telegramUserId, err?.message || err)
        return []
      }
    }),
  )

  return batches.flat()
}

export async function fetchAdminOrders({
  token,
  status = '',
  paymentMethod = '',
  dateFrom = '',
  dateTo = '',
  keyword = '',
  page = 1,
  pageSize = 50,
} = {}) {
  void token
  return fetchAdminOrdersList({
    status,
    paymentMethod,
    dateFrom,
    dateTo,
    keyword,
    page,
    pageSize,
  })
}

export async function searchAdminOrders({ token, filters = {} } = {}) {
  void token
  return searchAdminOrdersList(filters)
}

export async function refundAdminOrder({ token, id }) {
  void token
  const order = await refundAdminOrderById(id)
  return { ok: true, order }
}

export async function fetchAdminOrderById({ token, id }) {
  void token
  const order = await fetchAdminOrderDetail(id)
  return { ok: true, order }
}

export async function fetchAdminOrdersSummaryReport({ token, filters = {} } = {}) {
  void token
  return loadAdminOrdersSummary(filters)
}

/** @deprecated Use fetchAdminOrders or searchAdminOrders */
export async function fetchOrders({ token, from, to } = {}) {
  return fetchAdminOrders({ token, dateFrom: from, dateTo: to })
}

export async function fetchDashboardOrders({ token }) {
  if (!token) return []

  const attempts = [
    { label: '/api/orders?from=2000-01-01&to=2099-12-31', run: () => fetchOrders({ token, from: '2000-01-01', to: '2099-12-31' }) },
    { label: '/api/orders', run: () => fetchOrders({ token }) },
    { label: '/api/admin/orders', run: () => requestJson('/api/admin/orders', { token }) },
  ]

  for (const attempt of attempts) {
    try {
      const data = await attempt.run()
      const orders = extractOrders(data)
      console.log('Dashboard orders fetch', attempt.label, orders.length)
      if (orders.length) return orders
    } catch (err) {
      console.warn('Dashboard orders fetch failed', attempt.label, err?.message || err)
    }
  }

  return []
}

function extractOrders(data) {
  if (Array.isArray(data?.orders)) return data.orders
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data)) return data
  return []
}

export async function fetchUsers({ token } = {}) {
  void token
  const users = await fetchAdminUsers()
  return { ok: true, users }
}

export async function fetchAdminDashboard({ token } = {}) {
  void token
  return fetchAdminDashboardPayload()
}

export async function fetchAdminUserProfile({ token, tgId } = {}) {
  void token
  return fetchAdminUserProfileDetail(tgId)
}

export async function adminUserVipPurchase({ token, tgId, planId } = {}) {
  void token
  return postAdminUserVipPurchase(tgId, { planId })
}

export async function adminUserAction({ token, tgId, action, ...rest } = {}) {
  void token
  return postAdminUserAction(tgId, { action, ...rest })
}

export async function manualVipAdjust({ token, tgId, payload }) {
  return adminUserAction({
    token,
    tgId,
    action: 'manual_vip_adjust',
    ...payload,
  })
}

export async function updateUserFlags({ token, userId, patch }) {
  void token
  return patchAdminUserFlags(userId, patch)
}
