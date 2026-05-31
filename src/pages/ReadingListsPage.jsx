import { useEffect, useMemo, useState } from 'react'
import { fetchReadingRecords } from '../lib/adminApi.js'
import { getLegacyToken } from '../lib/adminAuth.js'
import { getSettlementDateString } from '../lib/cambodiaTime.js'

const DEFAULT_FROM_DATETIME = `${getSettlementDateString(0)} 09:00:00`
const DEFAULT_TO_DATETIME = `${getSettlementDateString(1)} 09:00:00`

const EMPTY_FILTERS = {
  memberName: '',
  memberId: '',
  memberAccount: '',
  memberLevel: '',
  memberOrder: '',
  from: DEFAULT_FROM_DATETIME,
  to: DEFAULT_TO_DATETIME,
  shelfTitle: '',
}

const EXPORT_COLUMNS = [
  { title: '订单信息', getValue: (row) => row.memberOrder || '-' },
  { title: '会员名称', getValue: (row) => row.memberName || '-' },
  { title: '会员ID', getValue: (row) => row.memberId || '-' },
  { title: '会员账号', getValue: (row) => row.memberAccount || row.username || row.account || '-' },
  { title: '会员等级', getValue: (row) => row.memberLevel || '-' },
  { title: '书架题目', getValue: (row) => row.shelfTitle || '-' },
  { title: '阅读章节', getValue: (row) => row.readChapter || '-' },
  { title: '阅读时间', getValue: (row) => row.readAt || '-' },
]

const MEMBER_LEVEL_OPTIONS = [
  { value: '', label: '所有等级' },
  { value: 'vip', label: 'VIP等级' },
  { value: 'normal', label: '普通等级' },
  { value: 'author', label: '作者等级' },
]

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

function matchMemberLevel(rowLevel, filterLevel) {
  const level = String(filterLevel || '').trim().toLowerCase()
  if (!level) return true
  return String(rowLevel || '').toLowerCase().includes(level)
}

function filterRows(rows, filters) {
  const fromMs = parseDateTimeMs(filters.from)
  const toMs = parseDateTimeMs(filters.to)

  return rows.filter((row) => {
    if (!includesText(row.memberName, filters.memberName)) return false
    if (!includesText(row.memberId, filters.memberId)) return false
    if (!includesText(row.memberAccount || row.username || row.account, filters.memberAccount)) return false
    if (!matchMemberLevel(row.memberLevel, filters.memberLevel)) return false
    if (!includesText(row.memberOrder, filters.memberOrder)) return false
    if (!includesText(row.shelfTitle, filters.shelfTitle)) return false

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

const LEGACY_UNAVAILABLE_MESSAGE = '阅读记录暂不可用，请联系管理员'

export default function ReadingListsPage() {
  const hasLegacyToken = Boolean(getLegacyToken())
  const [inputFilters, setInputFilters] = useState(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
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

  const rows = useMemo(() => filterRows(records, appliedFilters), [records, appliedFilters])
  const pageSize = 50
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, currentPage])

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
    if (!hasLegacyToken) return
    setLinkRefreshFlash(true)
    window.setTimeout(() => setLinkRefreshFlash(false), 140)
    setAppliedFilters({ ...inputFilters })
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
      <div className="admin-tools admin-tools-wrap admin-reading-filters-row">
        <label className="admin-label-short">
          会员名称
          <input
            value={inputFilters.memberName}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, memberName: e.target.value }))
            }
          />
        </label>
        <label className="admin-label-short">
          会员ID
          <input
            value={inputFilters.memberId}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, memberId: e.target.value }))
            }
          />
        </label>
        <label className="admin-label-short">
          会员账号
          <input
            value={inputFilters.memberAccount}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, memberAccount: e.target.value }))
            }
          />
        </label>
        <label className="admin-reading-level-field">
          会员等级
          <select
            value={inputFilters.memberLevel}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, memberLevel: e.target.value }))
            }
          >
            {MEMBER_LEVEL_OPTIONS.map((item) => (
              <option key={item.value || 'all'} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          订单信息
          <input
            value={inputFilters.memberOrder}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, memberOrder: e.target.value }))
            }
          />
        </label>
        <label>
          书架题目
          <input
            value={inputFilters.shelfTitle}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, shelfTitle: e.target.value }))
            }
          />
        </label>
        <label>
          开始日期时间
          <input
            value={inputFilters.from}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, from: e.target.value }))}
          />
        </label>
        <label>
          结束日期时间
          <input
            value={inputFilters.to}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, to: e.target.value }))}
          />
        </label>
      </div>

      <div className="admin-tools admin-tools-wrap admin-tools-actions">
        <button
          className="admin-btn admin-btn-primary"
          type="button"
          onClick={onQuery}
        >
          查询
        </button>
        <button
          className="admin-btn"
          type="button"
          onClick={() => {
            setInputFilters(EMPTY_FILTERS)
            setAppliedFilters(EMPTY_FILTERS)
          }}
        >
          重置
        </button>
        <button
          className="admin-btn admin-btn-primary"
          type="button"
          onClick={() => downloadCsv('阅读记录.csv', toCsv(rows))}
        >
          导出表格
        </button>
      </div>

      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>订单信息</th>
              <th>会员名称</th>
              <th>会员ID</th>
              <th>会员账号</th>
              <th>会员等级</th>
              <th>书架题目</th>
              <th>阅读章节</th>
              <th>阅读时间</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length ? (
              pagedRows.map((row, idx) => (
                <tr key={`${row.memberId || row.memberName || 'row'}-${row.ts || idx}`}>
                  <td>{row.memberOrder || '-'}</td>
                  <td>{row.memberName || '-'}</td>
                  <td>{row.memberId || '-'}</td>
                  <td>{row.memberAccount || row.username || row.account || '-'}</td>
                  <td>{row.memberLevel || '-'}</td>
                  <td>{row.shelfTitle || '-'}</td>
                  <td>{row.readChapter || '-'}</td>
                  <td>{row.readAt || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="admin-table-empty">
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
              const n = 1
              setPage(n)
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
              const n = totalPages
              setPage(n)
              setPageInput(String(n))
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
