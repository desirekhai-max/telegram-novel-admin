import { getCambodiaParts } from './cambodiaTime.js'
import { fetchAdminNovel, fetchAdminNovels } from './novelsAdminApi.js'

const LIST_PAGE_SIZE = 50

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function buildBackupFilename(date = new Date()) {
  const parts = getCambodiaParts(date)
  const stamp = `${parts.year}${pad2(parts.month)}${pad2(parts.day)}-${pad2(parts.hour)}${pad2(parts.minute)}${pad2(parts.second)}`
  return `69kkh-books-${stamp}.json`
}

export function downloadJsonFile(filename, payload) {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  downloadBlobFile(filename, blob)
}

export function downloadBlobFile(filename, blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function fetchAllNovelSummaries() {
  const summaries = []
  let page = 1
  let total = Infinity

  while (summaries.length < total) {
    const data = await fetchAdminNovels({ page, pageSize: LIST_PAGE_SIZE })
    const items = Array.isArray(data?.items) ? data.items : []
    total = Number(data?.total)
    if (!Number.isFinite(total)) total = summaries.length + items.length
    if (!items.length) break
    summaries.push(...items)
    if (items.length < LIST_PAGE_SIZE) break
    page += 1
  }

  return summaries
}

/** 通过现有 Legacy 只读 GET 接口拉取完整书库备份包（不写服务器） */
export async function buildNovelsBackupPayload({ onProgress } = {}) {
  onProgress?.({ phase: 'list', current: 0, total: 0, message: '正在获取小说列表…' })

  const summaries = await fetchAllNovelSummaries()
  const total = summaries.length

  if (!total) {
    throw new Error('当前没有可导出的小说')
  }

  const novels = []

  for (let i = 0; i < summaries.length; i += 1) {
    const summary = summaries[i]
    const id = summary?.id
    if (!id) continue

    onProgress?.({
      phase: 'detail',
      current: i + 1,
      total,
      message: `正在读取第 ${i + 1}/${total} 本：${summary.title || id}`,
    })

    const data = await fetchAdminNovel(id)
    const novel = data?.novel
    if (!novel || typeof novel !== 'object') {
      throw new Error(`无法读取小说详情：${summary.title || id}`)
    }
    novels.push(JSON.parse(JSON.stringify(novel)))
  }

  const exportedAt = new Date().toISOString()
  return {
    schema: '69kkh-novels-backup-v1',
    exportedAt,
    count: novels.length,
    novels,
  }
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(n) {
  const buf = new Uint8Array(2)
  new DataView(buf.buffer).setUint16(0, n & 0xffff, true)
  return buf
}

function u32(n) {
  const buf = new Uint8Array(4)
  new DataView(buf.buffer).setUint32(0, n >>> 0, true)
  return buf
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  chunks.forEach((part) => {
    out.set(part, offset)
    offset += part.length
  })
  return out
}

async function deflateRawBytes(data) {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return data
}

/** 浏览器端单文件 ZIP，与服务端 zip-utils 格式兼容 */
export async function buildSingleFileZip(filename, content) {
  const nameBuf = new TextEncoder().encode(String(filename || 'data.json'))
  const data = new TextEncoder().encode(String(content))
  const compressed = await deflateRawBytes(data)
  const method = compressed.length === data.length ? 0 : 8
  const payload = method === 0 ? data : compressed
  const checksum = crc32(data)

  const localHeader = concatBytes([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(checksum),
    u32(payload.length),
    u32(data.length),
    u16(nameBuf.length),
    u16(0),
    nameBuf,
  ])

  const centralHeader = concatBytes([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(checksum),
    u32(payload.length),
    u32(data.length),
    u16(nameBuf.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    nameBuf,
  ])

  const centralOffset = localHeader.length + payload.length
  const endRecord = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(centralHeader.length),
    u32(centralOffset),
    u16(0),
  ])

  return new Blob([localHeader, payload, centralHeader, endRecord], { type: 'application/zip' })
}

export async function downloadBackupPayload(payload, format = 'json') {
  const filename = buildBackupFilename()
  const json = `${JSON.stringify(payload, null, 2)}\n`
  if (format === 'zip') {
    const zipName = filename.replace(/\.json$/i, '.zip')
    const blob = await buildSingleFileZip(filename, json)
    downloadBlobFile(zipName, blob)
    return { filename: zipName, count: payload.count }
  }
  downloadJsonFile(filename, payload)
  return { filename, count: payload.count }
}

/**
 * Read-only export: fetches every novel with full chapter payload, then downloads JSON locally.
 * Does not write, delete, or mutate server data.
 */
export async function exportAllNovelsBackup({ onProgress, format = 'json' } = {}) {
  const payload = await buildNovelsBackupPayload({ onProgress })
  const result = await downloadBackupPayload(payload, format)
  return { ...result, exportedAt: payload.exportedAt }
}
