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

export async function fetchOrders({ token, from, to }) {
  return requestJson('/api/orders', {
    token,
    query: { from, to },
  })
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
