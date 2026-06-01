import { getCambodiaParts, getSettlementDateString } from './cambodiaTime.js'

function parseDateTimeMs(value) {
  const text = String(value || '').trim()
  if (!text) return NaN
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/)
  if (!matched) return NaN
  const [, y, m, d, hh = '0', mm = '0', ss = '0'] = matched
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime()
}

function getTelegramUserId(user) {
  return String(user?.tgId || user?.telegramId || user?.userId || user?.id || '').trim()
}

function getOrderMemberId(order) {
  return String(
    order?.memberId ||
      order?.uid ||
      order?.tgId ||
      order?.telegramId ||
      order?.userId ||
      '',
  ).trim()
}

function getReadingMemberId(record) {
  return String(record?.memberId || record?.tgId || record?.telegramId || '').trim()
}

function normalizeUserType(user) {
  return String(user?.userType || user?.role || user?.level || '').trim().toLowerCase()
}

function isVipUser(user) {
  const type = normalizeUserType(user)
  return type === 'vip' || user?.isVip === true || user?.paid === true
}

function isActiveVipUser(user, nowMs = Date.now()) {
  if (!isVipUser(user)) return false

  const expiresAt = user?.expiresAt || user?.expiredAt || user?.expireTime || user?.vipExpiresAt
  if (!expiresAt) return true

  const expiresMs = parseDateTimeMs(expiresAt) || Date.parse(String(expiresAt))
  if (!Number.isFinite(expiresMs)) return true
  return expiresMs > nowMs
}

function isSuccessfulOrder(order) {
  const status = String(order?.status || order?.result || order?.payStatus || '').trim().toLowerCase()
  if (!status) return Boolean(order?.paidAt || order?.payTime || order?.success === true || order?.paid === true)

  return (
    status.includes('成功') ||
    status === 'paid' ||
    status === 'success' ||
    status === 'completed' ||
    status === 'succeeded' ||
    status === 'ok' ||
    status === '1' ||
    status === 'true'
  )
}

function parseAmountUsd(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').replace(/[^0-9.-]/g, '')
  const num = Number(text)
  return Number.isFinite(num) ? num : 0
}

function getOrderTimeMs(order) {
  const atMs = Number(order?.atMs)
  if (Number.isFinite(atMs) && atMs > 0) return atMs

  return parseDateTimeMs(
    order?.paidAt ||
      order?.payTime ||
      order?.createdAt ||
      order?.time ||
      order?.orderTime ||
      order?.created_time ||
      order?.pay_at ||
      order?.updatedAt,
  )
}

function getReadingTimeMs(record) {
  return Number(record?.ts) || parseDateTimeMs(record?.readAt)
}

