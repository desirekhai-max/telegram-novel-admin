import { getLegacyToken } from './adminAuth.js'

const API_BASE = 'https://telegram-novel-app-production-7f1e.up.railway.app'

const SECTIONS = ['genres', 'tags', 'status', 'wordRanges', 'sort']

export { SECTIONS }

async function requestJson(path, { method = 'GET', body } = {}) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `请求失败(${response.status})`)
  }
  return data
}

export async function fetchAdminAppFilters() {
  return requestJson('/api/admin-legacy/app-filters')
}

export async function saveAdminAppFilterSection(section, items) {
  if (!SECTIONS.includes(section)) throw new Error('未知筛选项类型')
  return requestJson(`/api/admin-legacy/app-filters/${section}`, {
    method: 'PUT',
    body: { items },
  })
}
