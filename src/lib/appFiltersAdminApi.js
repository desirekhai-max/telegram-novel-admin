import { getLegacyToken, getToken } from './adminAuth.js'
import { fetchApiJson, getApiOriginLabel } from './apiBase.js'
import { API_ERRORS, humanizeApiError, humanizeFetchError } from './apiErrors.js'

/** 后台可编辑的筛选项（不含排序，排序由 APP 固定） */
export const SECTIONS = ['genres', 'tags', 'status', 'wordRanges']

const READ_SOURCES = {
  admin: '管理接口',
  legacy: 'Legacy 管理接口',
  public: 'APP 公开配置',
}

function normalizeFilterItem(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id ?? raw.value ?? '').trim()
  if (!id) return null
  const label = String(raw.label ?? id).trim() || id
  return {
    id,
    label,
    enabled: raw.enabled !== false && raw.enabled !== 0 && raw.enabled !== 'false',
    sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : index * 10,
    pill: raw.pill === true || raw.pill === 'true' || id === 'all',
    long: raw.long === true || raw.long === 'true',
  }
}

function normalizeSectionItems(data, key) {
  const section = data?.[key]
  const rows = Array.isArray(section)
    ? section
    : Array.isArray(section?.items)
      ? section.items
      : []
  const items = []
  const seen = new Set()
  rows.forEach((row, index) => {
    const item = normalizeFilterItem(row, index)
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    items.push(item)
  })
  items.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id))
  return items
}

function buildSectionsPayload(data) {
  const out = {}
  for (const key of SECTIONS) {
    out[key] = { items: normalizeSectionItems(data, key) }
  }
  return out
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

async function tryFetchAdminFilters() {
  const token = getToken()
  if (!token) return null
  const { response, data, networkError } = await fetchApiJson('/api/admin/app-filters', {
    token,
    query: { t: Date.now() },
  })
  if (networkError || !response) return null
  if (isSkippableReadStatus(response.status)) return null
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, data?.error, '加载筛选配置失败'))
  }
  return { data, readSource: 'admin' }
}

async function tryFetchLegacyAdminFilters() {
  const token = getLegacyToken()
  if (!token) return null
  const { response, data, networkError } = await fetchApiJson('/api/admin-legacy/app-filters', {
    token,
    query: { t: Date.now() },
  })
  if (networkError || !response) return null
  if (isSkippableReadStatus(response.status)) return null
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, data?.error, '加载筛选配置失败'))
  }
  return { data, readSource: 'legacy' }
}

/** 与 APP 首页同源：GET /api/app-filters */
async function fetchPublicAppFilters() {
  const { response, data, networkError } = await fetchApiJson('/api/app-filters', {
    query: { t: Date.now() },
  })
  if (networkError) {
    throw new Error(humanizeFetchError(networkError))
  }
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, data?.error, '无法读取 APP 筛选配置'))
  }
  return { data, readSource: 'public' }
}

let lastReadSource = 'public'

/**
 * 读取筛选配置（与 APP 对齐）：
 * 1) /api/app-filters（APP 公开，优先）
 * 2) /api/admin/app-filters
 * 3) /api/admin-legacy/app-filters
 */
export async function fetchAdminAppFilters() {
  let result = null
  let lastError = null

  for (const loader of [fetchPublicAppFilters, tryFetchAdminFilters, tryFetchLegacyAdminFilters]) {
    try {
      result = await loader()
      if (result) break
    } catch (err) {
      lastError = err
    }
  }

  if (!result) {
    throw lastError || new Error(API_ERRORS.network)
  }

  lastReadSource = result.readSource
  return buildSectionsPayload(result.data)
}

export function getAppFiltersReadSourceLabel() {
  return READ_SOURCES[lastReadSource] || READ_SOURCES.public
}

async function trySaveSection(path, token, section, items) {
  if (!token) return null
  const { response, data, networkError } = await fetchApiJson(path, {
    method: 'PUT',
    token,
    body: { items },
  })
  if (networkError) {
    throw new Error(humanizeFetchError(networkError, '保存筛选配置失败：无法连接后端'))
  }
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, data?.error, '保存筛选配置失败'))
  }
  return data
}

/** PUT /api/admin/app-filters/:section（不可用时回退 Legacy） */
export async function saveAdminAppFilterSection(section, items) {
  if (!SECTIONS.includes(section)) throw new Error('未知筛选项类型')

  const attempts = [
    {
      path: `/api/admin/app-filters/${section}`,
      token: getToken(),
    },
    {
      path: `/api/admin-legacy/app-filters/${section}`,
      token: getLegacyToken(),
    },
  ]

  let lastError = null
  for (const attempt of attempts) {
    try {
      const data = await trySaveSection(attempt.path, attempt.token, section, items)
      if (data) return data
    } catch (err) {
      lastError = err
    }
  }

  if (lastError) throw lastError
  throw new Error('筛选保存接口暂未上线，请重新登录或更新 APP 服务端后重试')
}

export { getApiOriginLabel }
