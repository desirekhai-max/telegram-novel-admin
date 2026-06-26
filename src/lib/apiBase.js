import { isNetworkFetchError } from './apiErrors.js'

const RAW_API_BASE = String(import.meta.env.VITE_API_BASE || '').trim()
const ENV_API_BASE = RAW_API_BASE.replace(/\/+$/, '')
const PROD_API_FALLBACK = 'https://telegram-novel-app-production-7f1e.up.railway.app'

function resolveApiBase() {
  if (ENV_API_BASE) return ENV_API_BASE
  // 未配置时默认对接正式 APP 后端（与旧版 adminAuth 行为一致）
  return PROD_API_FALLBACK
}

export const API_BASE = resolveApiBase()

export function apiUrl(path) {
  const p = String(path || '')
  const normalized = p.startsWith('/') ? p : `/${p}`
  return API_BASE ? `${API_BASE}${normalized}` : normalized
}

/** 封面、上传资源等与正式 APP 同源解析 */
export function resolveApiAssetUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value
  }
  if (value.startsWith('/')) return apiUrl(value)
  return apiUrl(`/${value}`)
}

export function stripApiAssetUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  const base = API_BASE.replace(/\/+$/, '')
  if (base && value.startsWith(base)) {
    const path = value.slice(base.length)
    return path.startsWith('/') ? path : `/${path}`
  }
  if (/^https?:\/\//i.test(value) && base) {
    try {
      const u = new URL(value)
      const b = new URL(base)
      if (u.origin === b.origin) return `${u.pathname}${u.search}`
    } catch {
      /* ignore */
    }
  }
  return value
}

/**
 * 统一 fetch；网络层失败（含 CORS 导致的 Failed to fetch）不抛错，由调用方回退。
 */
export async function fetchApiJson(path, { method = 'GET', token, body, query } = {}) {
  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })
  const qs = params.toString()

  try {
    const response = await fetch(apiUrl(`${path}${qs ? `?${qs}` : ''}`), {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    return { response, data, networkError: null }
  } catch (err) {
    if (isNetworkFetchError(err)) {
      return { response: null, data: {}, networkError: err }
    }
    throw err
  }
}

export function getApiOriginLabel() {
  if (!API_BASE) return '本地 API 代理'
  try {
    return new URL(API_BASE).host
  } catch {
    return API_BASE
  }
}
