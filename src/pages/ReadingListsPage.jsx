import { useEffect, useMemo, useState } from 'react'
import { fetchReadingRecords } from '../lib/adminApi.js'
import { getLegacyToken } from '../lib/adminAuth.js'
import { getSettlementDateString } from '../lib/cambodiaTime.js'

const PAGE_SIZE = 50
const DEFAULT_FROM = `${getSettlementDateString(0)} 09:00:00`
const DEFAULT_TO = `${getSettlementDateString(1)} 09:00:00`

function createDefaultInputFilters() {
  return {
    memberName: '',
    memberAccount: '',
    novelTitle: '',
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
  }
}

const EMPTY_APPLIED_FILTERS = {
  memberName: '',
  memberAccount: '',
  novelTitle: '',
  from: '',
  to: '',
}

const EXPORT_COLUMNS = [
  { title: '阅读时间', getValue: (row) => row.readAt || '-' },
  { title: '会员名称', getValue: (row) => row.memberName || '-' },
  { title: '会员ID', getValue: (row) => row.memberId || '-' },
  { title: '会员账号', getValue: (row) => row.memberAccount || row.username || row.account || '-' },
  { title: '会员等级', getValue: (row) => row.memberLevel || '-' },
  { title: '小说标题', getValue: (row) => row.shelfTitle || '-' },
  { title: '阅读章节', getValue: (row) => row.readChapter || '-' },
]

const LEGACY_UNAVAILABLE_MESSAGE = '阅读记录暂不可用，请联系管理员'

function parseDateTimeMs(value) {
  const text = String(value || '').trim()
  if (!text) return NaN
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/)
  if (!matched) return NaN
  const [, y, m, d, hh = '0', mm = '0', ss = '0'] = matched
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime()
}

function includesText(source, keyword) {
  const key = String(keyword || '').trim().toLowerCase()
  if (!key) return true
  return String(source || '').toLowerCase().includes(key)
}

