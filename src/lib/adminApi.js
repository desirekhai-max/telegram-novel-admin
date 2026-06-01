const API_BASE = 'https://telegram-novel-app-production-7f1e.up.railway.app'

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

  const response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `请求失败(${response.status})`)
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

export async function fetchReports({ token }) {
  const data = await requestJson('/api/admin/reports', { token })
  return extractItems(data)
}

export async function fetchReadingRecords({ token }) {
  const data = await requestJson('/api/admin-legacy/reading-records', { token })
  return extractItems(data)
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

export async function fetchOrders({ token, from, to } = {}) {
  return requestJson('/api/orders', {
    token,
    query: { from, to },
  })
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

export async function fetchUsers({ token }) {
  return requestJson('/api/users', {
    token,
  })
}

export async function updateUserFlags({ token, userId, patch }) {
  return requestJson(`/api/users/${encodeURIComponent(String(userId))}/flags`, {
    token,
    method: 'PATCH',
    body: patch,
  })
}
