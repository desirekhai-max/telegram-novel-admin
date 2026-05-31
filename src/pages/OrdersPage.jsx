import { useEffect, useMemo, useState } from 'react'
import { fetchOrders } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'
import { getSettlementDateString } from '../lib/cambodiaTime.js'

function toDisplayDate(apiDate) {
  const [year, month, day] = String(apiDate || '').split('-')
  if (!year || !month || !day) return ''
  return `${year}-${month}-${day} 09:00:00`
}

function toApiDate(displayDate) {
  const matched = String(displayDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2}) 09:00:00$/)
  if (!matched) return ''
  const [, year, month, day] = matched
  return `${year}-${month}-${day}`
}

function normalizeDateTyping(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  const base = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  return `${base} 09:00:00`
}
const DEFAULT_FROM = getSettlementDateString(0)
const DEFAULT_TO = getSettlementDateString(1)

export default function OrdersPage() {
  const [inputFilters, setInputFilters] = useState({
    orderNo: '',
    memberName: '',
    memberId: '',
    memberAccount: '',
    status: '',
    from: toDisplayDate(DEFAULT_FROM),
    to: toDisplayDate(DEFAULT_TO),
  })
  const [appliedFilters, setAppliedFilters] = useState({
    orderNo: '',
    memberName: '',
    memberId: '',
    memberAccount: '',
    status: '',
    from: toDisplayDate(DEFAULT_FROM),
    to: toDisplayDate(DEFAULT_TO),
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [linkRefreshFlash, setLinkRefreshFlash] = useState(false)
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')

  useEffect(() => {
    let stop = false
    const apiFrom = toApiDate(appliedFilters.from)
    const apiTo = toApiDate(appliedFilters.to)
    if (!apiFrom || !apiTo) {
      setError('日期格式请使用 YYYY-MM-DD 09:00:00')
      return () => {}
    }
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchOrders({ token: getToken(), from: apiFrom, to: apiTo })
        const list = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : []
        if (!stop) setRows(list)
      } catch (err) {
        if (!stop) {
          setRows([])
          setError(err?.message || '订单接口未返回可用数据')
        }
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
  }, [appliedFilters])

  const filteredRows = useMemo(() => {
    const orderNo = inputFilters.orderNo.trim().toLowerCase()
    const memberName = inputFilters.memberName.trim().toLowerCase()
    const memberId = inputFilters.memberId.trim().toLowerCase()
    const memberAccount = inputFilters.memberAccount.trim().toLowerCase()
    const status = inputFilters.status.trim().toLowerCase()

    return rows.filter((row) => {
      const rowOrderNo = String(row.orderNo || row.id || '').toLowerCase()
      const rowMemberName = String(row.memberName || row.username || row.account || '').toLowerCase()
      const rowMemberId = String(row.memberId || row.uid || '').toLowerCase()
      const rowAccount = String(row.username || row.memberName || row.account || '').toLowerCase()
      const rowStatus = String(row.status || '').toLowerCase()

      if (orderNo && !rowOrderNo.includes(orderNo)) return false
      if (memberName && !rowMemberName.includes(memberName)) return false
      if (memberId && !rowMemberId.includes(memberId)) return false
      if (memberAccount && !rowAccount.includes(memberAccount)) return false
      if (status && !rowStatus.includes(status)) return false
      return true
    })
  }, [rows, inputFilters.orderNo, inputFilters.memberName, inputFilters.memberId, inputFilters.memberAccount, inputFilters.status])

  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, currentPage])

  useEffect(() => {
    setPage(1)
    setPageInput('1')
  }, [filteredRows.length])

  const applyPageInput = () => {
    const n = Math.min(totalPages, Math.max(1, Number(pageInput) || 1))
    setPage(n)
    setPageInput(String(n))
  }

  const onQuery = () => {
    setLinkRefreshFlash(true)
    window.setTimeout(() => setLinkRefreshFlash(false), 140)
    setAppliedFilters({ ...inputFilters })
  }

  return (
    <section className="admin-panel admin-orders-page">
      {linkRefreshFlash ? <div className="admin-link-refresh-flash" /> : null}
      <div className="admin-orders-filter-card">
        <div className="admin-tools admin-tools-wrap admin-orders-filter-grid">
          <label className="admin-orders-label">
          订单号
          <input
            value={inputFilters.orderNo}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, orderNo: e.target.value }))}
          />
        </label>
          <label className="admin-orders-label">
          会员名称
          <input
            value={inputFilters.memberName}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, memberName: e.target.value }))}
          />
        </label>
          <label className="admin-orders-label">
          会员ID
          <input
            value={inputFilters.memberId}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, memberId: e.target.value }))}
          />
        </label>
          <label className="admin-orders-label">
          会员账号
          <input
            value={inputFilters.memberAccount}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, memberAccount: e.target.value }))}
          />
        </label>
          <label className="admin-orders-label admin-orders-label-status">
          订单状态
          <select
            value={inputFilters.status}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
            <option value="pending">处理中</option>
          </select>
        </label>
          <label className="admin-orders-label">
          开始日期时间
          <input
            value={inputFilters.from}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, from: normalizeDateTyping(e.target.value) }))
            }
            placeholder="YYYY-MM-DD 09:00:00"
          />
        </label>
          <label className="admin-orders-label">
          结束日期时间
          <input
            value={inputFilters.to}
            onChange={(e) =>
              setInputFilters((prev) => ({ ...prev, to: normalizeDateTyping(e.target.value) }))
            }
            placeholder="YYYY-MM-DD 09:00:00"
          />
        </label>
        </div>
      </div>

      <div className="admin-tools admin-tools-actions admin-orders-actions">
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
            const reset = {
              orderNo: '',
              memberName: '',
              memberId: '',
              memberAccount: '',
              status: '',
              from: toDisplayDate(DEFAULT_FROM),
              to: toDisplayDate(DEFAULT_TO),
            }
            setInputFilters(reset)
            setAppliedFilters(reset)
          }}
        >
          重置
        </button>
      </div>

      {error && !/not found/i.test(error) ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>会员名称</th>
              <th>会员ID</th>
              <th>会员账号</th>
              <th>金额</th>
              <th>支付方式</th>
              <th>状态</th>
              <th>下单时间</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length ? (
              pagedRows.map((row, idx) => (
                <tr key={`${row.id || row.orderNo || 'order'}-${idx}`}>
                  <td>{row.orderNo || row.id || '-'}</td>
                  <td>{row.memberName || row.nickname || row.realName || row.username || '-'}</td>
                  <td>{row.memberId || row.uid || '-'}</td>
                  <td>{row.username || row.memberName || row.account || '-'}</td>
                  <td>{row.amount ?? '-'}</td>
                  <td>{row.payMethod || row.channel || '-'}</td>
                  <td>{row.status || '-'}</td>
                  <td>{row.createdAt || row.time || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="admin-table-empty">
                  暂无记录
                </td>
              </tr>
            )}
            {loading ? (
              <tr>
                <td colSpan={8} className="admin-table-empty">
                  加载中...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination-row">
        <p className="admin-pagination-meta">当前第{currentPage}页 / 共{totalPages}页</p>
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
              const n = Math.max(1, currentPage - 1)
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
              const n = Math.min(totalPages, currentPage + 1)
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
