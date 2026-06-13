import { useCallback, useEffect, useState } from 'react'
import { fetchAdminOrderById, searchAdminOrders } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 50

const EMPTY_FILTERS = {
  status: '',
  paymentMethod: 'ABA_KHQR',
  dateFrom: '',
  dateTo: '',
  keyword: '',
}

const STATUS_LABELS = {
  paid: '已支付',
  pending: '待支付',
  expired: '已过期',
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
}

function formatPaymentMethod(method) {
  if (method === 'ABA_KHQR') return 'ABA KHQR'
  return method || '—'
}

function OrderStatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status || '—'
  const className =
    status === 'paid'
      ? 'admin-order-status--paid'
      : status === 'pending'
        ? 'admin-order-status--pending'
        : status === 'expired'
          ? 'admin-order-status--expired'
          : ''
  return <span className={`admin-order-status ${className}`.trim()}>{label}</span>
}

function createDefaultInputFilters() {
  return { ...EMPTY_FILTERS }
}

export default function OrdersPage() {
  const [inputFilters, setInputFilters] = useState(createDefaultInputFilters)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalPages, setTotalPages] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [linkRefreshFlash, setLinkRefreshFlash] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await searchAdminOrders({
        token: getToken(),
        filters: {
          status: appliedFilters.status,
          payment_method: appliedFilters.paymentMethod,
          date_from: appliedFilters.dateFrom,
          date_to: appliedFilters.dateTo,
          keyword: appliedFilters.keyword,
          page,
          pageSize,
        },
      })
      setRows(Array.isArray(data?.orders) ? data.orders : Array.isArray(data?.items) ? data.items : [])
      setTotal(Number(data?.total) || 0)
      setTotalPages(Math.max(1, Number(data?.totalPages) || 1))
    } catch (err) {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setError(err?.message || '订单加载失败')
    } finally {
      setLoading(false)
    }
  }, [appliedFilters, page, pageSize])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    if (!selectedOrder) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedOrder(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedOrder])

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
    setPage(1)
    setPageInput('1')
  }

  const onReset = () => {
    const reset = createDefaultInputFilters()
    setInputFilters(reset)
    setAppliedFilters(reset)
    setPage(1)
    setPageInput('1')
    setPageSize(DEFAULT_PAGE_SIZE)
  }

  const onOpenDetail = async (row) => {
    const id = row?.id || row?.order_no
    if (!id) return
    setDetailLoading(true)
    try {
      const data = await fetchAdminOrderById({ token: getToken(), id })
      setSelectedOrder(data?.order || row)
    } catch {
      setSelectedOrder(row)
    } finally {
      setDetailLoading(false)
    }
  }

  const currentPage = Math.min(page, totalPages)

  return (
    <section className="admin-panel admin-orders-page">
      {linkRefreshFlash ? <div className="admin-link-refresh-flash" /> : null}
      {error && !/not found/i.test(error) ? <p className="admin-error">{error}</p> : null}

      <div className="admin-orders-filter-bar">
        <label className="admin-orders-field">
          订单状态
          <select
            value={inputFilters.status}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="pending">待支付</option>
            <option value="paid">已支付</option>
            <option value="expired">已过期</option>
          </select>
        </label>
        <label className="admin-orders-field">
          支付方式
          <select
            value={inputFilters.paymentMethod}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, paymentMethod: e.target.value }))}
          >
            <option value="ABA_KHQR">ABA KHQR</option>
          </select>
        </label>
        <label className="admin-orders-field admin-orders-field--date">
          开始日期
          <input
            type="date"
            value={inputFilters.dateFrom}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
          />
        </label>
        <label className="admin-orders-field admin-orders-field--date">
          结束日期
          <input
            type="date"
            value={inputFilters.dateTo}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
          />
        </label>
        <label className="admin-orders-field admin-orders-field--search">
          搜索
          <input
            value={inputFilters.keyword}
            onChange={(e) => setInputFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            placeholder="订单号 / Telegram ID / 用户名"
          />
        </label>
        <div className="admin-orders-filter-actions">
          <button className="admin-btn admin-btn-primary" type="button" onClick={onQuery}>
            搜索
          </button>
          <button className="admin-btn" type="button" onClick={onReset}>
            重置
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-orders-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>Telegram用户</th>
              <th>Telegram ID</th>
              <th>套餐名称</th>
              <th>金额</th>
              <th>支付方式</th>
              <th>订单状态</th>
              <th>创建时间</th>
              <th>支付时间</th>
              <th className="admin-orders-action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id || row.order_no}>
                  <td className="admin-orders-order-no">{row.order_no || '—'}</td>
                  <td>{row.telegram_username || '—'}</td>
                  <td>{row.telegram_user_id || '—'}</td>
                  <td>{row.package_name || '—'}</td>
                  <td>{formatAmount(row.amount)}</td>
                  <td>{formatPaymentMethod(row.payment_method)}</td>
                  <td>
                    <OrderStatusBadge status={row.status} />
                  </td>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{formatDateTime(row.paid_at)}</td>
                  <td className="admin-orders-action-col">
                    <button
                      className="admin-btn admin-order-detail-btn"
                      type="button"
                      onClick={() => onOpenDetail(row)}
                      disabled={detailLoading}
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="admin-table-empty">
                  {loading ? '加载中...' : '暂无订单记录'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination-row">
        <p className="admin-pagination-meta">共 {total} 条订单</p>
        <div className="admin-pagination-controls">
          <label className="admin-orders-page-size">
            每页
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || DEFAULT_PAGE_SIZE)
                setPage(1)
                setPageInput('1')
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} 条
                </option>
              ))}
            </select>
          </label>
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

      {selectedOrder ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-order-detail-title"
          onClick={() => setSelectedOrder(null)}
        >
          <div className="admin-modal-card admin-modal-card--order" onClick={(event) => event.stopPropagation()}>
            <p className="admin-modal-title" id="admin-order-detail-title">
              订单详情
            </p>
            <dl className="admin-order-detail-meta">
              <div>
                <dt>订单号</dt>
                <dd>{selectedOrder.order_no || '—'}</dd>
              </div>
              <div>
                <dt>Telegram ID</dt>
                <dd>{selectedOrder.telegram_user_id || '—'}</dd>
              </div>
              <div>
                <dt>用户名</dt>
                <dd>{selectedOrder.telegram_username || '—'}</dd>
              </div>
              <div>
                <dt>套餐名称</dt>
                <dd>{selectedOrder.package_name || '—'}</dd>
              </div>
              <div>
                <dt>金额</dt>
                <dd>{formatAmount(selectedOrder.amount)}</dd>
              </div>
              <div>
                <dt>支付方式</dt>
                <dd>{formatPaymentMethod(selectedOrder.payment_method)}</dd>
              </div>
              <div>
                <dt>订单状态</dt>
                <dd>
                  <OrderStatusBadge status={selectedOrder.status} />
                </dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDateTime(selectedOrder.created_at)}</dd>
              </div>
              <div>
                <dt>支付时间</dt>
                <dd>{formatDateTime(selectedOrder.paid_at)}</dd>
              </div>
              <div>
                <dt>过期时间</dt>
                <dd>{formatDateTime(selectedOrder.expire_at)}</dd>
              </div>
              <div>
                <dt>Transaction ID</dt>
                <dd>{selectedOrder.transaction_id || '—'}</dd>
              </div>
              <div>
                <dt>Merchant Reference</dt>
                <dd>{selectedOrder.merchant_reference || '—'}</dd>
              </div>
              <div>
                <dt>KHQR Reference</dt>
                <dd>{selectedOrder.khqr_reference || '—'}</dd>
              </div>
            </dl>
            <p className="admin-order-detail-label">Callback Data</p>
            <div className="admin-order-detail-body">
              {selectedOrder.callback_data || '—'}
            </div>
            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-primary" type="button" onClick={() => setSelectedOrder(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
