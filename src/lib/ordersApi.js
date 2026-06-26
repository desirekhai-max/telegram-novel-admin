import { getToken } from './adminAuth.js'
import { apiUrl, getApiOriginLabel } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'

/** 与 APP 结算日一致：金边时间 */
export const ADMIN_ORDER_TIMEZONE = 'Asia/Phnom_Penh'

export function formatAdminOrderTimeLabel(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: ADMIN_ORDER_TIMEZONE,
  })
}

export function resolveOrderDisplayTime(row, dateField = 'paid') {
  const preferPaid = String(dateField || 'paid').toLowerCase() === 'paid'
  const ms = preferPaid
    ? Number(row?.paid_at || row?.time_at || row?.created_at || 0)
    : Number(row?.created_at || row?.time_at || row?.paid_at || 0)
  return formatAdminOrderTimeLabel(ms)
}

function resolveOrderPaymentMethod({
  channel,
  sourceType,
  source,
  payAba,
  payPayway,
  payVipGift,
  payVipPurchase,
  fallback = '',
}) {
  if (channel === 'aba_khqr' || payAba) return 'ABA KHQR'
  if (payPayway || channel === 'payway_hosted' || channel.includes('payway')) return 'PayWay'
  if (
    payVipPurchase ||
    sourceType === 'vip_purchase' ||
    channel === 'vip_purchase' ||
    source === 'vip'
  ) {
    return 'VIP 内购'
  }
  if (payVipGift || sourceType === 'vip_gift' || channel === 'vip_gift') {
    // 历史客服「赠送VIP」写入 vip_gift，展示统一为内购
    return 'VIP 内购'
  }
  const text = String(fallback || '').trim()
  if (text === 'VIP 赠送') return 'VIP 内购'
  return text || channel || '—'
}

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
    if (response.status === 404 && /not found/i.test(String(raw))) {
      throw new Error(
        humanizeApiError(
          raw,
          '订单接口未部署或路径不存在，请确认正式 APP 已发布含 /api/admin/orders 的版本',
        ),
      )
    }
    throw new Error(humanizeApiError(raw, `请求失败(${response.status})`))
  }
  return data
}

