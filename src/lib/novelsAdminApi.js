import { getLegacyToken } from './adminAuth.js'

const API_BASE = 'https://telegram-novel-app-production-7f1e.up.railway.app'

async function requestJson(path, { method = 'GET', body, query } = {}) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })
  const qs = params.toString()

  const response = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ''}`, {
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

export async function fetchAdminNovels(query = {}) {
  return requestJson('/api/admin-legacy/novels', { query })
}

export async function fetchAdminNovel(id) {
  return requestJson(`/api/admin-legacy/novels/${encodeURIComponent(String(id))}`)
}

export async function createAdminNovel(body) {
  return requestJson('/api/admin-legacy/novels', { method: 'POST', body })
}

export async function updateAdminNovel(id, body) {
  return requestJson(`/api/admin-legacy/novels/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body,
  })
}

export async function deleteAdminNovel(id) {
  return requestJson(`/api/admin-legacy/novels/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}

export async function fetchAdminNovelTitles() {
  const data = await requestJson('/api/admin-legacy/novel-titles')
  return Array.isArray(data?.items) ? data.items : []
}

export async function fetchAdminChapters(query = {}) {
  return requestJson('/api/admin-legacy/chapters', { query })
}

export async function createAdminChapter(body) {
  return requestJson('/api/admin-legacy/chapters', { method: 'POST', body })
}

export async function updateAdminChapter(novelId, chapterIndex, body) {
  return requestJson(
    `/api/admin-legacy/chapters/${encodeURIComponent(String(novelId))}/${chapterIndex}`,
    { method: 'PUT', body },
  )
}

export async function deleteAdminChapter(novelId, chapterIndex) {
  return requestJson(
    `/api/admin-legacy/chapters/${encodeURIComponent(String(novelId))}/${chapterIndex}`,
    { method: 'DELETE' },
  )
}
