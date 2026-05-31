const API_BASE = 'https://telegram-novel-app-production-7f1e.up.railway.app'
const TOKEN_KEY = 'admin_token'
const LEGACY_TOKEN_KEY = 'admin_legacy_token'
const USERNAME_KEY = 'admin_username'

function parseJsonSafe(response) {
  return response.json().catch(() => ({}))
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

export function getLegacyToken() {
  return sessionStorage.getItem(LEGACY_TOKEN_KEY) || ''
}

export function getStoredUsername() {
  return sessionStorage.getItem(USERNAME_KEY) || ''
}

export function saveAuth(token, username, legacyToken) {
  console.log('SAVE AUTH', {
    token,
    username,
    legacyToken,
  })

  sessionStorage.setItem(TOKEN_KEY, token)
  if (legacyToken) {
    sessionStorage.setItem(LEGACY_TOKEN_KEY, legacyToken)
    console.log('SAVE AUTH legacy setItem executed', LEGACY_TOKEN_KEY, legacyToken)
  }
  if (username) {
    sessionStorage.setItem(USERNAME_KEY, username)
  }
}

export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(LEGACY_TOKEN_KEY)
  sessionStorage.removeItem(USERNAME_KEY)
}

async function loginLegacyAdmin({ username, password, otp }) {
  const response = await fetch(`${API_BASE}/api/admin-legacy/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, otp }),
  })

  const data = await parseJsonSafe(response)

  console.log('LEGACY LOGIN STATUS', response.status)
  console.log('LEGACY LOGIN RESPONSE', data)

  if (!response.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || 'Legacy 管理员登录失败')
  }

  console.log('LEGACY LOGIN RETURN TOKEN', data.token)
  return data.token
}

export async function loginAdmin({ username, password, otp }) {
  const credentials = {
    username: String(username || '').trim(),
    password: String(password || '').trim(),
    otp: String(otp || '').trim(),
  }

  const adminResponse = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })

  const data = await parseJsonSafe(adminResponse)
  if (!adminResponse.ok || !data?.token) {
    throw new Error(data?.error || '账号、密码或动态码错误')
  }

  let legacyToken = ''
  try {
    legacyToken = await loginLegacyAdmin(credentials)
    console.log('LEGACY TOKEN SUCCESS:', legacyToken)
  } catch (error) {
    console.log('LEGACY LOGIN FAILED:', error)
  }

  console.log('LEGACY TOKEN VALUE', legacyToken)
  console.log('LOGIN RETURN', {
    token: data.token,
    legacyToken,
    username: data.username || data.user?.username || credentials.username,
  })

  return {
    token: data.token,
    legacyToken: legacyToken || '',
    username: data.username || data.user?.username || credentials.username,
  }
}

export async function fetchAdminSession(token) {
  if (!token) {
    return { ok: false }
  }

  const response = await fetch(`${API_BASE}/api/admin/session`, {
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
      fetch(`${API_BASE}/api/admin/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}),
    )
  }
  if (legacyToken) {
    requests.push(
      fetch(`${API_BASE}/api/admin-legacy/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${legacyToken}` },
      }).catch(() => {}),
    )
  }

  await Promise.all(requests)
}
