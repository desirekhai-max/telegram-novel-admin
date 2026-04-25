import { useEffect, useState } from 'react'
import { fetchOrders } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'

function toDateInputValue(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const NOW_MS = Date.now()
const DEFAULT_FROM = toDateInputValue(new Date(NOW_MS - 6 * 86400000))
const DEFAULT_TO = toDateInputValue(new Date(NOW_MS))

export default function OrdersPage() {
  const [from, setFrom] = useState(DEFAULT_FROM)
  const [to, setTo] = useState(DEFAULT_TO)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])

  useEffect(() => {
    let stop = false
    const load = async () => {
      setError('')
      try {
        const data = await fetchOrders({ token: getToken(), from, to })
        const list = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : []
        if (!stop) setRows(list)
      } catch (err) {
        if (!stop) {
          setRows([])
          setError(err?.message || '订单接口未返回可用数据')
        }
      }
    }
    load()
    return () => {
      stop = true
    }
  }, [from, to])

  return (
    <section className="admin-panel">
      <div className="admin-tools">
        <label>
          开始日期
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          结束日期
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p className="admin-subtle">订单模块已接入页面结构，可继续替换为你现有订单组件。</p>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>用户</th>
              <th>金额</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.id || row.orderNo || 'order'}-${idx}`}>
                <td>{row.orderNo || row.id || '-'}</td>
                <td>{row.username || row.memberName || '-'}</td>
                <td>{row.amount ?? '-'}</td>
                <td>{row.status || '-'}</td>
                <td>{row.createdAt || row.time || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
