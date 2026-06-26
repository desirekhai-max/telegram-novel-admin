/**
 * 与正式 APP（HomePage / HomeNovelCard / ReaderPage）相同的展示统计口径。
 * 浏览量 = max(书本种子, 服务端总数)；点赞/收藏 = 书本种子 + 服务端真实互动人数。
 */

export function getSeedViewCount(novel) {
  if (!novel || typeof novel !== 'object') return 0
  const explicit = Number(novel.viewCount)
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit)
  const wan = Number(novel.viewsWan)
  if (Number.isFinite(wan) && wan >= 0) return Math.max(0, Math.round(wan * 10000))
  return 0
}

export function getSeedLikeCount(novel) {
  if (!novel || typeof novel !== 'object') return 0
  const v = Number(novel.likeCount)
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
}

export function getSeedFavoriteCount(novel) {
  if (!novel || typeof novel !== 'object') return 0
  const explicit = Number(novel.favoriteCount)
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit)
  const k = Number(novel.favoritesK)
  if (Number.isFinite(k) && k >= 0) return Math.max(0, Math.round(k * 1000))
  return 0
}

export function mergeDisplayedViewCount(seed, serverTotal) {
  const s = Number.isFinite(Number(seed)) && Number(seed) >= 0 ? Math.floor(Number(seed)) : 0
  const v = Number.isFinite(Number(serverTotal)) && Number(serverTotal) >= 0 ? Math.floor(Number(serverTotal)) : 0
  return Math.max(s, v)
}

export function mergeDisplayedInteractionCount(seed, serverDelta) {
  const s = Number.isFinite(Number(seed)) && Number(seed) >= 0 ? Math.floor(Number(seed)) : 0
  const d = Number.isFinite(Number(serverDelta)) && Number(serverDelta) >= 0 ? Math.floor(Number(serverDelta)) : 0
  return s + d
}

/** 与 APP HomeNovelCard 相同的紧凑数字格式 */
export function formatAppCompactCount(n) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v) || v < 0) return '0'
  if (v < 1000) return String(v)
  if (v < 1_000_000) {
    const k = v / 1000
    const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10
    const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '')
    return `${s}K`
  }
  const m = v / 1_000_000
  const rounded = m >= 100 ? Math.round(m) : Math.round(m * 10) / 10
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '')
  return `${s}M`
}

/**
 * 计算与 APP 首页卡片一致的观看/点赞/收藏。
 * @param {object} novel 含种子字段（viewsWan / likeCount / favoritesK 等）
 * @param {object} homeStat `/api/home-stats` 中该 id 的条目
 */
export function resolveAppCardDisplayStats(novel, homeStat = {}) {
  const apiView = Number(homeStat?.viewCount) >= 0 ? Number(homeStat.viewCount) : 0
  const apiLike = Number(homeStat?.likeCount) >= 0 ? Number(homeStat.likeCount) : 0
  const apiFav = Number(homeStat?.favoriteCount) >= 0 ? Number(homeStat.favoriteCount) : 0
  return {
    cardViewCount: mergeDisplayedViewCount(getSeedViewCount(novel), apiView),
    cardLikeCount: mergeDisplayedInteractionCount(getSeedLikeCount(novel), apiLike),
    cardFavoriteCount: mergeDisplayedInteractionCount(getSeedFavoriteCount(novel), apiFav),
  }
}

export function mergeCatalogSeedFields(adminRow, catalogRow) {
  if (!adminRow || typeof adminRow !== 'object') return adminRow
  if (!catalogRow || typeof catalogRow !== 'object') return adminRow
  return {
    ...adminRow,
    viewCount: catalogRow.viewCount ?? adminRow.viewCount,
    viewsWan: catalogRow.viewsWan ?? adminRow.viewsWan,
    likeCount: catalogRow.likeCount ?? adminRow.likeCount,
    favoriteCount: catalogRow.favoriteCount ?? adminRow.favoriteCount,
    favoritesK: catalogRow.favoritesK ?? adminRow.favoritesK,
  }
}
