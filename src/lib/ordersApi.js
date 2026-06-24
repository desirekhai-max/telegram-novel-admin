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

function toAmount(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** 与正式 APP buildAdminOrderRow 字段对齐 */
export function normalizeAdminOrderRow(row) {
  if (!row || typeof row !== 'object') return null
  const orderNo = String(row.order_no || row.orderNo || row.id || '').trim()
  const status = String(row.status || 'pending').trim().toLowerCase()
  const paidAt = Number(row.paid_at || row.paidAt || 0)
  const createdAt = Number(row.created_at || row.createdAt || 0)
  const timeAt = Number(row.time_at || row.timeAt || 0) || paidAt || createdAt

  return {
    id: orderNo || String(row.id || ''),
    order_no: orderNo,
    tran_id: String(row.tran_id || row.tranId || ''),
    telegram_user_id: String(row.telegram_user_id || row.telegramUserId || ''),
    telegram_username: String(row.telegram_username || row.user_label || ''),
    user_label: String(row.user_label || row.telegram_username || ''),
    package_name: String(row.package_name || row.packageName || row.plan_id || '—'),
    plan_id: String(row.plan_id || row.planId || ''),
    amount: toAmount(row.amount),
    status,
    created_at: createdAt,
    paid_at: paidAt,
    expire_at: Number(row.expire_at || row.expireAt || 0),
    refunded_at: Number(row.refunded_at || row.refundedAt || 0),
    time_at: timeAt,
    time_label: String(row.time_label || row.timeLabel || ''),
    payment_method: String(row.payment_method || row.paymentMethod || '—'),
    pay_aba: row.pay_aba === true || row.payAba === true,
    pay_payway: row.pay_payway === true || row.payPayway === true,
    can_refund: row.can_refund === true || status === 'paid',
    refund_label: String(row.refund_label || row.refundLabel || ''),
    payment_channel: String(row.payment_channel || row.paymentChannel || ''),
    payway_env: String(row.payway_env || row.paywayEnv || ''),
    fail_reason: String(row.fail_reason || row.failReason || ''),
    currency: String(row.currency || 'USD'),
    member_id: String(row.member_id || row.memberId || ''),
    source: String(row.source || 'payment'),
  }
}

export function normalizeAdminOrdersSearchResult(data) {
  const rawOrders = Array.isArray(data?.orders)
    ? data.orders
    : Array.isArray(data?.items)
      ? data.items
      : []
  const orders = rawOrders.map(normalizeAdminOrderRow).filter(Boolean)
  return {
    ok: data?.ok !== false,
    orders,
    total: Number(data?.total) || orders.length,
    page: Number(data?.page) || 1,
    pageSize: Number(data?.pageSize) || 50,
    totalPages: Math.max(1, Number(data?.totalPages) || 1),
  }
}

function buildSearchBody(filters = {}) {
  return {
    status: filters.status || '',
    payment_method: filters.payment_method || filters.paymentMethod || '',
    date_from: filters.date_from || filters.dateFrom || '',
    date_to: filters.date_to || filters.dateTo || '',
    date_field: filters.date_field || filters.dateField || 'created',
    keyword: filters.keyword || '',
    page: filters.page || 1,
    pageSize: filters.pageSize || 50,
    t: filters.t,
  }
}

/** POST /api/admin/orders/search — 正式 APP 推荐方式 */
export async function searchAdminOrdersList(filters = {}) {
  const data = await requestJson('/api/admin/orders/search', {
    method: 'POST',
    body: buildSearchBody(filters),
  })
  return normalizeAdminOrdersSearchResult(data)
}

/** GET /api/admin/orders — 与 search 同数据源 */
export async function fetchAdminOrdersList(filters = {}) {
  const body = buildSearchBody(filters)
  const data = await requestJson('/api/admin/orders', {
    query: {
      status: body.status,
      payment_method: body.payment_method,
      date_from: body.date_from,
      date_to: body.date_to,
      date_field: body.date_field,
      keyword: body.keyword,
      page: body.page,
      pageSize: body.pageSize,
      t: body.t || Date.now(),
    },
  })
  return normalizeAdminOrdersSearchResult(data)
}

/** GET /api/admin/orders/:id */
export async function fetchAdminOrderDetail(id) {
  const key = String(id || '').trim()
  if (!key) throw new Error('订单 ID 无效')
  const data = await requestJson(`/api/admin/orders/${encodeURIComponent(key)}`, {
    query: { t: Date.now() },
  })
  const order = data?.order ? normalizeAdminOrderRow(data.order) : null
  if (!order) throw new Error('未找到该订单')
  return order
}

/** PATCH /api/admin/orders/:id { action: 'refund' } */
export async function refundAdminOrderById(id) {
  const key = String(id || '').trim()
  if (!key) throw new Error('订单 ID 无效')
  const data = await requestJson(`/api/admin/orders/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: { action: 'refund' },
  })
  return data?.order ? normalizeAdminOrderRow(data.order) : null
}

export { getApiOriginLabel }
