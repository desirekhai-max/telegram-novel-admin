import { useEffect, useMemo, useState } from 'react'
import { fetchReports } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'

const REPORT_PREVIEW_LENGTH = 30

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

function shouldShowError(message) {
  const text = String(message || '').trim().toLowerCase()
  return text && text !== 'not found'
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
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

  const pageSize = 50
  const total = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage])

  const clampPage = (n) => Math.min(totalPages, Math.max(1, Number(n) || 1))
  const applyPageInput = () => {
    const next = clampPage(pageInput)
    setPage(next)
    setPageInput(String(next))
  }

  return (
    <section className="admin-panel">
      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}

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
