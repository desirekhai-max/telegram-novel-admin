import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'
import { getApiOriginLabel } from '../lib/apiBase.js'
import { DEVICE_MISSING_REASON_ALL, fetchAdminReadingRecords, isLegacyUnauthorizedMessage } from '../lib/readingRecordsApi.js'
import { readReadingRecordsCache, writeReadingRecordsCache } from '../lib/readingRecordsCache.js'
import {
  clearLegacyToken,
  getLegacyToken,
  getToken,
  refreshLegacyTokenFromAdminSession,
} from '../lib/adminAuth.js'

const AUTO_REFRESH_MS = 10 * 1000

function createDefaultInputFilters() {
  return {
    user: '',
    novelTitle: '',
    device: '',
    from: '',
    to: '',
  }
}

const EMPTY_APPLIED_FILTERS = {
  user: '',
  novelTitle: '',
  device: '',
  from: '',
  to: '',
}

const EXPORT_COLUMNS = [
  { title: '用户', getValue: (row) => formatUserPrimary(row) },
  { title: '小说', getValue: (row) => row.shelfTitle || '—' },
  { title: '章节', getValue: (row) => row.readChapter || '—' },
  { title: '记录时间', getValue: (row) => row.readAt || '—' },
  { title: '设备', getValue: (row) => row.device || '—' },
  { title: 'IP', getValue: (row) => row.ip || '—' },
]

const LEGACY_UNAVAILABLE_MESSAGE =
  'Legacy 登录已过期（服务端重启后需重新登录）。请点击下方按钮重新登录。'

const LEGACY_EXPIRED_MESSAGE =
  'Legacy 登录已过期（常见于 Railway 部署重启后）。请重新登录；若仍失败请稍等部署完成后再试。'

function deviceRowClass(device) {
  const d = String(device || '').toLowerCase()
  if (d === 'android') return ' is-android'
  if (d === 'ios') return ' is-ios'
  if (d === 'web' || d === '电脑') return ' is-web'
  return ''
}

function parseDateTimeMs(value) {
  const text = String(value || '').trim()
  if (!text) return NaN
  const isoLike = text.includes('T') ? text : text.replace(' ', 'T')
  const fromDate = Date.parse(isoLike)
  if (Number.isFinite(fromDate)) return fromDate
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!matched) return NaN
  const [, y, m, d, hh = '0', mm = '0', ss = '0'] = matched
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime()
}

function includesText(source, keyword) {
  const key = String(keyword || '').trim().toLowerCase()
  if (!key) return true
  return String(source || '').toLowerCase().includes(key)
}

function formatUserPrimary(row) {
  const name = String(row.memberName || '').trim()
  const account = String(row.memberAccount || row.username || row.account || '').trim()
  const id = String(row.memberId || '').trim()
  if (name) return name
  if (account) return account
  if (id) return id
  return '—'
}

function formatUserSub(row) {
  const account = String(row.memberAccount || row.username || row.account || '').trim()
  const id = String(row.memberId || '').trim()
  const parts = []
  if (account) parts.push(account)
  if (id) parts.push(`ID ${id}`)
  return parts.join(' · ')
}

function filterRows(rows, filters) {
  const fromMs = parseDateTimeMs(filters.from)
  const toMs = parseDateTimeMs(filters.to)

  return rows.filter((row) => {
    const userHay = [
      row.memberName,
      row.memberId,
      row.memberAccount,
      row.username,
      row.account,
    ].join(' ')
    if (!includesText(userHay, filters.user)) return false
    if (!includesText(row.shelfTitle, filters.novelTitle)) return false
    if (!includesText(row.device, filters.device)) return false

    const rowMs = Number(row.ts) || parseDateTimeMs(row.readAt)
    if (Number.isFinite(fromMs) && Number.isFinite(rowMs) && rowMs < fromMs) return false
    if (Number.isFinite(toMs) && Number.isFinite(rowMs)) {
      const toInclusive = String(filters.to || '').includes('T') ? toMs + 59_999 : toMs
      if (rowMs > toInclusive) return false
    }
    return true
  })
}

function toCsv(rows) {
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const head = EXPORT_COLUMNS.map((c) => c.title).join(',')
  const lines = rows.map((row) => EXPORT_COLUMNS.map((c) => escapeCell(c.getValue(row))).join(','))
  return [head, ...lines].join('\n')
}

function downloadCsv(filename, content) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function shouldShowError(message) {
  const text = String(message || '').trim().toLowerCase()
  return text && text !== 'not found'
}

function rowKey(row, idx) {
  return `${row.memberId || 'u'}-${row.ts || idx}-${row.shelfTitle || ''}-${row.readChapter || ''}`
}

