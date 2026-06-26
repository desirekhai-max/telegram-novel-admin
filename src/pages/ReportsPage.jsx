import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminReports,
  formatAdminReportTime,
  getApiOriginLabel,
  patchAdminReportStatus,
  resolveReportAvatarUrl,
  resolveReportScreenshotUrl,
} from '../lib/reportsApi.js'

const PAGE_SIZE = 50
const AUTO_REFRESH_MS = 30 * 1000

const STATUS_LABELS = {
  pending: '待处理',
  processed: '已处理',
  ignored: '忽略',
}

const EMPTY_FILTERS = {
  status: '',
  keyword: '',
}

function createDefaultInputFilters() {
  return { ...EMPTY_FILTERS }
}

function truncateText(text, max = 48) {
  const value = String(text || '').trim()
  if (!value) return '—'
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

function shouldShowError(message) {
  const text = String(message || '').trim().toLowerCase()
  return text && text !== 'not found'
}

function ReportStatusBadge({ status }) {
  const normalized = STATUS_LABELS[status] ? status : 'pending'
  const className =
    normalized === 'processed'
      ? 'admin-report-status--processed'
      : normalized === 'ignored'
        ? 'admin-report-status--ignored'
        : 'admin-report-status--pending'
  return (
    <span className={`admin-report-status ${className}`.trim()}>
      {STATUS_LABELS[normalized] || '待处理'}
    </span>
  )
}

function rowKey(row) {
  return `${row.novelId || 'novel'}-${row.id || row.at || 'report'}`
}

export default function ReportsPage() {
  const [inputFilters, setInputFilters] = useState(createDefaultInputFilters)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [lastFetchedAt, setLastFetchedAt] = useState(0)
  const [updatingKey, setUpdatingKey] = useState('')
  const [selectedReport, setSelectedReport] = useState(null)
  const [screenshotPreview, setScreenshotPreview] = useState(null)

  const loadReports = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const items = await fetchAdminReports()
      setRows(items)
      setLastFetchedAt(Date.now())
    } catch (err) {
      setRows([])
      setError(err?.message || '举报记录加载失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadReports()
    const timer = window.setInterval(() => loadReports({ showLoading: false }), AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [loadReports])

  useEffect(() => {
    if (!selectedReport && !screenshotPreview) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedReport(null)
        setScreenshotPreview(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedReport, screenshotPreview])

  const filteredRows = useMemo(() => {
    const keyword = String(appliedFilters.keyword || '').trim().toLowerCase()
    const status = String(appliedFilters.status || '').trim()
    return rows.filter((row) => {
      if (status && String(row.status || 'pending') !== status) return false
      if (!keyword) return true
      const haystack = [
        row.userName,
        row.novelTitle,
        row.chapterTitle,
        row.reason,
        row.text,
        row.novelId,
        row.userId,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return haystack.includes(keyword)
    })
  }, [rows, appliedFilters])

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

  const onQuery = () => setAppliedFilters({ ...inputFilters })
  const onReset = () => {
    setInputFilters(createDefaultInputFilters())
    setAppliedFilters(EMPTY_FILTERS)
  }

  const patchRow = (item) => {
    if (!item?.id) return
    setRows((prev) =>
      prev.map((row) => (rowKey(row) === rowKey(item) ? { ...row, ...item } : row)),
    )
    setSelectedReport((prev) => (prev && rowKey(prev) === rowKey(item) ? { ...prev, ...item } : prev))
  }

  const onUpdateStatus = async (row, status) => {
    const key = rowKey(row)
    if (updatingKey === key) return
    setUpdatingKey(key)
    setError('')
    try {
      const item = await patchAdminReportStatus({
        novelId: row.novelId,
        reportId: row.id,
        status,
      })
      if (item) patchRow(item)
    } catch (err) {
      setError(err?.message || '状态更新失败')
    } finally {
      setUpdatingKey('')
    }
  }

  const openScreenshot = (row) => {
    const src = resolveReportScreenshotUrl(row.screenshotUrl)
    if (!src) return
    setScreenshotPreview({ src, title: `${row.novelTitle || '举报'} · 截图` })
  }

  const listMeta = useMemo(() => {
    const origin = `数据源 ${getApiOriginLabel()}`
    if (refreshing) return `${origin} · 正在同步举报数据…`
    if (lastFetchedAt > 0) {
      const time = new Date(lastFetchedAt).toLocaleTimeString('zh-CN', { hour12: false })
      return `${origin} · 共 ${total} 条 · 已同步 ${time} · 每 30 秒自动刷新`
    }
    return `${origin} · 共 ${total} 条 · 每 30 秒自动刷新`
  }, [refreshing, lastFetchedAt, total])

  return (
    <section className="admin-panel admin-reports-mgmt">
      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}

      <p className="admin-novel-mgmt-meta">{listMeta}</p>

      <div className="admin-reading-mgmt-toolbar">
        <div className="admin-reading-mgmt-filters admin-reports-mgmt-filters">
          <label className="admin-reading-mgmt-field admin-reports-mgmt-field--status">
            <span>状态</span>
            <select
              value={inputFilters.status}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="pending">待处理</option>
              <option value="processed">已处理</option>
              <option value="ignored">忽略</option>
            </select>
          </label>
          <label className="admin-reading-mgmt-field admin-reports-mgmt-field--keyword">
            <span>关键词</span>
            <input
              value={inputFilters.keyword}
              placeholder="举报人 / 小说 / 章节 / 原因"
              onChange={(e) => setInputFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            />
          </label>
        </div>
        <div className="admin-reading-mgmt-actions">
          <button className="admin-btn admin-btn-primary" type="button" onClick={onQuery}>
            查询
          </button>
          <button className="admin-btn" type="button" onClick={onReset}>
            重置
          </button>
          <button
            className="admin-btn"
            type="button"
            onClick={() => loadReports({ showLoading: false })}
            disabled={loading || refreshing}
          >
            {loading || refreshing ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-reports-mgmt-table">
          <thead>
            <tr>
              <th>举报人</th>
              <th>小说</th>
              <th>章节</th>
              <th>原因</th>
              <th>时间</th>
              <th>状态</th>
              <th className="admin-reports-mgmt-actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length ? (
              pagedRows.map((row) => {
                const key = rowKey(row)
                const busy = updatingKey === key
                const screenshotSrc = resolveReportScreenshotUrl(row.screenshotUrl)
                const avatarSrc = resolveReportAvatarUrl(row.userAvatar)
                const status = row.status || 'pending'
                return (
                  <tr key={key}>
                    <td>
                      <div className="admin-reports-mgmt-user">
                        {avatarSrc ? (
                          <img className="admin-reports-mgmt-avatar" src={avatarSrc} alt="" />
                        ) : (
                          <span className="admin-reports-mgmt-avatar admin-reports-mgmt-avatar--fallback">
                            {(row.userName || '匿').slice(0, 1)}
                          </span>
                        )}
                        <div>
                          <div className="admin-reports-mgmt-user-name">{row.userName || '匿名'}</div>
                          {row.userId ? (
                            <Link
                              className="admin-reports-mgmt-user-sub"
                              to={`/admin/account?tgId=${encodeURIComponent(row.userId)}&from=id`}
                            >
                              TG {row.userId}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="admin-reports-mgmt-novel">{row.novelTitle || row.novelId || '—'}</td>
                    <td className="admin-reports-mgmt-chapter">{row.chapterTitle || '—'}</td>
                    <td className="admin-reports-mgmt-reason">
                      <button
                        className="admin-reports-mgmt-reason-btn"
                        type="button"
                        onClick={() => setSelectedReport(row)}
                        title="查看完整原因"
                      >
                        {truncateText(row.reason || row.text)}
                      </button>
                    </td>
                    <td>{formatAdminReportTime(row.at)}</td>
                    <td>
                      <ReportStatusBadge status={status} />
                    </td>
                    <td className="admin-reports-mgmt-actions-col">
                      <div className="admin-reports-mgmt-action-group">
                        {screenshotSrc ? (
                          <button
                            className="admin-btn admin-reports-mgmt-shot-btn"
                            type="button"
                            onClick={() => openScreenshot(row)}
                          >
                            截图
                          </button>
                        ) : null}
                        <button
                          className="admin-btn admin-reports-mgmt-status-btn"
                          type="button"
                          disabled={busy || status === 'pending'}
                          onClick={() => onUpdateStatus(row, 'pending')}
                        >
                          待处理
                        </button>
                        <button
                          className="admin-btn admin-btn-primary admin-reports-mgmt-status-btn"
                          type="button"
                          disabled={busy || status === 'processed'}
                          onClick={() => onUpdateStatus(row, 'processed')}
                        >
                          已处理
                        </button>
                        <button
                          className="admin-btn admin-reports-mgmt-status-btn"
                          type="button"
                          disabled={busy || status === 'ignored'}
                          onClick={() => onUpdateStatus(row, 'ignored')}
                        >
                          忽略
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  {loading ? '加载中…' : '暂无举报记录'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination-row">
        <p className="admin-pagination-meta">共 {total} 条记录</p>
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
          <div className="admin-modal-card admin-modal-card--report" onClick={(e) => e.stopPropagation()}>
            <p className="admin-modal-title" id="admin-report-detail-title">
              举报详情
            </p>
            <dl className="admin-report-detail-meta">
              <div>
                <dt>举报人</dt>
                <dd>{selectedReport.userName || '匿名'}</dd>
              </div>
              <div>
                <dt>小说</dt>
                <dd>{selectedReport.novelTitle || selectedReport.novelId || '—'}</dd>
              </div>
              <div>
                <dt>章节</dt>
                <dd>{selectedReport.chapterTitle || '—'}</dd>
              </div>
              <div>
                <dt>时间</dt>
                <dd>{formatAdminReportTime(selectedReport.at)}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  <ReportStatusBadge status={selectedReport.status || 'pending'} />
                </dd>
              </div>
            </dl>
            <p className="admin-report-detail-label">原因</p>
            <div className="admin-report-detail-body">
              {String(selectedReport.reason || selectedReport.text || '').trim() || '—'}
            </div>
            {resolveReportScreenshotUrl(selectedReport.screenshotUrl) ? (
              <>
                <p className="admin-report-detail-label">截图</p>
                <button
                  type="button"
                  className="admin-reports-mgmt-screenshot-thumb"
                  onClick={() => openScreenshot(selectedReport)}
                >
                  <img
                    src={resolveReportScreenshotUrl(selectedReport.screenshotUrl)}
                    alt="举报截图"
                  />
                </button>
              </>
            ) : null}
            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-primary" type="button" onClick={() => setSelectedReport(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {screenshotPreview ? (
        <div
          className="admin-modal-backdrop admin-reports-mgmt-screenshot-modal"
          role="dialog"
          aria-modal="true"
          aria-label="举报截图预览"
          onClick={() => setScreenshotPreview(null)}
        >
          <div className="admin-reports-mgmt-screenshot-panel" onClick={(e) => e.stopPropagation()}>
            <p className="admin-modal-title">{screenshotPreview.title}</p>
            <img className="admin-reports-mgmt-screenshot-full" src={screenshotPreview.src} alt="举报截图" />
            <div className="admin-modal-actions">
              <a
                className="admin-btn"
                href={screenshotPreview.src}
                target="_blank"
                rel="noopener noreferrer"
              >
                新标签打开
              </a>
              <button className="admin-btn admin-btn-primary" type="button" onClick={() => setScreenshotPreview(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
