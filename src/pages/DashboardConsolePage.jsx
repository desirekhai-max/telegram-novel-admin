import { useEffect, useMemo, useState } from 'react'
import { fetchHomeStats } from '../lib/adminApi.js'
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

function normalizeCards(data = {}) {
  return [
    { label: '今日阅读', value: data.readToday ?? data.readCount ?? 0 },
    { label: '今日注册', value: data.registerToday ?? data.newUsers ?? 0 },
    { label: '今日付费', value: data.paidToday ?? data.paidCount ?? 0 },
    { label: '订单总数', value: data.orderTotal ?? data.orderCount ?? 0 },
    { label: '成功订单', value: data.successCount ?? 0 },
    { label: '失败订单', value: data.failedCount ?? 0 },
  ]
}

export default function DashboardConsolePage() {
  const [from, setFrom] = useState(DEFAULT_FROM)
  const [to, setTo] = useState(DEFAULT_TO)
  const [autoRefreshSec, setAutoRefreshSec] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({})

  const cards = useMemo(() => normalizeCards(stats), [stats])

  useEffect(() => {
    let stop = false
    const token = getToken()
    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchHomeStats({ token, from, to })
        if (!stop) setStats(data || {})
      } catch (err) {
        if (!stop) setError(err?.message || '统计加载失败')
      } finally {
        if (!stop) setLoading(false)
      }
    }

    fetchData()
    const timer = window.setInterval(fetchData, autoRefreshSec * 1000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [from, to, autoRefreshSec])

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
        <label>
          自动刷新(秒)
          <input
            type="number"
            min="10"
            step="10"
            value={autoRefreshSec}
            onChange={(e) => setAutoRefreshSec(Math.max(10, Number(e.target.value) || 10))}
          />
        </label>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-grid-cards">
        {cards.map((card) => (
          <article className="admin-stat-card" key={card.label}>
            <p>{card.label}</p>
            <h3>{card.value}</h3>
          </article>
        ))}
      </div>
      {loading ? <p className="admin-subtle">数据更新中...</p> : null}
    </section>
  )
}
