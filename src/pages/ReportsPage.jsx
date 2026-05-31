import { useEffect, useMemo, useState } from 'react'
import { fetchReports } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'
import { getSettlementDateString } from '../lib/cambodiaTime.js'

const REPORT_PREVIEW_LENGTH = 30
const PAGE_SIZE = 50

const DEFAULT_FROM = `${getSettlementDateString(0)} 09:00:00`
const DEFAULT_TO = `${getSettlementDateString(1)} 09:00:00`

function createDefaultInputFilters() {
  return {
    novelTitle: '',
    novelId: '',
    userName: '',
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
  }
}

const EMPTY_APPLIED_FILTERS = {
  novelTitle: '',
  novelId: '',
  userName: '',
  from: '',
  to: '',
}

const EXPORT_COLUMNS = [
  { title: '举报时间', getValue: (row) => formatReportTime(row.at) },
  { title: '小说ID', getValue: (row) => row.novelId || '-' },
  { title: '小说标题', getValue: (row) => row.novelTitle || '-' },
  { title: '举报用户', getValue: (row) => row.userName || '匿名' },
  { title: '举报内容', getValue: (row) => String(row.text || '').trim() || '-' },
]

function formatReportTime(at) {
  const ms = Number(at)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

function truncateReportText(text, maxLength = REPORT_PREVIEW_LENGTH) {
  const value = String(text || '').trim()
  if (!value) return '—'
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

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

function matchNovelId(rowId, filterId) {
  const key = String(filterId || '').trim()
  if (!key) return true
  return String(rowId || '').trim() === key
}

function filterRows(rows, filters) {
  const fromMs = parseDateTimeMs(filters.from)
  const toMs = parseDateTimeMs(filters.to)

  return rows.filter((row) => {
    if (!includesText(row.novelTitle, filters.novelTitle)) return false
    if (!matchNovelId(row.novelId, filters.novelId)) return false
    if (!includesText(row.userName, filters.userName)) return false

    const rowMs = Number(row.at)
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

export default function ReportsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [inputFilters, setInputFilters] = useState(createDefaultInputFilters)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_APPLIED_FILTERS)
  const [linkRefreshFlash, setLinkRefreshFlash] = useState(false)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [selectedReport, setSelectedReport] = useState(null)

  useEffect(() => {
    let stop = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const items = await fetchReports({ token: getToken() })
        if (!stop) setRows(items)
      } catch (err) {
        if (!stop) {
          setRows([])
          setError(err?.message || '举报记录加载失败')
        }
      } finally {
        if (!stop) setLoading(false)
      }
    }

    load()
    const timer = window.setInterval(load, 30 * 1000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!selectedReport) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedReport(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedReport])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0))
  }, [rows])

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
    downloadCsv('举报记录.csv', toCsv(filteredRows))
  }

  return (
    <section className="admin-panel">
      {linkRefreshFlash ? <div className="admin-link-refresh-flash" /> : null}
      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}

      <div className="admin-reports-filter-bar">
        <label className="admin-reports-field admin-reports-field--title">
          小说标题
          <input
            value={inputFilters.novelTitle}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, novelTitle: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field admin-reports-field--id">
          小说 ID
          <input
            value={inputFilters.novelId}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, novelId: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field admin-reports-field--user">
          举报用户
          <input
            value={inputFilters.userName}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, userName: e.target.value }))}
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
              <th>举报时间</th>
              <th>小说 ID</th>
              <th>小说标题</th>
              <th>举报用户</th>
              <th>举报内容</th>
              <th className="admin-reports-action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length ? (
              pagedRows.map((row, idx) => (
                <tr key={`${row.id || row.at || 'report'}-${idx}`}>
                  <td>{formatReportTime(row.at)}</td>
                  <td>{row.novelId || '—'}</td>
                  <td className="admin-report-title-cell">{row.novelTitle || '—'}</td>
                  <td>{row.userName || '匿名'}</td>
                  <td className="admin-report-content-cell">{truncateReportText(row.text)}</td>
                  <td className="admin-reports-action-col">
                    <button
                      className="admin-btn admin-report-view-btn"
                      type="button"
                      onClick={() => setSelectedReport(row)}
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  {loading ? '加载中...' : '暂无举报记录'}
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

      {selectedReport ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-report-detail-title"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="admin-modal-card admin-modal-card--report"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="admin-modal-title" id="admin-report-detail-title">
              举报详情
            </p>
            <dl className="admin-report-detail-meta">
              <div>
                <dt>举报时间</dt>
                <dd>{formatReportTime(selectedReport.at)}</dd>
              </div>
              <div>
                <dt>小说 ID</dt>
                <dd>{selectedReport.novelId || '—'}</dd>
              </div>
              <div>
                <dt>小说标题</dt>
                <dd>{selectedReport.novelTitle || '—'}</dd>
              </div>
              <div>
                <dt>举报用户</dt>
                <dd>{selectedReport.userName || '匿名'}</dd>
              </div>
            </dl>
            <p className="admin-report-detail-label">举报内容</p>
            <div className="admin-report-detail-body">
              {String(selectedReport.text || '').trim() || '—'}
            </div>
            <div className="admin-modal-actions">
              <button
                className="admin-btn admin-btn-primary"
                type="button"
                onClick={() => setSelectedReport(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
