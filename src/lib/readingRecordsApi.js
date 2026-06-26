import { getLegacyToken, getToken } from './adminAuth.js'
import { apiUrl } from './apiBase.js'
import { humanizeApiError, isLegacyUnauthorizedMessage } from './apiErrors.js'

function memberIdLookupKeys(memberId) {
  const raw = String(memberId || '').trim()
  if (!raw) return []
  const stripped = raw.replace(/^tg_/, '')
  return [...new Set([raw, stripped, stripped ? `tg_${stripped}` : ''].filter(Boolean))]
}

function normalizeTelegramUserId(memberId) {
  const raw = String(memberId || '').trim()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return raw
  const matched = raw.match(/^tg_(\d+)$/i)
  return matched ? matched[1] : ''
}

export function formatDeviceLabel(device) {
  const raw = String(device || '').trim()
  if (!raw || raw === '—') return '—'
  const d = raw.toLowerCase()
  if (d === 'android') return 'Android'
  if (d === 'ios') return 'iOS'
  if (d === 'web' || d === '电脑' || d === 'pc' || d === 'desktop') return '电脑'
  return raw
}

function formatReadAt(row) {
  const text = String(row?.readAt || '').trim()
  if (text) return text
  const ts = Number(row?.ts)
  if (Number.isFinite(ts) && ts > 0) {
    return new Date(ts).toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  return '—'
}

function formatIp(value) {
  const ip = String(value || '').trim()
  if (!ip || ip === '—' || ip === '-') return '—'
  return ip.replace(/^::ffff:/, '')
}

function pickDeviceFromRow(row) {
  const candidates = [
    row?.device,
    row?.lastDevice,
    row?.os,
    row?.platform,
    row?.clientDevice,
  ]
  for (const raw of candidates) {
    const label = formatDeviceLabel(raw)
    if (label !== '—') return label
  }
  return ''
}

function resolveDeviceForRow(row, memberCtx, profileDevice) {
  const fromRecord = pickDeviceFromRow(row)
  if (fromRecord) return fromRecord

  if (memberCtx?.device) {
    const fromMember = formatDeviceLabel(memberCtx.device)
    if (fromMember !== '—') return fromMember
  }

  if (profileDevice && profileDevice !== '—') return profileDevice

  const memberId = String(row?.memberId || '').trim()
  if (memberId.startsWith('anon_')) return '电脑'
  return '—'
}

function buildMemberContextLookup(memberIpRows = []) {
  const map = new Map()
  memberIpRows.forEach((row) => {
    const loginIp = formatIp(row?.loginIp)
    const registerIp = formatIp(row?.registerIp)
    const device = formatDeviceLabel(row?.device || row?.lastDevice)
    const ctx = {
      loginIp: loginIp !== '—' ? loginIp : '',
      registerIp: registerIp !== '—' ? registerIp : '',
      device: device !== '—' ? device : '',
    }
    memberIdLookupKeys(row?.memberId).forEach((key) => {
      map.set(key, ctx)
    })
  })
  return map
}

async function fetchUserProfileDevice(tgId) {
  const token = getToken()
  if (!token) return ''
  try {
    const response = await fetch(
      apiUrl(`/api/admin/users/${encodeURIComponent(String(tgId))}/profile`),
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return ''
    return formatDeviceLabel(data?.profile?.basic?.lastDevice)
  } catch {
    return ''
  }
}

async function buildProfileDeviceLookup(rows = []) {
  const tgIds = [
    ...new Set(rows.map((row) => normalizeTelegramUserId(row?.memberId)).filter(Boolean)),
  ].slice(0, 20)

  const map = new Map()
  await Promise.all(
    tgIds.map(async (tgId) => {
      const device = await fetchUserProfileDevice(tgId)
      if (device && device !== '—') map.set(tgId, device)
    }),
  )
  return map
}

function enrichReadingRecordRow(row, memberLookup = new Map(), profileDeviceLookup = new Map()) {
  if (!row || typeof row !== 'object') return row

  let memberCtx = null
  for (const key of memberIdLookupKeys(row.memberId)) {
    if (memberLookup.has(key)) {
      memberCtx = memberLookup.get(key)
      break
    }
  }

  const tgId = normalizeTelegramUserId(row.memberId)
  const profileDevice = tgId ? profileDeviceLookup.get(tgId) || '' : ''

  const directIp = formatIp(row.ip || row.clientIp || row.loginIp)
  let ip = directIp
  if (ip === '—' && memberCtx) {
    ip = formatIp(memberCtx.loginIp || memberCtx.registerIp)
  }

  const device = resolveDeviceForRow(row, memberCtx, profileDevice)

  return {
    ...row,
    readAt: formatReadAt(row),
    device: formatDeviceLabel(device),
    ip,
    deviceResolved: device !== '—',
  }
}

export function normalizeReadingRecordRow(row, memberLookup, profileDeviceLookup) {
  return enrichReadingRecordRow(row, memberLookup, profileDeviceLookup)
}

export { isLegacyUnauthorizedMessage }

export const DEVICE_MISSING_REASON_ALL =
  '当前列表全部无设备信息。请确认已在 APP 内打开章节阅读（触发 device 上报），等待约 10 秒后刷新本页。'

export const DEVICE_MISSING_REASON_PARTIAL =
  '部分旧记录无设备字段；同用户重新在 APP 阅读后，服务端会通过 memberLastDevice 自动补全。'

/** @deprecated use DEVICE_MISSING_REASON_ALL */
export const DEVICE_MISSING_REASON = DEVICE_MISSING_REASON_ALL

async function requestJson(path, { query } = {}) {
  const token = getLegacyToken() || getToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })
  const qs = params.toString()

  const response = await fetch(apiUrl(`${path}${qs ? `?${qs}` : ''}`), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const raw = data?.error || `请求失败(${response.status})`
    throw new Error(humanizeApiError(raw, `请求失败(${response.status})`))
  }
  return data
}

/**
 * 与正式 APP 同源：GET /api/admin-legacy/reading-records
 * 并行拉 member-ips / 用户资料 补全设备
 */
export async function fetchAdminReadingRecords() {
  const [recordsData, memberIpData] = await Promise.all([
    requestJson('/api/admin-legacy/reading-records', { query: { t: Date.now() } }),
    requestJson('/api/admin-legacy/member-ips', { query: { t: Date.now() } }).catch(() => ({ items: [] })),
  ])

  const items = Array.isArray(recordsData?.items) ? recordsData.items : []
  const memberLookup = buildMemberContextLookup(
    Array.isArray(memberIpData?.items) ? memberIpData.items : [],
  )
  const profileDeviceLookup = await buildProfileDeviceLookup(items)

  const rows = items.map((row) => enrichReadingRecordRow(row, memberLookup, profileDeviceLookup))
  const missingDeviceCount = rows.filter((row) => row.device === '—').length
  const deviceResolvedCount = rows.length - missingDeviceCount

  return {
    rows,
    missingDeviceCount,
    deviceResolvedCount,
    showDeviceHint: rows.length > 0 && missingDeviceCount > 0,
    deviceHintMessage:
      missingDeviceCount === rows.length ? DEVICE_MISSING_REASON_ALL : DEVICE_MISSING_REASON_PARTIAL,
  }
}