function filterRows(rows, filters) {
  const fromMs = parseDateTimeMs(filters.from)
  const toMs = parseDateTimeMs(filters.to)

  return rows.filter((row) => {
    if (!includesText(row.memberName, filters.memberName)) return false
    if (!includesText(row.memberAccount || row.username || row.account, filters.memberAccount)) return false
    if (!includesText(row.shelfTitle, filters.novelTitle)) return false

    const rowMs = Number(row.ts) || parseDateTimeMs(row.readAt)
    if (Number.isFinite(fromMs) && Number.isFinite(rowMs) && rowMs < fromMs) return false
    if (Number.isFinite(toMs) && Number.isFinite(rowMs) && rowMs > toMs) return false
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

export default function ReadingListsPage() {
  const hasLegacyToken = Boolean(getLegacyToken())
  const [inputFilters, setInputFilters] = useState(createDefaultInputFilters)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_APPLIED_FILTERS)
  const [linkRefreshFlash, setLinkRefreshFlash] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [records, setRecords] = useState([])
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')

  useEffect(() => {
    if (!hasLegacyToken) return undefined

    let stop = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const rows = await fetchReadingRecords({ token: getLegacyToken() })
        if (!stop) setRecords(rows)
      } catch (err) {
        if (!stop) setError(err?.message || '读取阅读记录失败')
      } finally {
        if (!stop) setLoading(false)
      }
    }
    load()
    const timer = window.setInterval(load, 15 * 1000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [hasLegacyToken])

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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, currentPage])

  useEffect(() => {
    setPage(1)
    setPageInput('1')
  }, [appliedFilters])

  const clampPage = (n) => Math.min(totalPages, Math.max(1, Number(n) || 1))
  const applyPageInput = () => {
    const next = clampPage(pageInput)
    setPage(next)
    setPageInput(String(next))
  }

  const onQuery = () => {
    setLinkRefreshFlash(true)
    window.setTimeout(() => setLinkRefreshFlash(false), 140)
    setAppliedFilters({ ...inputFilters })
  }

  const onReset = () => {
    setInputFilters(createDefaultInputFilters())
    setAppliedFilters(EMPTY_APPLIED_FILTERS)
  }

  const onExport = () => {
    downloadCsv('阅读记录.csv', toCsv(filteredRows))
  }

  if (!hasLegacyToken) {
    return (
      <section className="admin-panel">
        <div className="admin-placeholder">
          <h3>阅读记录</h3>
          <p>{LEGACY_UNAVAILABLE_MESSAGE}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="admin-panel">
      {linkRefreshFlash ? <div className="admin-link-refresh-flash" /> : null}
      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}

      <div className="admin-reports-filter-bar">
        <label className="admin-reports-field admin-reports-field--title">
          会员名称
          <input
            value={inputFilters.memberName}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, memberName: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field admin-reports-field--user">
          会员账号
          <input
            value={inputFilters.memberAccount}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, memberAccount: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field admin-reports-field--title">
          小说标题
          <input
            value={inputFilters.novelTitle}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, novelTitle: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field admin-reports-field--datetime">
          开始日期时间
          <input
            value={inputFilters.from}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, from: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field admin-reports-field--datetime">
          结束日期时间
          <input
            value={inputFilters.to}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, to: e.target.value }))}
          />
        </label>
        <div className="admin-reports-filter-actions">
          <button className="admin-btn admin-btn-primary admin-reports-action-btn" type="button" onClick={onQuery}>
            查询
          </button>
          <button className="admin-btn admin-reports-action-btn" type="button" onClick={onReset}>
            重置
          </button>
          <button className="admin-btn admin-btn-primary admin-reports-action-btn" type="button" onClick={onExport}>
            导出
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-reports-table">
          <thead>
            <tr>
              <th>阅读时间</th>
              <th>会员名称</th>
              <th>会员ID</th>
              <th>会员账号</th>
              <th>会员等级</th>
              <th>小说标题</th>
              <th>阅读章节</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length ? (
              pagedRows.map((row, idx) => (
                <tr key={`${row.memberId || row.memberName || 'row'}-${row.ts || idx}`}>
                  <td>{row.readAt || '-'}</td>
                  <td>{row.memberName || '-'}</td>
                  <td>{row.memberId || '-'}</td>
                  <td>{row.memberAccount || row.username || row.account || '-'}</td>
                  <td>{row.memberLevel || '-'}</td>
                  <td className="admin-report-title-cell">{row.shelfTitle || '-'}</td>
                  <td>{row.readChapter || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  {loading ? '加载中...' : '暂无记录'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination-row">
        <p className="admin-pagination-meta">共{total}条记录</p>
        <div className="admin-pagination-controls">
          <span>跳至</span>
          <input
            className="admin-page-input"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            onBlur={applyPageInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyPageInput()
            }}
          />
          <span>页</span>
          <button
            className="admin-page-btn"
            type="button"
            onClick={() => {
              setPage(1)
              setPageInput('1')
            }}
            disabled={currentPage === 1}
          >
            《
          </button>
          <button
            className="admin-page-btn"
            type="button"
            onClick={() => {
              const n = clampPage(currentPage - 1)
              setPage(n)
              setPageInput(String(n))
            }}
            disabled={currentPage === 1}
          >
            ‹
          </button>
          <button className="admin-page-btn admin-page-btn-active" type="button">
            {currentPage}
          </button>
          <button
            className="admin-page-btn"
            type="button"
            onClick={() => {
              const n = clampPage(currentPage + 1)
              setPage(n)
              setPageInput(String(n))
            }}
            disabled={currentPage === totalPages}
          >
            ›
          </button>
          <button
            className="admin-page-btn"
            type="button"
            onClick={() => {
              setPage(totalPages)
              setPageInput(String(totalPages))
            }}
            disabled={currentPage === totalPages}
          >
            》
          </button>
        </div>
      </div>
    </section>
  )
}
