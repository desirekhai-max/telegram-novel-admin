import { getCambodiaParts } from './cambodiaTime.js'

export function formatNotificationTime(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value)) return '—'
  const parts = getCambodiaParts(new Date(value))
  const now = getCambodiaParts(new Date())
  const sameDay =
    parts.year === now.year && parts.month === now.month && parts.day === now.day
  if (sameDay) {
    const h12 = parts.hour % 12 || 12
    const ampm = parts.hour >= 12 ? 'PM' : 'AM'
    return `${h12}:${String(parts.minute).padStart(2, '0')} ${ampm}`
  }
  return `${parts.year}-${parts.month}-${parts.day}`
}
