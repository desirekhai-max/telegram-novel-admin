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
  sessionStorage.setItem(TOKEN_KEY, token)
  if (legacyToken) {
    sessionStorage.setItem(LEGACY_TOKEN_KEY, legacyToken)
  } else {
    sessionStorage.removeItem(LEGACY_TOKEN_KEY)
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
  if (!response.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || 'Legacy 管理员登录失败')
  }

  return data.token
}

export async function loginAdmin({ username, password, otp }) {
  const credentials = {
    username: String(username || '').trim(),
    password: String(password || '').trim(),
    otp: String(otp || '').trim(),
  }

  const [adminResponse, legacyToken] = await Promise.all([
    fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }).then(async (response) => ({
      response,
      data: await parseJsonSafe(response),
    })),
    loginLegacyAdmin(credentials).catch(() => ''),
  ])

  const { response, data } = adminResponse
  if (!response.ok || !data?.token) {
    throw new Error(data?.error || '账号、密码或动态码错误')
  }

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
