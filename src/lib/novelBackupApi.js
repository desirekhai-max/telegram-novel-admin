import { getLegacyToken } from './adminAuth.js'
import { apiUrl } from './apiBase.js'
import { humanizeApiError } from './apiErrors.js'
import {
  buildNovelsBackupPayload,
  downloadBackupPayload,
  downloadBlobFile,
  exportAllNovelsBackup,
} from './novelBackupExport.js'

const SETTINGS_KEY = '69kkh-backup-settings'
const HISTORY_KEY = '69kkh-backup-history'
const DB_NAME = '69kkh-novel-backup'
const DB_STORE = 'payloads'

const DEFAULT_SETTINGS = {
  autoEnabled: false,
  intervalHours: 24,
}

let serverBackupReady = null

function isNotFoundResponse(response, data) {
  return response?.status === 404 || /not found/i.test(String(data?.error || ''))
}

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota errors
  }
}

function readLocalSettings() {
  return { ...DEFAULT_SETTINGS, ...readJsonStorage(SETTINGS_KEY, DEFAULT_SETTINGS) }
}

function writeLocalSettings(settings) {
  writeJsonStorage(SETTINGS_KEY, settings)
}

function readLocalHistoryMeta() {
  const items = readJsonStorage(HISTORY_KEY, [])
  return Array.isArray(items) ? items : []
}

function writeLocalHistoryMeta(items) {
  writeJsonStorage(HISTORY_KEY, items)
}

function createBackupId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  }
  return String(Date.now().toString(36))
}

function openBackupDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('浏览器不支持 IndexedDB'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'))
  })
}

async function idbPutBackup(id, payload) {
  const db = await openBackupDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put({ id, payload })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('备份保存失败'))
  })
}

async function idbGetBackup(id) {
  const db = await openBackupDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const request = tx.objectStore(DB_STORE).get(String(id || ''))
    request.onsuccess = () => resolve(request.result?.payload || null)
    request.onerror = () => reject(request.error || new Error('备份读取失败'))
  })
}

async function checkServerBackupApi() {
  if (serverBackupReady !== null) return serverBackupReady
  const token = getLegacyToken()
  if (!token) {
    serverBackupReady = false
    return false
  }
  try {
    const response = await fetch(apiUrl('/api/admin-legacy/novels-backup/settings'), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    serverBackupReady = response.ok
  } catch {
    serverBackupReady = false
  }
  return serverBackupReady
}

async function requestJson(path, { method = 'GET', body } = {}) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(humanizeApiError(data?.error, `请求失败(${response.status})`))
    err.status = response.status
    err.notFound = isNotFoundResponse(response, data)
    throw err
  }
  return data
}

async function downloadFile(path, filenameHint) {
  const token = getLegacyToken()
  if (!token) throw new Error('需要 Legacy 管理员权限，请重新登录')

  const response = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const err = new Error(humanizeApiError(data?.error, `下载失败(${response.status})`))
    err.status = response.status
    err.notFound = isNotFoundResponse(response, data)
    throw err
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="([^"]+)"/i)
  const filename = match?.[1] || filenameHint || 'backup.json'
  downloadBlobFile(filename, blob)
}

async function createClientBackupEntry({ kind = 'manual', download = false, format = 'json' } = {}) {
  const payload = await buildNovelsBackupPayload()
  const json = `${JSON.stringify(payload, null, 2)}\n`
  const item = {
    id: createBackupId(),
    kind: kind === 'auto' ? 'auto' : 'manual',
    createdAtMs: Date.now(),
    count: payload.count,
    sizeBytes: new TextEncoder().encode(json).length,
    clientSide: true,
  }

  await idbPutBackup(item.id, payload)
  const history = [item, ...readLocalHistoryMeta()]
  writeLocalHistoryMeta(history.slice(0, 20))

  if (download) {
    await downloadBackupPayload(payload, format)
  }

  return item
}

async function restoreViaServer(path, body) {
  try {
    return await requestJson(path, { method: 'POST', body })
  } catch (err) {
    if (err?.notFound) {
      throw new Error('恢复功能需服务端 backup API，请升级并重启 API 服务后重试')
    }
    throw err
  }
}

export async function fetchBackupSettings() {
  if (await checkServerBackupApi()) {
    const data = await requestJson('/api/admin-legacy/novels-backup/settings')
    return data?.settings || DEFAULT_SETTINGS
  }
  return readLocalSettings()
}

export async function saveBackupSettings(settings) {
  if (await checkServerBackupApi()) {
    const data = await requestJson('/api/admin-legacy/novels-backup/settings', {
      method: 'PUT',
      body: settings,
    })
    return data?.settings || settings
  }
  const next = {
    ...readLocalSettings(),
    autoEnabled: settings?.autoEnabled === true,
    intervalHours: Math.max(1, Number(settings?.intervalHours) || 24),
  }
  writeLocalSettings(next)
  return next
}

export async function fetchBackupHistory() {
  if (await checkServerBackupApi()) {
    const data = await requestJson('/api/admin-legacy/novels-backups')
    return Array.isArray(data?.items) ? data.items : []
  }
  return readLocalHistoryMeta()
}

export async function createManualBackup() {
  if (await checkServerBackupApi()) {
    const data = await requestJson('/api/admin-legacy/novels-backups', { method: 'POST' })
    return data?.item
  }
  return createClientBackupEntry({ kind: 'manual' })
}

export async function downloadLiveExport(format = 'json') {
  if (await checkServerBackupApi()) {
    try {
      return await downloadFile(`/api/admin-legacy/novels-backup/export?format=${format}`)
    } catch (err) {
      if (!err?.notFound) throw err
      serverBackupReady = false
    }
  }
  await exportAllNovelsBackup({ format })
}

export async function downloadBackupVersion(id, format = 'json') {
  if (await checkServerBackupApi()) {
    try {
      return await downloadFile(
        `/api/admin-legacy/novels-backups/${encodeURIComponent(id)}/download?format=${format}`,
      )
    } catch (err) {
      if (!err?.notFound) throw err
    }
  }

  const payload = await idbGetBackup(id)
  if (!payload) {
    throw new Error('未找到该备份版本（本地缓存可能已清除）')
  }
  await downloadBackupPayload(payload, format)
}

export async function restoreBackupVersion(id) {
  if (await checkServerBackupApi()) {
    return requestJson(`/api/admin-legacy/novels-backups/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    })
  }

  const payload = await idbGetBackup(id)
  if (!payload) {
    throw new Error('未找到该备份版本（本地缓存可能已清除）')
  }
  return restoreViaServer('/api/admin-legacy/novels-backups/restore', payload)
}

export async function restoreBackupUpload(payload) {
  return restoreViaServer('/api/admin-legacy/novels-backups/restore', payload)
}
