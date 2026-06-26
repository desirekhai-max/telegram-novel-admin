import { getLegacyToken } from './adminAuth.js'
import { apiUrl, resolveApiAssetUrl, stripApiAssetUrl } from './apiBase.js'

export function normalizeNovelAssetRow(row) {
  if (!row || typeof row !== 'object') return row
  const coverUrl = row.coverUrl ? resolveApiAssetUrl(row.coverUrl) : ''
  return { ...row, coverUrl }
}

export function normalizeNovelAssetPayload(novel) {
  if (!novel || typeof novel !== 'object') return novel
  return {
    ...novel,
    coverUrl: novel.coverUrl ? resolveApiAssetUrl(novel.coverUrl) : '',
  }
}

export function toAdminNovelCoverPath(coverUrl) {
  return stripApiAssetUrl(coverUrl)
}

async function requestJson(path, { method = 'GET', body, query } = {}) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

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
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `请求失败(${response.status})`)
  }
  return data
}

export async function fetchAdminNovels(query = {}) {
  const data = await requestJson('/api/admin-legacy/novels', { query })
  const items = Array.isArray(data?.items) ? data.items.map(normalizeNovelAssetRow) : []
  return { ...data, items }
}

export async function fetchAdminNovel(id) {
  const data = await requestJson(`/api/admin-legacy/novels/${encodeURIComponent(String(id))}`)
  if (data?.novel) {
    return { ...data, novel: normalizeNovelAssetPayload(data.novel) }
  }
  return data
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

export async function updateAdminNovelVisibility(id, visibility) {
  return requestJson(`/api/admin-legacy/novels/${encodeURIComponent(String(id))}/visibility`, {
    method: 'PATCH',
    body: { visibility },
  })
}

export async function deleteAdminNovel(id) {
  return requestJson(`/api/admin-legacy/novels/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}

export async function uploadNovelCover({ dataUrl, previousCoverUrl = '' }) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const response = await fetch(apiUrl('/api/admin-legacy/novels/cover-upload'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dataUrl,
      previousCoverUrl: previousCoverUrl || undefined,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `上传失败(${response.status})`)
  }
  return data
}

export async function deleteNovelCoverFile(coverUrl) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const response = await fetch(apiUrl('/api/admin-legacy/novels/cover-upload'), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coverUrl }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `删除失败(${response.status})`)
  }
  return data
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

export async function moveAdminChapter(novelId, chapterIndex, direction) {
  return requestJson(
    `/api/admin-legacy/chapters/${encodeURIComponent(String(novelId))}/${chapterIndex}/move`,
    { method: 'PATCH', body: { direction } },
  )
}

export async function deleteAdminChapter(novelId, chapterIndex) {
  return requestJson(
    `/api/admin-legacy/chapters/${encodeURIComponent(String(novelId))}/${chapterIndex}`,
    { method: 'DELETE' },
  )
}