function toAmount(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** 与 APP 购买页一致：ABA/PayWay 待支付窗口固定 2 分钟 */
const PAYMENT_CHECKOUT_WINDOW_MS = 2 * 60 * 1000

function resolveOrderCreatedAtMs(row) {
  const createdAt = Number(row?.created_at || row?.createdAt || 0)
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt
  const timeAt = Number(row?.time_at || row?.timeAt || 0)
  if (Number.isFinite(timeAt) && timeAt > 0) return timeAt
  const label = String(row?.time_label || row?.timeLabel || '').trim()
  if (label && label !== '—') {
    const parsed = Date.parse(label.replace(/\//g, '-'))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function isPaymentChannelOrder(row) {
  const channel = String(row?.payment_channel || row?.paymentChannel || '').toLowerCase()
  if (channel === 'aba_khqr' || channel === 'payway_hosted' || channel.includes('payway')) {
    return true
  }
  if (row?.pay_aba || row?.payAba || row?.pay_payway || row?.payPayway) return true
  const method = String(row?.payment_method || row?.paymentMethod || '')
  if (method.includes('ABA') || method.includes('PayWay')) return true
  return String(row?.source || '') === 'payment'
}

/**
 * 支付单：创建后 2 分钟内「待支付」，超过即「已过期」（与 APP 一致，不看更长 expire_at）。
 */
export function resolveOrderDisplayStatus(row, atMs = Date.now()) {
  const rawStatus = String(row?.raw_status || row?.status || '').trim().toLowerCase()
  if (rawStatus === 'expired') return 'expired'
  if (rawStatus === 'refunded') return 'refunded'
  if (rawStatus === 'paid' || rawStatus === 'success') return 'paid'
  if (rawStatus === 'failed') return 'failed'

  if (rawStatus === 'pending' || !rawStatus) {
    if (isPaymentChannelOrder(row)) {
      const createdAt = resolveOrderCreatedAtMs(row)
      if (createdAt > 0 && atMs >= createdAt + PAYMENT_CHECKOUT_WINDOW_MS) {
        return 'expired'
      }
      return 'pending'
    }

    const expireAt = Number(row?.expire_at || row?.expireAt || 0)
    if (expireAt > 0 && expireAt <= atMs) return 'expired'
    return 'pending'
  }

  return rawStatus || 'pending'
}

/** 与正式 APP orders-store / buildAdminOrderRow 对齐 */
export const PAYMENT_ENTRY_ABA_DEEPLINK = 'aba_deeplink'
export const PAYMENT_ENTRY_KHQR_QR = 'khqr_qr'

function isAbaKhqrOrder(row) {
  const channel = String(row?.payment_channel || row?.paymentChannel || '').toLowerCase()
  const method = String(row?.payment_method || row?.paymentMethod || '').toUpperCase()
  return channel === 'aba_khqr' || method.includes('ABA KHQR')
}

/** 归一化 APP 返回的 payment_entry */
export function resolvePaymentEntry(row) {
  const explicit = String(row?.payment_entry || row?.paymentEntry || '').trim().toLowerCase()
  if (explicit === PAYMENT_ENTRY_ABA_DEEPLINK || explicit === PAYMENT_ENTRY_KHQR_QR) {
    return explicit
  }
  if (row?.aba_app_launched === true || row?.abaAppLaunched === true) {
    return PAYMENT_ENTRY_ABA_DEEPLINK
  }
  if (isAbaKhqrOrder(row)) return PAYMENT_ENTRY_KHQR_QR
  return ''
}

export function isAbaDeeplinkPaymentEntry(row) {
  return resolvePaymentEntry(row) === PAYMENT_ENTRY_ABA_DEEPLINK
}

/** KHQR 单：deeplink 进 ABA → ABA；二维码页（任意银行扫码）→ 二维码 */
export function resolveOrderPaymentEntryLabel(row) {
  if (!isAbaKhqrOrder(row)) return '—'
  return isAbaDeeplinkPaymentEntry(row) ? 'ABA' : '二维码'
}

function orderPaidAtMs(row) {
  return Number(row?.paid_at || row?.time_at || row?.created_at || 0)
}

/** VIP 内购镜像行：支付成功时由 fulfillVip 额外写入，与 ABA/PayWay 支付单重复 */
function isVipPurchaseMirrorRow(row) {
  if (row?.pay_vip_gift || row?.sourceType === 'vip_gift') return false
  if (row?.source === 'vip') return true
  return (
    row?.pay_vip_purchase === true ||
    row?.sourceType === 'vip_purchase' ||
    String(row?.payment_channel || '').toLowerCase() === 'vip_purchase'
  )
}

function matchesPaymentVipPair(paymentRow, vipRow) {
  const tgA = String(paymentRow?.telegram_user_id || '').trim()
  const tgB = String(vipRow?.telegram_user_id || '').trim()
  if (!tgA || tgA !== tgB) return false

  const planA = String(paymentRow?.plan_id || '').trim()
  const planB = String(vipRow?.plan_id || '').trim()
  if (planA && planB && planA !== planB) return false

  const paidA = orderPaidAtMs(paymentRow)
  const paidB = orderPaidAtMs(vipRow)
  if (!paidA || !paidB) return false
  if (Math.abs(paidA - paidB) > 10 * 60 * 1000) return false

  const amountA = Number(paymentRow?.amount) || 0
  const amountB = Number(vipRow?.amount) || 0
  if (amountA > 0 && amountB > 0 && Math.abs(amountA - amountB) > 0.01) return false

  return true
}

/** 合并列表去重：保留 ABA/PayWay 支付单，隐藏同笔 VIP 内购镜像（与 APP refund 配对逻辑一致） */
export function dedupeMergedAdminOrders(orders) {
  if (!Array.isArray(orders) || orders.length < 2) return orders

  const paymentRows = orders.filter(
    (row) => isPaymentChannelOrder(row) && !isVipPurchaseMirrorRow(row),
  )
  const skipIds = new Set()
  const linkedVipByPaymentKey = new Map()

  for (const vipRow of orders) {
    if (!isVipPurchaseMirrorRow(vipRow)) continue
    const twin = paymentRows.find((payment) => matchesPaymentVipPair(payment, vipRow))
    if (!twin) continue
    const vipKey = String(vipRow.id || vipRow.order_no || '')
    if (vipKey) skipIds.add(vipKey)
    const paymentKey = String(twin.id || twin.order_no || '')
    if (paymentKey) {
      linkedVipByPaymentKey.set(paymentKey, String(vipRow.vip_order_id || vipRow.order_no || vipKey))
    }
  }

  if (!skipIds.size) return orders

  return orders
    .filter((row) => !skipIds.has(String(row.id || row.order_no || '')))
    .map((row) => {
      const paymentKey = String(row.id || row.order_no || '')
      const linked = linkedVipByPaymentKey.get(paymentKey)
      if (!linked) return row
      return { ...row, linked_vip_order_id: linked }
    })
}

function resolveSourceType(row, channel) {
  const explicit = String(row?.sourceType || row?.source_type || '').trim()
  if (explicit) return explicit
  if (channel === 'vip_gift') return 'vip_gift'
  if (channel === 'vip_purchase') return 'vip_purchase'
  return ''
}

/** 与正式 APP buildAdminOrderRow / vipOrderToAdminStoreRow 对齐 */
export function normalizeAdminOrderRow(row) {
  if (!row || typeof row !== 'object') return null
  const orderNo = String(row.order_no || row.orderNo || row.id || '').trim()
  const paidAt = Number(row.paid_at || row.paidAt || 0)
  const createdAt = Number(row.created_at || row.createdAt || 0)
  const timeAt = Number(row.time_at || row.timeAt || 0) || paidAt || createdAt
  const channel = String(row.payment_channel || row.paymentChannel || '').toLowerCase()
  const sourceType = resolveSourceType(row, channel)
  const isAbaKhqrChannel = channel === 'aba_khqr'
  const paymentEntry = resolvePaymentEntry(row)
  const payAba = paymentEntry === PAYMENT_ENTRY_ABA_DEEPLINK
  const abaAppLaunchedAt = Number(row.aba_app_launched_at || row.abaAppLaunchedAt || 0)
  const payPayway =
    row.pay_payway === true ||
    row.payPayway === true ||
    channel === 'payway_hosted' ||
    channel.includes('payway')
  const payVipGift = row.pay_vip_gift === true || sourceType === 'vip_gift' || channel === 'vip_gift'
  const payVipPurchase =
    row.pay_vip_purchase === true ||
    sourceType === 'vip_purchase' ||
    channel === 'vip_purchase' ||
    String(row.source || '') === 'vip'

  const paymentMethod = resolveOrderPaymentMethod({
    channel,
    sourceType,
    source: String(row.source || ''),
    payAba,
    payPayway,
    payVipGift,
    payVipPurchase,
    fallback: row.payment_method || row.paymentMethod,
  })

  const base = {
    id: orderNo || String(row.id || ''),
    order_no: orderNo,
    tran_id: String(row.tran_id || row.tranId || ''),
    telegram_user_id: String(row.telegram_user_id || row.telegramUserId || ''),
    telegram_username: String(row.telegram_username || row.user_label || ''),
    user_label: String(row.user_label || row.telegram_username || ''),
    package_name: String(row.package_name || row.packageName || row.plan_id || '—'),
    plan_id: String(row.plan_id || row.planId || ''),
    amount: toAmount(row.amount),
    created_at: createdAt,
    paid_at: paidAt,
    expire_at: Number(row.expire_at || row.expireAt || 0),
    refunded_at: Number(row.refunded_at || row.refundedAt || 0),
    time_at: timeAt,
    time_label: formatAdminOrderTimeLabel(timeAt),
    payment_method: paymentMethod,
    pay_aba: payAba,
    pay_payway: payPayway,
    pay_vip_gift: payVipGift,
    pay_vip_purchase: payVipPurchase,
    aba_app_launched: payAba,
    aba_app_launched_at: abaAppLaunchedAt,
    payment_entry: paymentEntry || (isAbaKhqrChannel ? PAYMENT_ENTRY_KHQR_QR : ''),
    payment_entry_label: resolveOrderPaymentEntryLabel({
      payment_channel: channel,
      payment_method: paymentMethod,
      payment_entry: paymentEntry || (isAbaKhqrChannel ? PAYMENT_ENTRY_KHQR_QR : ''),
      aba_app_launched: payAba,
      pay_aba: payAba,
    }),
    refund_label: String(row.refund_label || row.refundLabel || ''),
    payment_channel: String(row.payment_channel || row.paymentChannel || channel),
    sourceType,
    source: String(row.source || (payVipGift || payVipPurchase ? 'vip' : 'payment')),
    payway_env: String(row.payway_env || row.paywayEnv || ''),
    fail_reason: String(row.fail_reason || row.failReason || ''),
    currency: String(row.currency || 'USD'),
    member_id: String(row.member_id || row.memberId || ''),
    vip_order_id: String(row.vip_order_id || row.vipOrderId || ''),
    duration_hours: Number(row.duration_hours || row.durationHours || 0),
    raw_status: String(row.status || 'pending').trim().toLowerCase(),
  }
  const status = resolveOrderDisplayStatus(base)
  return {
    ...base,
    status,
    can_refund: status === 'paid' && row.can_refund !== false,
  }
}

export function normalizeAdminOrdersSearchResult(data) {
  const rawOrders = Array.isArray(data?.orders)
    ? data.orders
    : Array.isArray(data?.items)
      ? data.items
      : []
  const normalized = rawOrders.map(normalizeAdminOrderRow).filter(Boolean)
  const orders = dedupeMergedAdminOrders(normalized)
  const removed = normalized.length - orders.length
  const apiTotal = Number(data?.total) || normalized.length
  const total = removed > 0 ? Math.max(orders.length, apiTotal - removed) : apiTotal
  return {
    ok: data?.ok !== false,
    orders,
    total,
    page: Number(data?.page) || 1,
    pageSize: Number(data?.pageSize) || 50,
    totalPages: Math.max(1, Number(data?.totalPages) || 1),
  }
}

export function normalizeAdminOrdersSummary(data) {
  const summary = data?.summary && typeof data.summary === 'object' ? data.summary : {}
  const byPaymentMethod =
    summary.byPaymentMethod && typeof summary.byPaymentMethod === 'object'
      ? summary.byPaymentMethod
      : {}
  const bySource =
    summary.bySource && typeof summary.bySource === 'object' ? summary.bySource : {}

  return {
    ok: data?.ok !== false,
    totalCount: Number(summary.totalCount) || 0,
    paidCount: Number(summary.paidCount) || 0,
    refundedCount: Number(summary.refundedCount) || 0,
    pendingCount: Number(summary.pendingCount) || 0,
    failedCount: Number(summary.failedCount) || 0,
    totalRevenueUsd: Number(summary.totalRevenueUsd) || 0,
    byPaymentMethod,
    bySource,
    dateField: String(summary.dateField || summary.date_field || 'created'),
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

function buildSummaryQuery(filters = {}) {
  const body = buildSearchBody(filters)
  return {
    status: body.status,
    payment_method: body.payment_method,
    date_from: body.date_from,
    date_to: body.date_to,
    date_field: body.date_field,
    keyword: body.keyword,
    t: body.t || Date.now(),
  }
}

/** POST /api/admin/orders/search — 含支付单 + VIP 内购/赠送 */
export async function searchAdminOrdersList(filters = {}) {
  const data = await requestJson('/api/admin/orders/search', {
    method: 'POST',
    body: buildSearchBody(filters),
  })
  return normalizeAdminOrdersSearchResult(data)
}

/** GET /api/admin/orders */
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

/** GET /api/admin/orders/summary */
export async function fetchAdminOrdersSummary(filters = {}) {
  const data = await requestJson('/api/admin/orders/summary', {
    query: buildSummaryQuery(filters),
  })
  return normalizeAdminOrdersSummary(data)
}

function getPhnomPenhYmd(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_ORDER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const pick = (type) => parts.find((part) => part.type === type)?.value || ''
  return { y: pick('year'), m: pick('month'), d: pick('day') }
}

function phnomPenhYmdToMs(ymd, endOfDay = false) {
  const matched = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return NaN
  const [, y, m, d] = matched
  const time = endOfDay ? '23:59:59.999' : '00:00:00.000'
  return new Date(`${y}-${m}-${d}T${time}+07:00`).getTime()
}

function buildPhnomPenhMetricsRange(kind) {
  const { y, m, d } = getPhnomPenhYmd()
  const pad = (n) => String(n).padStart(2, '0')
  if (kind === 'today') {
    const today = `${y}-${m}-${d}`
    return { fromMs: phnomPenhYmdToMs(today, false), toMs: phnomPenhYmdToMs(today, true) }
  }
  const daysInMonth = new Date(Number(y), Number(m), 0).getDate()
  const from = `${y}-${m}-01`
  const to = `${y}-${m}-${pad(daysInMonth)}`
  return { fromMs: phnomPenhYmdToMs(from, false), toMs: phnomPenhYmdToMs(to, true) }
}

function isInPhnomPenhPaidRange(ms, range) {
  if (!Number.isFinite(ms) || ms <= 0) return false
  return ms >= range.fromMs && ms <= range.toMs
}

function isExternalPaymentOrder(row) {
  const channel = String(row?.payment_channel || '').toLowerCase()
  return channel === 'aba_khqr' || channel === 'payway_hosted' || channel.includes('payway')
}

function isVipInAppOrder(row) {
  const channel = String(row?.payment_channel || '').toLowerCase()
  const sourceType = String(row?.sourceType || '').toLowerCase()
  if (isExternalPaymentOrder(row)) return false
  return (
    channel === 'vip_purchase' ||
    channel === 'vip_gift' ||
    sourceType === 'vip_purchase' ||
    sourceType === 'vip_gift' ||
    String(row?.source || '') === 'vip'
  )
}

function sumOrderAmountUsd(rows) {
  return rows.reduce((sum, row) => sum + toAmount(row.amount), 0)
}

function roundUsd(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

async function fetchAllDedupedPaidOrders() {
  const pageSize = 100
  const orders = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const data = await searchAdminOrdersList({
      status: 'paid',
      page,
      pageSize,
      t: Date.now(),
    })
    orders.push(...data.orders)
    totalPages = Math.max(1, Number(data.totalPages) || 1)
    page += 1
  }
  return orders
}

function getPhnomPenhTodayYmd(ms = Date.now()) {
  const { y, m, d } = getPhnomPenhYmd(ms)
  return `${y}-${m}-${d}`
}

/** 与订单列表同源：按金边「今日」+ 订单号去重统计 */
export async function countTodayOrdersFromList() {
  const today = getPhnomPenhTodayYmd()
  const pageSize = 100
  const orderNos = new Set()
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const data = await searchAdminOrdersList({
      dateFrom: today,
      dateTo: today,
      dateField: 'created',
      page,
      pageSize,
      t: Date.now(),
    })
    data.orders.forEach((row) => {
      const orderNo = String(row.order_no || row.id || '').trim()
      if (orderNo) orderNos.add(orderNo)
    })
    totalPages = Math.max(1, Number(data.totalPages) || 1)
    page += 1
  }

  return orderNos.size
}

/** 仪表盘六卡：与列表同源（去重后）+ 金边时区，支付与内购分开统计 */
export async function fetchAdminOrdersDashboardMetrics() {
  const orders = await fetchAllDedupedPaidOrders()
  const monthRange = buildPhnomPenhMetricsRange('month')
  const todayRange = buildPhnomPenhMetricsRange('today')

  const external = orders.filter(isExternalPaymentOrder)
  const vipInApp = orders.filter(isVipInAppOrder)

  const monthPaymentUsd = sumOrderAmountUsd(
    external.filter((row) => isInPhnomPenhPaidRange(orderPaidAtMs(row), monthRange)),
  )
  const todayPaymentUsd = sumOrderAmountUsd(
    external.filter((row) => isInPhnomPenhPaidRange(orderPaidAtMs(row), todayRange)),
  )
  const monthVipPurchaseUsd = sumOrderAmountUsd(
    vipInApp.filter((row) => isInPhnomPenhPaidRange(orderPaidAtMs(row), monthRange)),
  )
  const todayVipPurchaseUsd = sumOrderAmountUsd(
    vipInApp.filter((row) => isInPhnomPenhPaidRange(orderPaidAtMs(row), todayRange)),
  )

  return {
    monthPaymentUsd: roundUsd(monthPaymentUsd),
    totalPaymentUsd: roundUsd(sumOrderAmountUsd(external)),
    todayPaymentUsd: roundUsd(todayPaymentUsd),
    monthVipPurchaseUsd: roundUsd(monthVipPurchaseUsd),
    totalVipPurchaseUsd: roundUsd(sumOrderAmountUsd(vipInApp)),
    todayVipPurchaseUsd: roundUsd(todayVipPurchaseUsd),
  }
}

/** 与订单列表汇总条同源：今日支付 + 今日内购 */
export async function getTodayRevenueFromList() {
  const metrics = await fetchAdminOrdersDashboardMetrics()
  return roundUsd(metrics.todayPaymentUsd + metrics.todayVipPurchaseUsd)
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

/** PATCH /api/admin/orders/:id { action: 'refund' } — 联动扣减 VIP */
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

/** 账户资料 orders 区块：对齐 payment_entry 展示字段 */
export function enrichAdminProfileOrdersSection(ordersSection) {
  if (!ordersSection || typeof ordersSection !== 'object') return ordersSection
  const rawRows = Array.isArray(ordersSection.orders) ? ordersSection.orders : []
  const rows = rawRows.map((row) => normalizeAdminOrderRow(row)).filter(Boolean)
  const latestPaid =
    rows.find((row) => row.status === 'paid') ||
    rows.find((row) => String(row.raw_status || '').toLowerCase() === 'paid') ||
    null
  const entryLabel = latestPaid
    ? latestPaid.payment_entry_label || resolveOrderPaymentEntryLabel(latestPaid)
    : ordersSection.payAba
      ? 'ABA'
      : '—'
  return {
    ...ordersSection,
    orders: rows,
    latestPaymentEntry: latestPaid?.payment_entry || '',
    latestPaymentEntryLabel: entryLabel,
  }
}
