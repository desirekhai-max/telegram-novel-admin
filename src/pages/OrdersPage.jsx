import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchAdminOrderDetail,
  getApiOriginLabel,
  refundAdminOrderById,
  searchAdminOrdersList,
} from '../lib/ordersApi.js'

const PAGE_SIZE = 50

const EMPTY_FILTERS = {
  status: '',
  paymentMethod: '',
  dateFrom: '',
  dateTo: '',
  dateField: 'created',
  keyword: '',
}

const STATUS_LABELS = {
  paid: '已支付',
  pending: '待支付',
  expired: '已过期',
  failed: '失败',
  refunded: '已退款',
}

function createDefaultInputFilters() {
  return { ...EMPTY_FILTERS }
}

function formatDateTime(value) {
  if (!value) return '—'
  const ms = Number(value)
  if (Number.isFinite(ms) && ms > 0) {
    return new Date(ms).toLocaleString('zh-CN', { hour12: false })
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
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
          : status === 'refunded'
            ? 'admin-order-status--refunded'
            : status === 'failed'
              ? 'admin-order-status--failed'
              : ''
  return <span className={`admin-order-status ${className}`.trim()}>{label}</span>
}

function PayChannelBadge({ active, label }) {
  return (
    <span className={`admin-order-pay-badge ${active ? 'is-active' : ''}`.trim()}>
      {active ? label : '—'}
    </span>
  )
}

export default function OrdersPage() {
  const [searchParams] = useSearchParams()
  const [inputFilters, setInputFilters] = useState(createDefaultInputFilters)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastFetchedAt, setLastFetchedAt] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refundingId, setRefundingId] = useState('')

  const loadOrders = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    try {
      const data = await searchAdminOrdersList({
        status: appliedFilters.status,
        payment_method: appliedFilters.paymentMethod,
        date_from: appliedFilters.dateFrom,
        date_to: appliedFilters.dateTo,
        date_field: appliedFilters.dateField,
        keyword: appliedFilters.keyword,
        page,
        pageSize: PAGE_SIZE,
        t: Date.now(),
      })
      setRows(data.orders)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setLastFetchedAt(Date.now())
      return true
    } catch (err) {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setError(err?.message || '订单加载失败')
      return false
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [appliedFilters, page])

  useEffect(() => {
    const keyword = String(searchParams.get('keyword') || '').trim()
    if (!keyword) return
    setInputFilters((prev) => ({ ...prev, keyword }))
    setAppliedFilters((prev) => ({ ...prev, keyword }))
    setPage(1)
  }, [searchParams])

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

  const onQuery = async () => {
    setAppliedFilters({ ...inputFilters })
    setPage(1)
    setRefreshing(true)
    await loadOrders({ showLoading: false })
    setRefreshing(false)
  }

  const onReset = async () => {
    const reset = createDefaultInputFilters()
    setInputFilters(reset)
    setAppliedFilters(reset)
    setPage(1)
    setRefreshing(true)
    await loadOrders({ showLoading: false })
    setRefreshing(false)
  }

  const onOpenDetail = async (row) => {
    const id = row?.id || row?.order_no
    if (!id) return
    setDetailLoading(true)
    try {
      const order = await fetchAdminOrderDetail(id)
      setSelectedOrder(order)
    } catch {
      setSelectedOrder(row)
    } finally {
      setDetailLoading(false)
    }
  }

  const onRefund = async (row) => {
    const id = row?.id || row?.order_no
    if (!id || !row?.can_refund) return
    if (!window.confirm(`确认将订单 ${row.order_no} 标记为已退款？`)) return
    setRefundingId(id)
    setError('')
    try {
      await refundAdminOrderById(id)
      await loadOrders({ showLoading: false })
    } catch (err) {
      setError(err?.message || '退款失败')
    } finally {
      setRefundingId('')
    }
  }

  const listMeta = useMemo(() => {
    const origin = `数据源 ${getApiOriginLabel()}`
    if (refreshing) return `${origin} · 正在同步最新订单…`
    if (lastFetchedAt > 0) {
      const time = new Date(lastFetchedAt).toLocaleTimeString('zh-CN', { hour12: false })
      return `${origin} · 共 ${total} 条 · 已同步 ${time}`
    }
    return `${origin} · 共 ${total} 条`
  }, [refreshing, lastFetchedAt, total])

  const currentPage = Math.min(page, totalPages)

  return (
    <section className="admin-orders-mgmt">
      {error && !/not found/i.test(error) ? <p className="admin-error">{error}</p> : null}

      <div className="admin-reading-mgmt-toolbar admin-orders-mgmt-toolbar">
        <div className="admin-orders-mgmt-filters">
          <label className="admin-reading-mgmt-field admin-orders-mgmt-field--status">
            <span>订单状态</span>
            <select
              value={inputFilters.status}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="expired">已过期</option>
              <option value="failed">失败</option>
              <option value="refunded">已退款</option>
            </select>
          </label>
          <label className="admin-reading-mgmt-field admin-orders-mgmt-field--pay">
            <span>支付方式</span>
            <select
              value={inputFilters.paymentMethod}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, paymentMethod: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="aba_khqr">ABA KHQR</option>
              <option value="payway_hosted">PayWay</option>
              <option value="vip_purchase">VIP 内购</option>
              <option value="vip_gift">VIP 赠送</option>
            </select>
          </label>
          <label className="admin-reading-mgmt-field admin-orders-mgmt-field--pay">
            <span>日期依据</span>
            <select
              value={inputFilters.dateField}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, dateField: e.target.value }))}
            >
              <option value="created">创建时间</option>
              <option value="paid">支付时间</option>
            </select>
          </label>
          <label className="admin-reading-mgmt-field admin-orders-mgmt-field--date">
            <span>开始日期</span>
            <input
              type="date"
              value={inputFilters.dateFrom}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
          </label>
          <label className="admin-reading-mgmt-field admin-orders-mgmt-field--date">
            <span>结束日期</span>
            <input
              type="date"
              value={inputFilters.dateTo}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
          </label>
          <label className="admin-reading-mgmt-field admin-orders-mgmt-field--search">
            <span>搜索</span>
            <input
              value={inputFilters.keyword}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              placeholder="订单号 / Telegram ID / 交易号"
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
        </div>
      </div>

      <div className={`admin-novel-mgmt-table-card${refreshing ? ' is-refreshing' : ''}`}>
        <div className="admin-novel-mgmt-table-head">
          <h3>订单管理</h3>
          <span className="admin-novel-mgmt-meta">{listMeta}</span>
        </div>
        <div className="admin-table-wrap admin-novel-mgmt-table-wrap">
          <table className="admin-table admin-novel-mgmt-table admin-orders-mgmt-table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>用户</th>
                <th>套餐</th>
                <th>金额</th>
                <th>状态</th>
                <th>时间</th>
                <th>支付方式</th>
                <th>ABA</th>
                <th>PayWay</th>
                <th>退款</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => {
                  const busy = refundingId === (row.id || row.order_no)
                  return (
                    <tr key={row.id || row.order_no}>
                      <td className="admin-orders-mgmt-order-no">{row.order_no || '—'}</td>
                      <td className="admin-orders-mgmt-user">
                        <span className="admin-orders-mgmt-user-name">
                          {row.user_label || row.telegram_username || '—'}
                        </span>
                        {row.telegram_user_id ? (
                          <span className="admin-orders-mgmt-user-sub">ID {row.telegram_user_id}</span>
                        ) : null}
                      </td>
                      <td className="admin-orders-mgmt-package">{row.package_name || '—'}</td>
                      <td className="admin-novel-mgmt-num">{formatAmount(row.amount)}</td>
                      <td>
                        <OrderStatusBadge status={row.status} />
                      </td>
                      <td className="admin-novel-mgmt-time">
                        {row.time_label || formatDateTime(row.paid_at || row.created_at)}
                      </td>
                      <td>{row.payment_method || '—'}</td>
                      <td>
                        <PayChannelBadge active={row.pay_aba} label="ABA" />
                      </td>
                      <td>
                        <PayChannelBadge active={row.pay_payway} label="PayWay" />
                      </td>
                      <td>
                        {row.status === 'refunded' ? (
                          <span className="admin-orders-mgmt-refund-done">已退款</span>
                        ) : row.can_refund ? (
                          <button
                            className="admin-novel-mgmt-act admin-orders-mgmt-refund-btn"
                            type="button"
                            disabled={busy || refreshing}
                            onClick={() => onRefund(row)}
                          >
                            {busy ? '处理中' : '退款'}
                          </button>
                        ) : (
                          <span className="admin-orders-mgmt-refund-muted">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="admin-novel-mgmt-act"
                          type="button"
                          disabled={detailLoading}
                          onClick={() => onOpenDetail(row)}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={11} className="admin-table-empty">
                    {loading || refreshing ? '加载中...' : '暂无订单记录'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-pagination-row admin-novel-mgmt-pagination">
        <p className="admin-pagination-meta">共 {total} 条</p>
        <div className="admin-pagination-controls">
          <button
            className="admin-btn"
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            className="admin-btn"
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
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
          <div
            className="admin-modal-card admin-modal-card--wide admin-modal-card--scrollable"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-sticky-head">
              <p className="admin-modal-title" id="admin-order-detail-title">
                订单详情
              </p>
            </div>
            <div className="admin-modal-scroll-body">
              <dl className="admin-order-detail-meta">
                <div>
                  <dt>订单号</dt>
                  <dd>{selectedOrder.order_no || '—'}</dd>
                </div>
                <div>
                  <dt>交易号</dt>
                  <dd>{selectedOrder.tran_id || '—'}</dd>
                </div>
                <div>
                  <dt>用户</dt>
                  <dd>{selectedOrder.user_label || selectedOrder.telegram_username || '—'}</dd>
                </div>
                <div>
                  <dt>Telegram ID</dt>
                  <dd>{selectedOrder.telegram_user_id || '—'}</dd>
                </div>
                <div>
                  <dt>套餐</dt>
                  <dd>{selectedOrder.package_name || '—'}</dd>
                </div>
                <div>
                  <dt>金额</dt>
                  <dd>{formatAmount(selectedOrder.amount)}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>
                    <OrderStatusBadge status={selectedOrder.status} />
                  </dd>
                </div>
                <div>
                  <dt>支付方式</dt>
                  <dd>{selectedOrder.payment_method || '—'}</dd>
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
                  <dt>退款时间</dt>
                  <dd>{formatDateTime(selectedOrder.refunded_at)}</dd>
                </div>
                <div>
                  <dt>PayWay 环境</dt>
                  <dd>{selectedOrder.payway_env || '—'}</dd>
                </div>
                <div>
                  <dt>失败原因</dt>
                  <dd>{selectedOrder.fail_reason || '—'}</dd>
                </div>
              </dl>
            </div>
            <div className="admin-modal-actions admin-modal-actions--sticky">
              <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={() => setSelectedOrder(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
