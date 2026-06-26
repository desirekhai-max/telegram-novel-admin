import { getLegacyToken } from './adminAuth.js'
import { apiUrl } from './apiBase.js'

async function requestJson(path, { method = 'GET', body } = {}) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const response = await fetch(apiUrl(path), {
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

export async function fetchAdminAppSettings() {
  const data = await requestJson('/api/admin-legacy/app-settings')
  return data?.settings || {}
}

export async function saveAdminAppSettings(settings) {
  const data = await requestJson('/api/admin-legacy/app-settings', {
    method: 'PUT',
    body: { settings },
  })
  return data?.settings || settings
}
