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

export async function fetchHomeStats({ token, from, to }) {
  return requestJson('/api/presence/home-stats', {
    token,
    query: { from, to },
  })
}

export async function fetchReadingRecords({ token, filters }) {
  return requestJson('/api/reading-records/list', {
    token,
    query: filters,
  })
}

export async function fetchOrders({ token, from, to }) {
  return requestJson('/api/orders', {
    token,
    query: { from, to },
  })
}