function getCambodiaMonthKey(date = new Date()) {
  const parts = getCambodiaParts(date)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`
}

function getMonthKeyFromMs(ms) {
  if (!Number.isFinite(ms)) return ''
  return getCambodiaMonthKey(new Date(ms))
}

export function extractUsers(data) {
  if (Array.isArray(data?.users)) return data.users
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data)) return data
  return []
}

export function extractOrders(data) {
  if (Array.isArray(data?.orders)) return data.orders
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data)) return data
  return []
}

export function extractOrdersFromUsers(users = []) {
  const orders = []

  users.forEach((user) => {
    const tgId = getTelegramUserId(user)
    const sources = [
      user?.financeRecords,
      user?.rechargeRecords,
      user?.transactions,
      user?.orders,
      user?.payments,
    ].filter(Array.isArray)

    sources.flat().forEach((item) => {
      orders.push({
        ...item,
        memberId: getOrderMemberId(item) || tgId,
        tgId: item?.tgId || item?.telegramId || tgId,
      })
    })
  })

  return orders
}

export function mergeOrderSources(...sources) {
  const merged = []
  const seen = new Set()

  sources.flat().forEach((order, index) => {
    if (!order || typeof order !== 'object') return
    const key = String(
      order?.id ||
        order?.orderNo ||
        order?.orderId ||
        `${getOrderMemberId(order)}-${getOrderTimeMs(order)}-${order?.amount ?? order?.price ?? index}`,
    )
    if (seen.has(key)) return
    seen.add(key)
    merged.push(order)
  })

  return merged
}

function countUniqueReadersToday(readingRecords = []) {
  const todayFromMs = parseDateTimeMs(`${getSettlementDateString(0)} 09:00:00`)
  const todayToMs = parseDateTimeMs(`${getSettlementDateString(1)} 09:00:00`)
  const todayActiveIds = new Set()

  readingRecords.forEach((record) => {
    const memberId = getReadingMemberId(record)
    if (!memberId) return
    const readMs = getReadingTimeMs(record)
    if (!Number.isFinite(readMs)) return
    if (Number.isFinite(todayFromMs) && readMs < todayFromMs) return
    if (Number.isFinite(todayToMs) && readMs > todayToMs) return
    todayActiveIds.add(memberId)
  })

  return todayActiveIds.size
}

function countRegisteredUsers(users = []) {
  const registeredIds = new Set()
  users.forEach((user) => {
    const tgId = getTelegramUserId(user)
    if (tgId) registeredIds.add(tgId)
  })
  return registeredIds.size
}

/** member-ips 中 tg_* 按 Telegram 数字 ID 去重，不含 anon_* */
export function countRegisteredFromMemberIps(memberIps = []) {
  const registeredIds = new Set()

  memberIps.forEach((row) => {
    const matched = String(row?.memberId || '').trim().match(/^tg_(\d+)$/i)
    if (matched) registeredIds.add(matched[1])
  })

  return registeredIds.size
}

function countActiveVipUsers(users = []) {
  const vipIds = new Set()
  users.forEach((user) => {
    const tgId = getTelegramUserId(user)
    if (!tgId || !isActiveVipUser(user)) return
    vipIds.add(tgId)
  })
  return vipIds.size
}

function computeOrderMetrics(orders = []) {
  const successfulOrders = orders.filter(isSuccessfulOrder)
  const currentMonthKey = getCambodiaMonthKey()

  let totalRevenueUsd = 0
  let monthRevenueUsd = 0
  let monthOrderCount = 0
  const firstSuccessOrderByMember = new Map()

  successfulOrders.forEach((order) => {
    const amount = parseAmountUsd(
      order?.amount ?? order?.priceUsdLabel ?? order?.price ?? order?.total ?? order?.payAmount,
    )
    totalRevenueUsd += amount

    const orderMs = getOrderTimeMs(order)
    const orderMonthKey = getMonthKeyFromMs(orderMs)
    if (orderMonthKey === currentMonthKey) {
      monthRevenueUsd += amount
      monthOrderCount += 1
    }

    const memberId = getOrderMemberId(order)
    if (!memberId || !Number.isFinite(orderMs)) return
    const existing = firstSuccessOrderByMember.get(memberId)
    if (!existing || orderMs < existing.ms) {
      firstSuccessOrderByMember.set(memberId, { ms: orderMs, monthKey: orderMonthKey })
    }
  })

  let monthNewVip = 0
  firstSuccessOrderByMember.forEach(({ monthKey }) => {
    if (monthKey === currentMonthKey) monthNewVip += 1
  })

  return {
    successfulOrders,
    totalRevenueUsd,
    monthRevenueUsd,
    monthOrderCount,
    monthNewVip,
  }
}

function getPresenceNumber(counts, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(counts?.[key])
    if (Number.isFinite(value)) return value
  }
  return fallback
}

export function formatUsdAmount(amount) {
  const value = Number(amount) || 0
  return `$${value.toFixed(2)}`
}

export function computeDashboardStats({
  presenceCounts = {},
  monthPresenceCounts = {},
  users = [],
  readingRecords = [],
  orders = [],
  memberIps = [],
} = {}) {
  const mergedOrders = mergeOrderSources(orders)
  const orderMetrics = computeOrderMetrics(mergedOrders)

  const registeredTotal = countRegisteredFromMemberIps(memberIps)
  const vipFromUsers = countActiveVipUsers(users)
  const readTodayFromRecords = countUniqueReadersToday(readingRecords)

  const vipTotal = vipFromUsers || getPresenceNumber(presenceCounts, ['paidTotal', 'vipTotal'])
  const readToday = readTodayFromRecords || getPresenceNumber(presenceCounts, ['readTodayUnique', 'activeReadersToday'])
  const readTotal = getPresenceNumber(presenceCounts, ['readTotal'], readingRecords.length)

  const orderTotal = orderMetrics.successfulOrders.length
  const totalRevenueUsd = orderMetrics.totalRevenueUsd
  const monthRevenueUsd = orderMetrics.monthRevenueUsd
  const monthOrderCount = orderMetrics.monthOrderCount

  const monthNewVip =
    orderMetrics.monthNewVip ||
    getPresenceNumber(monthPresenceCounts, ['firstDepositMemberToday', 'paidToday', 'newVipToday'])

  const debug = {
    presenceSource: '/api/presence/online',
    registeredSource: '/api/admin-legacy/member-ips (tg_* dedupe)',
    readingSource: '/api/admin-legacy/reading-records',
    ordersSource: '/api/vip-orders/list per tg_* (vipOrdersByUser)',
    ordersCount: mergedOrders.length,
    successfulOrdersCount: orderMetrics.successfulOrders.length,
    registeredTotal,
    vipUsersCount: vipTotal,
    monthOrdersCount: monthOrderCount,
    totalRevenue: totalRevenueUsd,
    monthRevenue: monthRevenueUsd,
    memberIpsCount: memberIps.length,
    readingRecordsCount: readingRecords.length,
    presencePaidTotal: getPresenceNumber(presenceCounts, ['paidTotal']),
  }

  return {
    registeredTotal,
    vipTotal,
    readToday,
    readTotal,
    orderTotal,
    totalRevenueUsd,
    monthRevenueUsd,
    monthOrderCount,
    monthNewVip,
    debug,
  }
}

export function buildDashboardCards(stats = {}) {
  return [
    { label: '注册用户', value: stats.registeredTotal ?? 0 },
    { label: 'VIP用户', value: stats.vipTotal ?? 0 },
    { label: '今日活跃', value: stats.readToday ?? 0 },
    { label: '阅读总数', value: stats.readTotal ?? 0 },
    { label: '订单总数', value: stats.orderTotal ?? 0 },
    { label: '累计营收（USD）', value: formatUsdAmount(stats.totalRevenueUsd ?? 0) },
    { label: '本月营收（USD）', value: formatUsdAmount(stats.monthRevenueUsd ?? 0) },
    { label: '本月订单数', value: stats.monthOrderCount ?? 0 },
    { label: '本月新增VIP', value: stats.monthNewVip ?? 0 },
  ]
}

export function getCurrentMonthPresenceRange() {
  const parts = getCambodiaParts()
  const month = String(parts.month).padStart(2, '0')
  const start = `${parts.year}-${month}-01`
  const end =
    parts.month === 12
      ? `${parts.year + 1}-01-01`
      : `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-01`
  return { start, end }
}
