const CACHE_KEY = 'admin_reading_records_v1'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function readReadingRecordsCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.rows)) return null
    if (Date.now() - Number(parsed.savedAt || 0) > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function writeReadingRecordsCache(result) {
  if (!result || !Array.isArray(result.rows)) return
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        rows: result.rows,
        showDeviceHint: Boolean(result.showDeviceHint),
        deviceHintMessage: String(result.deviceHintMessage || ''),
        deviceResolvedCount: Number(result.deviceResolvedCount) || 0,
        savedAt: Date.now(),
      }),
    )
  } catch {
    // ignore quota errors
  }
}

export function clearReadingRecordsCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
