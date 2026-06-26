import { getLegacyToken, getToken } from './adminAuth.js'
import { fetchApiJson, getApiOriginLabel } from './apiBase.js'
import { API_ERRORS, humanizeApiError, humanizeFetchError } from './apiErrors.js'

const READ_SOURCES = {
  admin: '管理接口',
  legacy: 'Legacy 管理接口',
  public: 'APP 公开配置',
}

function httpErrorMessage(status, raw, fallback) {
  if (status === 404) {
    return '该管理接口暂未上线（404）'
  }
  return humanizeApiError(raw, fallback || `请求失败(${status})`)
}

function isSkippableReadStatus(status) {
  return status === 404 || status === 401 || status === 403
}

let lastReadSource = 'public'

async function tryReadVipPlans(path, token, readSource) {
  if (!token) return null
  const { response, data, networkError } = await fetchApiJson(path, {
    token,
    query: { t: Date.now() },
  })
  if (networkError || !response) return null
  if (isSkippableReadStatus(response.status)) return null
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, data?.error, '加载套餐失败'))
  }
  return { data, readSource }
}

/**
 * 读取 VIP 套餐（与 APP 对齐）：
 * 1) GET /api/vip-plans（APP 公开，优先，避免管理接口 404 触发跨域）
 * 2) GET /api/admin/vip-plans
 * 3) GET /api/admin-legacy/vip-plans
 */
export async function fetchAdminVipPlans() {
  let lastError = null

  const publicResult = await fetchApiJson('/api/vip-plans', { query: { t: Date.now() } })
  if (publicResult.networkError) {
    lastError = new Error(humanizeFetchError(publicResult.networkError))
  } else if (publicResult.response?.ok) {
    lastReadSource = 'public'
    return publicResult.data
  } else if (publicResult.response) {
    lastError = new Error(
      httpErrorMessage(publicResult.response.status, publicResult.data?.error, '无法读取 APP 套餐配置'),
    )
  }

  for (const attempt of [
    () => tryReadVipPlans('/api/admin/vip-plans', getToken(), 'admin'),
    () => tryReadVipPlans('/api/admin-legacy/vip-plans', getLegacyToken(), 'legacy'),
  ]) {
    try {
      const result = await attempt()
      if (result) {
        lastReadSource = result.readSource
        return result.data
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error(API_ERRORS.network)
}

export function getVipPlansReadSourceLabel() {
  return READ_SOURCES[lastReadSource] || READ_SOURCES.public
}

async function trySaveVipPlans(path, token, payload) {
  if (!token) return null
  const { response, data, networkError } = await fetchApiJson(path, {
    method: 'PUT',
    token,
    body: payload,
  })
  if (networkError) {
    throw new Error(humanizeFetchError(networkError, '保存套餐失败：无法连接后端'))
  }
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, data?.error, '保存套餐失败'))
  }
  return data
}

/** PUT /api/admin/vip-plans（不可用时回退 Legacy） */
export async function saveAdminVipPlans(payload) {
  const attempts = [
    { path: '/api/admin/vip-plans', token: getToken() },
    { path: '/api/admin-legacy/vip-plans', token: getLegacyToken() },
  ]

  let lastError = null
  for (const attempt of attempts) {
    try {
      const data = await trySaveVipPlans(attempt.path, attempt.token, payload)
      if (data) return data
    } catch (err) {
      lastError = err
    }
  }

  if (lastError) throw lastError
  throw new Error('套餐保存接口暂未上线，请重新登录或更新 APP 服务端后重试')
}

export { getApiOriginLabel }
