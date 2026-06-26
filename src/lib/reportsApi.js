import { getToken } from './adminAuth.js'
import { apiUrl, getApiOriginLabel, resolveApiAssetUrl } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'

const REPORT_TIMEZONE = 'Asia/Phnom_Penh'
const REPORT_STATUSES = new Set(['pending', 'processed', 'ignored'])

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
    if (response.status === 404 && /not found/i.test(String(raw))) {
      throw new Error(
        humanizeApiError(
          raw,
          '举报接口未部署或路径不存在，请确认正式 APP 已发布含 /api/admin/reports 的版本',
        ),
      )
    }
    throw new Error(humanizeApiError(raw, `请求失败(${response.status})`))
  }
  return data
}

function normalizeReportStatus(raw) {
  const status = String(raw || '').trim().toLowerCase()
  return REPORT_STATUSES.has(status) ? status : 'pending'
}

/** 与正式 APP enrichAdminReportRow 对齐 */
export function normalizeAdminReportRow(row) {
  if (!row || typeof row !== 'object') return null
  const at = Number(row.at || row.createdAt || 0)
  const reason = String(row.reason || row.text || '').trim()
  return {
    id: String(row.id || '').trim(),
    novelId: String(row.novelId || '').trim(),
    novelTitle: String(row.novelTitle || '').trim(),
    chapterTitle: String(row.chapterTitle || '').trim(),
    chapterIndex: row.chapterIndex,
    reason,
    text: String(row.text || reason).trim(),
    at,
    status: normalizeReportStatus(row.status),
    userName: String(row.userName || row.name || '').trim(),
    userAvatar: String(row.userAvatar || row.avatar || '').trim(),
    userId: String(row.userId || '').trim(),
    screenshotUrl: String(row.screenshotUrl || '').trim(),
    handledAt: Number(row.handledAt || row.handledAtMs || 0),
    memberTier: String(row.memberTier || '').trim(),
    vipActive: Boolean(row.vipActive),
  }
}

export function formatAdminReportTime(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: REPORT_TIMEZONE,
  })
}

export function resolveReportScreenshotUrl(raw) {
  return resolveApiAssetUrl(raw)
}

export function resolveReportAvatarUrl(raw) {
  return resolveApiAssetUrl(raw)
}

/** GET /api/admin/reports */
export async function fetchAdminReports() {
  const data = await requestJson('/api/admin/reports', {
    query: { t: Date.now() },
  })
  const items = Array.isArray(data?.items) ? data.items : []
  return items.map(normalizeAdminReportRow).filter(Boolean)
}

/** PATCH /api/admin/reports/:novelId/:reportId */
export async function patchAdminReportStatus({ novelId, reportId, status }) {
  const novelKey = String(novelId || '').trim()
  const reportKey = String(reportId || '').trim()
  const nextStatus = normalizeReportStatus(status)
  if (!novelKey || !reportKey) throw new Error('举报记录无效')
  const data = await requestJson(
    `/api/admin/reports/${encodeURIComponent(novelKey)}/${encodeURIComponent(reportKey)}`,
    {
      method: 'PATCH',
      body: { status: nextStatus },
    },
  )
  return data?.item ? normalizeAdminReportRow(data.item) : null
}

export { getApiOriginLabel }
