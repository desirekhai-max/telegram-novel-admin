const CAMBODIA_TZ = 'Asia/Phnom_Penh'

export function getCambodiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMBODIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type) => parts.find((p) => p.type === type)?.value || '0'
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  }
}

function formatApiDate(utcDate) {
  const y = utcDate.getUTCFullYear()
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utcDate.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatCambodiaNowText(date = new Date()) {
  const parts = getCambodiaParts(date)
  const hour = String(parts.hour).padStart(2, '0')
  const minute = String(parts.minute).padStart(2, '0')
  const second = String(parts.second).padStart(2, '0')
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${minute}:${second}`
}

export function getSettlementDateString(offsetDays = 0, date = new Date()) {
  const parts = getCambodiaParts(date)
  const settlementBaseUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  if (parts.hour < 9) {
    settlementBaseUtc.setUTCDate(settlementBaseUtc.getUTCDate() - 1)
  }
  settlementBaseUtc.setUTCDate(settlementBaseUtc.getUTCDate() + offsetDays)
  return formatApiDate(settlementBaseUtc)
}

/** 与 APP 后端一致：金边时区每日 09:00 为结算起点 */
export function getSettlementStartMs(nowMs = Date.now()) {
  const tzOffsetMs = 7 * 60 * 60 * 1000
  const shifted = new Date(nowMs + tzOffsetMs)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  const localDayStartMs = Date.UTC(y, m, d, 0, 0, 0, 0)
  const settlementLocalMs = localDayStartMs + 9 * 60 * 60 * 1000
  const settlementUtcMs = settlementLocalMs - tzOffsetMs
  return nowMs >= settlementUtcMs ? settlementUtcMs : settlementUtcMs - 24 * 60 * 60 * 1000
}
