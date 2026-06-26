import { apiUrl } from './apiBase.js'
import {
  getSeedViewCount,
  mergeCatalogSeedFields,
  resolveAppCardDisplayStats,
} from './novelAppDisplayStats.js'

/**
 * 与正式 APP 相同：GET /api/novels-catalog
 */
export async function fetchAppNovelsCatalog() {
  const response = await fetch(apiUrl('/api/novels-catalog'), { cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `目录请求失败(${response.status})`)
  }
  const novels = Array.isArray(data?.novels) ? data.novels : []
  return {
    version: Number(data?.version) || 1,
    novels,
    total: novels.length,
  }
}

/**
 * 与正式 APP 相同：GET /api/novels/:id（读者可见章节）
 */
export async function fetchAppNovelDetail(id) {
  const key = String(id || '').trim()
  if (!key) throw new Error('novel id required')
  const response = await fetch(apiUrl(`/api/novels/${encodeURIComponent(key)}`), { cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `小说详情请求失败(${response.status})`)
  }
  return data?.novel ?? null
}

export function buildCatalogIndex(novels = []) {
  const byId = new Map()
  novels.forEach((row) => {
    const id = String(row?.id || '').trim()
    if (id) byId.set(id, row)
  })
  return byId
}

/**
 * 与正式 APP 首页相同：GET /api/home-stats（公开，按小说 id 聚合互动数据）
 */
export async function fetchAppHomeStats() {
  const response = await fetch(apiUrl('/api/home-stats'), { cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `互动统计请求失败(${response.status})`)
  }
  const items = data?.items && typeof data.items === 'object' ? data.items : {}
  return items
}

export async function fetchAppNovelLikeCount(novelId) {
  const id = String(novelId || '').trim()
  if (!id) return 0
  const response = await fetch(
    apiUrl(`/api/novel-likes?novelId=${encodeURIComponent(id)}&userId=`),
    { cache: 'no-store' },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `点赞统计失败(${response.status})`)
  const count = Number(data?.count)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

export async function fetchAppNovelFavoriteCount(novelId) {
  const id = String(novelId || '').trim()
  if (!id) return 0
  const response = await fetch(
    apiUrl(`/api/novel-favorites?novelId=${encodeURIComponent(id)}&userId=`),
    { cache: 'no-store' },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `收藏统计失败(${response.status})`)
  const count = Number(data?.count)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

/** 服务端观看总数（不含本机 localStorage 缓存） */
export async function fetchAppNovelViewCount(novelId, baseCount = 0) {
  const id = String(novelId || '').trim()
  if (!id) return 0
  const base = Number.isFinite(Number(baseCount)) && Number(baseCount) >= 0 ? Math.floor(Number(baseCount)) : 0
  const response = await fetch(
    apiUrl(`/api/novel-views?novelId=${encodeURIComponent(id)}&base=${encodeURIComponent(String(base))}`),
    { cache: 'no-store' },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `观看统计失败(${response.status})`)
  const count = Number(data?.count)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

/** 后台列表行与 APP 首页卡片统计对齐（同源公开 API，仅服务端数据） */
export async function alignNovelRowsWithAppStats(rows = [], { homeStatsById = {}, catalogById = new Map() } = {}) {
  return Promise.all(
    rows.map(async (row) => {
      const id = String(row?.id || '').trim()
      if (!id) return row
      const catalogRow = catalogById.get(id)
      const merged = mergeCatalogSeedFields(row, catalogRow)
      const seedV = getSeedViewCount(merged)
      const home = homeStatsById[id] ?? {}
      const [likeCount, favoriteCount, serverView] = await Promise.all([
        fetchAppNovelLikeCount(id).catch(() => Number(home.likeCount) || 0),
        fetchAppNovelFavoriteCount(id).catch(() => Number(home.favoriteCount) || 0),
        fetchAppNovelViewCount(id, seedV).catch(() => Number(home.viewCount) || 0),
      ])
      const apiView = Math.max(
        Number(home.viewCount) >= 0 ? Number(home.viewCount) : 0,
        Number(serverView) >= 0 ? Number(serverView) : 0,
      )
      const stats = resolveAppCardDisplayStats(merged, {
        viewCount: apiView,
        likeCount,
        favoriteCount,
      })
      return { ...merged, ...stats }
    }),
  )
}

/** 正式 APP 目录中已上架的小说 id 集合 */
export function buildAppCatalogIdSet(catalogNovels = []) {
  const ids = new Set()
  ;(catalogNovels || []).forEach((row) => {
    const id = String(row?.id || '').trim()
    if (id) ids.add(id)
  })
  return ids
}

/**
 * 与正式 APP GET /api/novels/:id 相同：读者可见的已发布章节
 * @returns {{ count: number, chapterIds: Set<string> }}
 */
export async function fetchAppReaderChapterMeta(novelId) {
  const id = String(novelId || '').trim()
  if (!id) return { count: 0, chapterIds: new Set() }
  const novel = await fetchAppNovelDetail(id)
  const chapters = Array.isArray(novel?.chapters) ? novel.chapters : []
  const chapterIds = new Set(
    chapters.map((ch) => String(ch?.id || '').trim()).filter(Boolean),
  )
  return { count: chapters.length, chapterIds }
}

function isChapterPublishedStatus(status) {
  return String(status || '').trim().toLowerCase() !== 'draft'
}

/** 章节列表行标注是否在读者端可见（与 getNovelForReaders 口径一致） */
export function alignChapterRowsWithApp(
  rows = [],
  { catalogIds = new Set(), chapterIdsByNovel = {} } = {},
) {
  return rows.map((row) => {
    const novelId = String(row?.novelId || '').trim()
    const chapterId = String(row?.chapterId || '').trim()
    const inCatalog = catalogIds.has(novelId)
    const published = isChapterPublishedStatus(row?.status)
    const appIds = chapterIdsByNovel[novelId]
    let appVisible = false
    if (inCatalog && published) {
      if (appIds instanceof Set && appIds.size > 0 && chapterId) {
        appVisible = appIds.has(chapterId)
      } else {
        appVisible = true
      }
    }
    return { ...row, appVisible }
  })
}

export function countAppVisibleChapters(rows = []) {
  return rows.filter((row) => row?.appVisible).length
}
