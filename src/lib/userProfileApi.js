import { getToken } from './adminAuth.js'
import { apiUrl } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'
import { enrichAdminProfileOrdersSection } from './ordersApi.js'

async function requestJson(path, { method = 'GET', body, query } = {}) {
  const token = getToken()
  if (!token) throw new Error('需要管理员登录，请重新登录')

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
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const raw = data?.error || `请求失败(${response.status})`
    const fallback =
      response.status === 400
        ? '操作被拒绝，请检查套餐与用户状态'
        : response.status === 404
          ? '未找到该用户或资源'
          : `请求失败(${response.status})`
    const err = new Error(humanizeApiError(raw, fallback))
    err.status = response.status
    err.rawError = String(raw || '').trim().toLowerCase()
    throw err
  }
  return data
}

/** GET /api/admin/users/:tgId/profile */
export async function fetchAdminUserProfileDetail(tgId) {
  const id = String(tgId || '').trim()
  if (!id) return null
  const data = await requestJson(`/api/admin/users/${encodeURIComponent(id)}/profile`, {
    query: { t: Date.now() },
  })
  const profile = data?.profile ?? null
  if (!profile) return null
  return {
    ...profile,
    orders: enrichAdminProfileOrdersSection(profile.orders),
  }
}

/** POST /api/admin/users/:tgId/actions — ban/unban/vip_purchase/deduct_vip/manual_vip_adjust 等 */
export async function postAdminUserAction(tgId, payload = {}) {
  const id = String(tgId || '').trim()
  if (!id) throw new Error('用户 ID 无效')
  const data = await requestJson(`/api/admin/users/${encodeURIComponent(id)}/actions`, {
    method: 'POST',
    body: payload,
  })
  return data?.profile ?? null
}

/** 客服代购 VIP：优先 vip_purchase，旧版服务端回退 gift_vip */
export async function postAdminUserVipPurchase(tgId, { planId } = {}) {
  const id = String(tgId || '').trim()
  const normalizedPlanId = String(planId || '').trim()
  if (!id) throw new Error('用户 ID 无效')
  if (!normalizedPlanId) throw new Error('请选择 VIP 套餐')

  try {
    return await postAdminUserAction(id, { action: 'vip_purchase', planId: normalizedPlanId })
  } catch (err) {
    const rawError = String(err?.rawError || err?.message || '').toLowerCase()
    const unsupported =
      rawError.includes('unsupported action') ||
      rawError.includes('尚未支持') ||
      rawError.includes('不支持该操作')
    if (!unsupported) throw err
    return postAdminUserAction(id, {
      action: 'gift_vip',
      planId: normalizedPlanId,
      sourceType: 'vip_purchase',
    })
  }
}
