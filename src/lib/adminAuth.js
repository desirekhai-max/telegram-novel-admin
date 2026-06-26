import { apiUrl } from './apiBase.js'
import { API_ERRORS, humanizeApiError, isLegacyUnauthorizedMessage } from './apiErrors.js'
const TOKEN_KEY = 'admin_token'
const LEGACY_TOKEN_KEY = 'admin_legacy_token'
const USERNAME_KEY = 'admin_username'

function authStore() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readAuthItem(key) {
  const store = authStore()
  if (!store) return ''
  let value = store.getItem(key) || ''
  if (!value) {
    try {
      value = sessionStorage.getItem(key) || ''
      if (value) {
        store.setItem(key, value)
        sessionStorage.removeItem(key)
      }
    } catch {
      // ignore
    }
  }
  return value
}

function writeAuthItem(key, value) {
  const store = authStore()
  if (!store) return
  if (value) {
    store.setItem(key, value)
  } else {
    store.removeItem(key)
  }
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function removeAuthItem(key) {
  const store = authStore()
  if (store) store.removeItem(key)
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function parseJsonSafe(response) {
  return response.json().catch(() => ({}))
}

export function getToken() {
  return readAuthItem(TOKEN_KEY)
}

export function getLegacyToken() {
  return readAuthItem(LEGACY_TOKEN_KEY)
}

export function hasLegacyToken() {
  return Boolean(getLegacyToken())
}

export function getStoredUsername() {
  return readAuthItem(USERNAME_KEY)
}

/**
 * @param {string} token - admin_token
 * @param {string} username
 * @param {string | undefined} legacyToken - admin_legacy_token；传 undefined 表示不修改已有 Legacy
 */
export function saveAuth(token, username, legacyToken) {
  if (token) {
    writeAuthItem(TOKEN_KEY, token)
  }
  if (legacyToken !== undefined) {
    if (legacyToken) {
      writeAuthItem(LEGACY_TOKEN_KEY, legacyToken)
    } else {
      removeAuthItem(LEGACY_TOKEN_KEY)
    }
  }
  if (username) {
    writeAuthItem(USERNAME_KEY, username)
  }
}

export function clearAuth() {
  removeAuthItem(TOKEN_KEY)
  removeAuthItem(LEGACY_TOKEN_KEY)
  removeAuthItem(USERNAME_KEY)
}

export function clearLegacyToken() {
  removeAuthItem(LEGACY_TOKEN_KEY)
}

export function isLegacyUnauthorizedError(error) {
  return isLegacyUnauthorizedMessage(error?.message || error)
}

async function fetchLegacySession(token) {
  const response = await fetch(apiUrl('/api/admin-legacy/session'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await parseJsonSafe(response)
  return response.ok && data?.ok !== false
}

/** Railway 重启后 Legacy 内存会话失效时，用仍有效的 admin_token 续签 */
export async function refreshLegacyTokenFromAdminSession() {
  const adminToken = getToken()
  if (!adminToken) return false

  const legacyToken = getLegacyToken()
  if (legacyToken) {
    const alive = await fetchLegacySession(legacyToken)
    if (alive) return true
    clearLegacyToken()
  }

  try {
    const response = await fetch(apiUrl('/api/admin-legacy/session/refresh'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const data = await parseJsonSafe(response)
    if (!response.ok || !data?.ok || !data?.token) return false
    saveAuth(adminToken, getStoredUsername(), data.token)
    return true
  } catch {
    return false
  }
}

export function verifyLegacyTokenInSession() {
  const legacy = getLegacyToken()
  if (!legacy) {
    throw new Error('登录未完成：未找到 admin_legacy_token，请重新登录')
  }
  return legacy
}

async function loginLegacyAdmin({ username, password, otp }) {
  const response = await fetch(apiUrl('/api/admin-legacy/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, otp }),
  })

  const data = await parseJsonSafe(response)

  if (!response.ok || !data?.ok || !data?.token) {
    throw new Error(humanizeApiError(data?.error, 'Legacy 管理员登录失败'))
  }

  return data.token
}

export async function loginAdmin({ username, password, otp }) {
  const credentials = {
    username: String(username || '').trim(),
    password: String(password || '').trim(),
    otp: String(otp || '').trim(),
  }

  let adminResponse
  try {
    adminResponse = await fetch(apiUrl('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
  } catch {
    throw new Error(API_ERRORS.network)
  }

  const data = await parseJsonSafe(adminResponse)
  if (!adminResponse.ok || !data?.token) {
    throw new Error(humanizeApiError(data?.error, API_ERRORS.invalidCredentials))
  }

  let legacyToken = ''
  try {
    legacyToken = await loginLegacyAdmin(credentials)
    console.log('Legacy Login Success')
  } catch (error) {
    console.log('Legacy Login Failed', error?.message || error)
    const detail = humanizeApiError(error?.message, API_ERRORS.legacyLoginFailed)
    throw new Error(
      detail.startsWith('Legacy')
        ? detail
        : `Legacy 登录失败：${detail}。请确认账号、密码、OTP 正确，且具备 Legacy 权限后重试。`,
    )
  }

  if (!legacyToken) {
    console.log('Legacy Login Failed', 'empty token')
    throw new Error(API_ERRORS.legacyEmptyToken)
  }

  return {
    token: data.token,
    legacyToken,
    username: data.username || data.user?.username || credentials.username,
  }
}

export async function fetchAdminSession(token) {
  if (!token) {
    return { ok: false }
  }

  const response = await fetch(apiUrl('/api/admin/session'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  const data = await parseJsonSafe(response)
  if (!response.ok || data?.ok === false) {
    return { ok: false }
  }

  return {
    ok: true,
    username: data?.username || data?.user?.username || '',
  }
}

export async function logoutAdmin() {
  const token = getToken()
  const legacyToken = getLegacyToken()

  const requests = []
  if (token) {
    requests.push(
      fetch(apiUrl('/api/admin/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}),
    )
  }
  if (legacyToken) {
    requests.push(
      fetch(apiUrl('/api/admin-legacy/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${legacyToken}` },
      }).catch(() => {}),
    )
  }

  await Promise.all(requests)
}