export default function ReadingListsPage() {
  const initialCache = useMemo(() => readReadingRecordsCache(), [])
  const [hasLegacyToken, setHasLegacyToken] = useState(() => Boolean(getLegacyToken() || getToken()))
  const [legacyExpired, setLegacyExpired] = useState(false)
  const [inputFilters, setInputFilters] = useState(createDefaultInputFilters)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_APPLIED_FILTERS)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState(() => Number(initialCache?.savedAt) || 0)
  const [loading, setLoading] = useState(() => !initialCache?.rows?.length)
  const [error, setError] = useState('')
  const [records, setRecords] = useState(() => initialCache?.rows || [])
  const [showDeviceHint, setShowDeviceHint] = useState(() => Boolean(initialCache?.showDeviceHint))
  const [deviceHintMessage, setDeviceHintMessage] = useState(() => initialCache?.deviceHintMessage || '')
  const [deviceResolvedCount, setDeviceResolvedCount] = useState(() => Number(initialCache?.deviceResolvedCount) || 0)
  const stopRef = useRef(false)

  const loadRecords = useCallback(async ({ showLoading = true } = {}) => {
    if (!getLegacyToken() && !getToken()) return false

    if (showLoading) setLoading(true)
    setError('')
    try {
      const refreshed = await refreshLegacyTokenFromAdminSession()
      if (refreshed) {
        setHasLegacyToken(true)
        setLegacyExpired(false)
      }

      const result = await fetchAdminReadingRecords()
      if (!stopRef.current) {
        setRecords(result.rows)
        setShowDeviceHint(result.showDeviceHint)
        setDeviceHintMessage(result.deviceHintMessage || '')
        setDeviceResolvedCount(result.deviceResolvedCount || 0)
        setLastFetchedAt(Date.now())
        setLegacyExpired(false)
        setHasLegacyToken(true)
        writeReadingRecordsCache(result)
      }
      return true
    } catch (err) {
      if (!stopRef.current) {
        const message = err?.message || '读取阅读管理数据失败'
        if (isLegacyUnauthorizedMessage(message)) {
          clearLegacyToken()
          if (getToken()) {
            try {
              const result = await fetchAdminReadingRecords()
              if (!stopRef.current) {
                setRecords(result.rows)
                setShowDeviceHint(result.showDeviceHint)
                setDeviceHintMessage(result.deviceHintMessage || '')
                setDeviceResolvedCount(result.deviceResolvedCount || 0)
                setLastFetchedAt(Date.now())
                setLegacyExpired(false)
                setHasLegacyToken(true)
                setError('')
                writeReadingRecordsCache(result)
              }
              return true
            } catch (retryErr) {
              if (!stopRef.current) {
                setHasLegacyToken(false)
                setLegacyExpired(true)
                setRecords([])
                setError('')
              }
              return false
            }
          }
          setHasLegacyToken(false)
          setLegacyExpired(true)
          setRecords([])
          setError('')
        } else {
          setError(message)
        }
      }
      return false
    } finally {
      if (!stopRef.current && showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasLegacyToken) return undefined

    stopRef.current = false
    loadRecords()

    const timer = window.setInterval(() => {
      loadRecords({ showLoading: false })
    }, AUTO_REFRESH_MS)

    return () => {
      stopRef.current = true
      window.clearInterval(timer)
    }
  }, [hasLegacyToken, loadRecords])

  const sortedRows = useMemo(() => {
    return [...records].sort((a, b) => {
      const aMs = Number(a.ts) || parseDateTimeMs(a.readAt)
      const bMs = Number(b.ts) || parseDateTimeMs(b.readAt)
      return bMs - aMs
    })
  }, [records])

  const filteredRows = useMemo(
    () => filterRows(sortedRows, appliedFilters),
    [sortedRows, appliedFilters],
  )

  const total = filteredRows.length

  const onQuery = async () => {
    setAppliedFilters({ ...inputFilters })
    setRefreshing(true)
    await loadRecords({ showLoading: false })
    if (!stopRef.current) setRefreshing(false)
  }

  const onReset = async () => {
    setInputFilters(createDefaultInputFilters())
    setAppliedFilters(EMPTY_APPLIED_FILTERS)
    setRefreshing(true)
    await loadRecords({ showLoading: false })
    if (!stopRef.current) setRefreshing(false)
  }

  const onExport = () => {
    downloadCsv('阅读管理.csv', toCsv(filteredRows))
  }

  const listMeta = useMemo(() => {
    const origin = `数据源 ${getApiOriginLabel()}`
    const deviceMeta =
      records.length > 0 ? ` · 设备已识别 ${deviceResolvedCount}/${records.length}` : ''
    if (refreshing) return `${origin} · 正在同步最新阅读记录…`
    if (lastFetchedAt > 0) {
      const time = new Date(lastFetchedAt).toLocaleTimeString('zh-CN', { hour12: false })
      return `${origin}${deviceMeta} · 共 ${total} 条 · 每用户每本小说保留最新一条 · 已同步 ${time} · 每 10 秒自动刷新`
    }
    return `${origin}${deviceMeta} · 共 ${total} 条 · 每用户每本小说保留最新一条 · 每 10 秒自动刷新`
  }, [refreshing, lastFetchedAt, total, records.length, deviceResolvedCount])

  if (!hasLegacyToken || legacyExpired) {
    return (
      <section className="admin-reading-mgmt">
        <LegacyRequiredNotice
          message={legacyExpired ? LEGACY_EXPIRED_MESSAGE : LEGACY_UNAVAILABLE_MESSAGE}
        />
      </section>
    )
  }

  return (
    <section className="admin-reading-mgmt">
      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}
      {showDeviceHint ? <p className="admin-reading-mgmt-device-hint">{deviceHintMessage}</p> : null}

      <div className="admin-reading-mgmt-toolbar">
        <div className="admin-reading-mgmt-filters">
          <label className="admin-reading-mgmt-field admin-reading-mgmt-field--user">
            <span>用户</span>
            <input
              value={inputFilters.user}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, user: e.target.value }))}
              placeholder="昵称 / ID / 账号"
            />
          </label>
          <label className="admin-reading-mgmt-field admin-reading-mgmt-field--novel">
            <span>小说</span>
            <input
              value={inputFilters.novelTitle}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, novelTitle: e.target.value }))}
              placeholder="小说标题"
            />
          </label>
          <label className="admin-reading-mgmt-field admin-reading-mgmt-field--device">
            <span>设备</span>
            <select
              value={inputFilters.device}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, device: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="Android">Android</option>
              <option value="iOS">iOS</option>
              <option value="电脑">电脑</option>
            </select>
          </label>
          <label className="admin-reading-mgmt-field admin-reading-mgmt-field--time">
            <span>开始时间</span>
            <input
              type="datetime-local"
              value={inputFilters.from}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, from: e.target.value }))}
            />
          </label>
          <label className="admin-reading-mgmt-field admin-reading-mgmt-field--time">
            <span>结束时间</span>
            <input
              type="datetime-local"
              value={inputFilters.to}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, to: e.target.value }))}
            />
          </label>
        </div>
        <div className="admin-reading-mgmt-actions">
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            disabled={refreshing}
            onClick={onQuery}
          >
            {refreshing ? '查询中…' : '查询'}
          </button>
          <button className="admin-btn" type="button" disabled={refreshing} onClick={onReset}>
            重置
          </button>
          <button className="admin-btn admin-btn-primary" type="button" onClick={onExport}>
            导出
          </button>
        </div>
      </div>

      <div className={`admin-novel-mgmt-table-card${refreshing ? ' is-refreshing' : ''}`}>
        <div className="admin-novel-mgmt-table-head">
          <h3>阅读管理</h3>
          <span className="admin-novel-mgmt-meta">{listMeta}</span>
        </div>
        <div className="admin-table-wrap admin-novel-mgmt-table-wrap">
          <table className="admin-table admin-novel-mgmt-table admin-reading-mgmt-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>小说</th>
                <th>章节</th>
                <th>记录时间</th>
                <th>设备</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row, idx) => {
                  const userSub = formatUserSub(row)
                  return (
                    <tr key={rowKey(row, idx)}>
                      <td className="admin-reading-mgmt-user">
                        <span className="admin-reading-mgmt-user-name">{formatUserPrimary(row)}</span>
                        {userSub ? <span className="admin-reading-mgmt-user-sub">{userSub}</span> : null}
                      </td>
                      <td className="admin-reading-mgmt-novel">{row.shelfTitle || '—'}</td>
                      <td className="admin-reading-mgmt-chapter">{row.readChapter || '—'}</td>
                      <td className="admin-novel-mgmt-time">{row.readAt || '—'}</td>
                      <td>
                        <span
                          className={`admin-reading-mgmt-device${deviceRowClass(row.device)}`}
                          title={row.device === '—' ? deviceHintMessage || DEVICE_MISSING_REASON_ALL : undefined}
                        >
                          {row.device || '—'}
                        </span>
                      </td>
                      <td className="admin-reading-mgmt-ip" title={row.ip && row.ip !== '—' ? row.ip : undefined}>
                        {row.ip || '—'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    {loading || refreshing ? '加载中...' : '暂无记录'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
