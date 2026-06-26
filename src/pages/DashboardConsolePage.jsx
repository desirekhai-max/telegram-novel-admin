import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardStatIcon } from '../components/dashboard/DashboardIcons.jsx'
import { fetchAdminDashboardPayload } from '../lib/dashboardApi.js'
import { resolveApiAssetUrl } from '../lib/apiBase.js'
import { formatUsdAmount } from '../lib/dashboardStats.js'

const AUTO_REFRESH_MS = 10 * 1000
const LATEST_LIST_LIMIT = 4

const STAT_CARDS = [
  { key: 'onlineCount', label: '在线人数', icon: 'online', tone: 'green' },
  { key: 'todayNewUsers', label: '今日新增', icon: 'userPlus', tone: 'purple' },
  { key: 'vipUsers', label: 'VIP人数', icon: 'crown', tone: 'gold' },
  { key: 'normalUsers', label: '普通用户', icon: 'users', tone: 'blue' },
  { key: 'todayOrders', label: '今日订单', icon: 'cart', tone: 'cyan' },
  { key: 'todayRevenueUsd', label: '今日收入', icon: 'dollar', tone: 'green', format: 'usd' },
  { key: 'todayComments', label: '今日评论', icon: 'comment', tone: 'magenta' },
  { key: 'todayReports', label: '今日举报', icon: 'flag', tone: 'red' },
  { key: 'novelTotal', label: '小说总数', icon: 'book', tone: 'orange' },
  { key: 'chapterTotal', label: '章节总数', icon: 'books', tone: 'indigo' },
  { key: 'pendingReports', label: '待审核举报', icon: 'alert', tone: 'red', invertTrend: true },
  { key: 'pendingOrders', label: '待处理订单', icon: 'package', tone: 'amber', invertTrend: true },
]

function shouldShowError(message) {
  const text = String(message || '').trim().toLowerCase()
  return text && text !== 'not found'
}

function formatStatValue(value, format) {
  if (format === 'usd') return formatUsdAmount(value)
  const num = Number(value) || 0
  return num.toLocaleString('zh-CN')
}

function formatRelativeTime(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const diff = Date.now() - value
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}分钟前`
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}小时前`
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function calcTrend(current, previous, invertTrend = false) {
  const cur = Number(current) || 0
  const prev = Number(previous)
  if (!Number.isFinite(prev)) return { text: '—', up: true, neutral: true }
  if (prev === 0 && cur === 0) return { text: '0% 较昨日', up: true, neutral: true }
  if (prev === 0) {
    const up = !invertTrend
    return { text: `+100% 较昨日`, up, neutral: false }
  }
  const rawPct = ((cur - prev) / Math.abs(prev)) * 100
  const up = invertTrend ? rawPct <= 0 : rawPct >= 0
  const sign = rawPct > 0 ? '+' : ''
  return { text: `${sign}${rawPct.toFixed(1)}% 较昨日`, up, neutral: false }
}

function userAvatarLetter(name, fallback = 'U') {
  const text = String(name || '').trim()
  return (text[0] || fallback).toUpperCase()
}

function avatarHue(seed) {
  let hash = 0
  const text = String(seed || '')
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return hash % 360
}

function UserAvatar({ name, seed, avatar }) {
  const [failed, setFailed] = useState(false)
  const src = resolveApiAssetUrl(avatar)
  const hue = avatarHue(seed || name)

  if (src && !failed) {
    return (
      <img
        className="admin-dash-avatar admin-dash-avatar--img"
        src={src}
        alt=""
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span className="admin-dash-avatar" style={{ background: `hsl(${hue} 68% 42%)` }}>
      {userAvatarLetter(name)}
    </span>
  )
}

const CHART_Y_TICK_RATIOS = [1, 0.75, 0.5, 0.25, 0]
const CHART_WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const CHART_NICE_AXIS_STEPS = [
  5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 5000,
]

function resolveChartRowMeta(row) {
  const weekdayLabel = String(row?.label || '').trim()
  const dateLabel = String(row?.dateLabel || '').trim()
  if (/^周/.test(weekdayLabel)) {
    return { label: weekdayLabel, dateLabel: dateLabel || weekdayLabel }
  }
  const dateText = dateLabel || weekdayLabel
  const match = dateText.match(/^(\d{2})-(\d{2})$/)
  if (!match) return { label: weekdayLabel || '—', dateLabel: dateText }
  const year = new Date().getFullYear()
  const date = new Date(year, Number(match[1]) - 1, Number(match[2]))
  return { label: CHART_WEEKDAY_LABELS[date.getDay()], dateLabel: dateText }
}

function niceChartAxisMax(target, ceiling) {
  const value = Math.max(Number(target) || 1, 1)
  const cap = Number.isFinite(Number(ceiling)) ? Number(ceiling) : value
  for (const step of CHART_NICE_AXIS_STEPS) {
    if (step >= value && step <= cap) return step
  }
  return cap
}

/** 数据峰值较小时自动收紧 Y 轴，避免折线贴在底部看不出变化 */
function resolveDisplayAxisMax(values, preferredMax, minFillRatio = 0.15) {
  const cap = Number.isFinite(Number(preferredMax)) ? Number(preferredMax) : Math.max(...values, 1)
  const peak = Math.max(...values.map((v) => Number(v) || 0), 0)
  if (peak <= 0) return cap
  if (peak >= cap * minFillRatio) return cap
  return niceChartAxisMax(peak * 1.25, cap)
}

function LineChart({
  title,
  rows,
  valueKey,
  stroke,
  fill,
  formatValue,
  tone = 'purple',
  axisMin = 0,
  axisMax,
}) {
  const gradientId = useId().replace(/:/g, '')
  const chartPlotRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(null)
  const values = rows.map((row) => Number(row[valueKey]) || 0)
  const chartMeta = rows.map(resolveChartRowMeta)
  const labels = chartMeta.map((row) => row.label)
  const dateLabels = chartMeta.map((row) => row.dateLabel)
  const pointCount = Math.max(values.length, 1)
  const min = Number(axisMin) || 0
  const preferredMax = Number.isFinite(Number(axisMax)) ? Number(axisMax) : Math.max(...values, 1)
  const max = resolveDisplayAxisMax(values, preferredMax)
  const range = Math.max(max - min, 1)
  const width = 320
  const height = 88
  const padY = 8
  const innerH = height - padY * 2

  const pointX = (index) => ((index + 0.5) / pointCount) * width

  const bottomY = padY + innerH

  const valueToY = (value) => {
    const clamped = Math.min(max, Math.max(min, Number(value) || 0))
    return padY + innerH - ((clamped - min) / range) * innerH
  }

  const snapLineY = (y) => (y >= bottomY - 0.25 ? bottomY - 1.5 : y)

  const points = values.map((value, index) => {
    const x = pointX(index)
    const y = snapLineY(valueToY(value))
    return { x, y, value, label: labels[index], dateLabel: dateLabels[index] }
  })

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const area =
    points.length > 0
      ? `${points[0].x},${padY + innerH} ${polyline} ${points[points.length - 1].x},${padY + innerH}`
      : ''
  const weekTotal = values.reduce((sum, value) => sum + (Number(value) || 0), 0)
  const activePoint = activeIndex != null ? points[activeIndex] : null

  const handleChartHover = useCallback((event) => {
    const svg = chartPlotRef.current?.querySelector('svg')
    if (!svg || points.length === 0) return
    const rect = svg.getBoundingClientRect()
    if (!rect.width) return
    const ratio = (event.clientX - rect.left) / rect.width
    const index = Math.min(pointCount - 1, Math.max(0, Math.floor(ratio * pointCount)))
    setActiveIndex(index)
  }, [pointCount, points.length])

  const clearChartHover = useCallback(() => setActiveIndex(null), [])

  return (
    <article className={`admin-dash-chart-card admin-dash-chart-card--${tone}`}>
      <div className="admin-dash-chart-head">
        <h3>{title}</h3>
        <span className="admin-dash-chart-peak">
          {formatValue ? formatValue(weekTotal) : weekTotal}
        </span>
      </div>
      <div
        ref={chartPlotRef}
        className="admin-dash-line-chart-wrap"
        onMouseMove={handleChartHover}
        onMouseLeave={clearChartHover}
      >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="admin-dash-line-chart"
            role="img"
            aria-label={title}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity="0.42" />
                <stop offset="100%" stopColor={fill} stopOpacity="0" />
              </linearGradient>
            </defs>
            {CHART_Y_TICK_RATIOS.map((ratio) => (
              <line
                key={ratio}
                x1={0}
                x2={width}
                y1={padY + innerH * (1 - ratio)}
                y2={padY + innerH * (1 - ratio)}
                className="admin-dash-line-chart-grid"
              />
            ))}
            {area ? <polygon points={area} fill={`url(#${gradientId})`} /> : null}
            <polyline
              points={polyline}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="admin-dash-line-chart-line"
            />
            {activePoint && (
              <line
                x1={activePoint.x}
                x2={activePoint.x}
                y1={padY}
                y2={padY + innerH}
                className="admin-dash-line-chart-guide"
              />
            )}
            {points.map((p, index) => (
              <circle
                key={`${p.label}-${index}`}
                cx={p.x}
                cy={p.y}
                r={activeIndex === index ? 5 : 3}
                fill={stroke}
                stroke={activeIndex === index ? '#fff' : '#0f1628'}
                strokeWidth={activeIndex === index ? 1.5 : 1.2}
                className={activeIndex === index ? 'admin-dash-line-chart-dot--active' : ''}
              />
            ))}
          </svg>
          {activePoint && (
            <div
              className="admin-dash-chart-tooltip"
              style={{
                left: `${(activePoint.x / width) * 100}%`,
                top: `${(activePoint.y / height) * 100}%`,
              }}
            >
              <span className="admin-dash-chart-tooltip-date">
                {activePoint.dateLabel && activePoint.dateLabel !== activePoint.label
                  ? `${activePoint.dateLabel} ${activePoint.label}`
                  : activePoint.label}
              </span>
              <strong className="admin-dash-chart-tooltip-value">
                {formatValue ? formatValue(activePoint.value) : activePoint.value}
              </strong>
            </div>
          )}
          <div className="admin-dash-line-chart-labels">
            {labels.map((label, index) => (
              <span
                key={`${label}-${index}`}
                className={activeIndex === index ? 'admin-dash-line-chart-label--active' : ''}
                style={{ left: `${((index + 0.5) / pointCount) * 100}%` }}
              >
                {label}
              </span>
            ))}
          </div>
      </div>
    </article>
  )
}

function StatCard({ item, value, trend }) {
  const Icon = DashboardStatIcon
  return (
    <article className={`admin-dash-stat-card admin-dash-stat-card--${item.tone}`}>
      <div className="admin-dash-stat-icon-wrap">
        <Icon name={item.icon} className="admin-dash-stat-icon" />
      </div>
      <div className="admin-dash-stat-body">
        <p className="admin-dash-stat-label">{item.label}</p>
        <h3 className="admin-dash-stat-value">{formatStatValue(value, item.format)}</h3>
        <p
          className={[
            'admin-dash-stat-trend',
            trend.neutral ? 'is-neutral' : trend.up ? 'is-up' : 'is-down',
          ].join(' ')}
        >
          {!trend.neutral ? <span className="admin-dash-stat-trend-arrow">{trend.up ? '↑' : '↓'}</span> : null}
          {trend.text}
        </p>
      </div>
    </article>
  )
}

function planLabel(planId) {
  const id = String(planId || '').trim()
  if (!id) return 'VIP套餐'
  if (id.includes('premium')) return '高级VIP'
  if (id.includes('standard')) return '标准VIP'
  if (id.includes('entry')) return '入门VIP'
  return id
}

export default function DashboardConsolePage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState(null)
  const prevStatsRef = useRef(null)

  const stats = dashboard?.stats || {}

  const loadStats = useCallback(async () => {
    setError('')
    try {
      const data = await fetchAdminDashboardPayload()
      setDashboard((prev) => {
        if (prev?.stats) prevStatsRef.current = prev.stats
        return data
      })
    } catch (err) {
      setError(err?.message || '仪表盘数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let stop = false
    const run = async () => {
      if (stop) return
      await loadStats()
    }
    run()
    const timerId = window.setInterval(() => {
      if (stop) return
      loadStats()
    }, AUTO_REFRESH_MS)
    return () => {
      stop = true
      window.clearInterval(timerId)
    }
  }, [loadStats])

  const trends = useMemo(() => {
    const prev = prevStatsRef.current || {}
    const out = {}
    STAT_CARDS.forEach((item) => {
      out[item.key] = calcTrend(stats[item.key], prev[item.key], item.invertTrend)
    })
    return out
  }, [stats])

  const latestOrders = useMemo(
    () =>
      (dashboard?.latestOrders || []).slice(0, LATEST_LIST_LIMIT).map((row, index) => ({
        id: row.orderNo || row.tranId || `order-${index}`,
        ...row,
      })),
    [dashboard?.latestOrders],
  )

  const latestUsers = useMemo(
    () =>
      (dashboard?.latestUsers || []).slice(0, LATEST_LIST_LIMIT).map((row, index) => ({
        id: row.tgId || `user-${index}`,
        ...row,
      })),
    [dashboard?.latestUsers],
  )

  const latestComments = useMemo(
    () =>
      (dashboard?.latestComments || []).slice(0, LATEST_LIST_LIMIT).map((row) => ({
        id: row.id,
        ...row,
      })),
    [dashboard?.latestComments],
  )

  return (
    <section className="admin-panel admin-dashboard-console">
      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}
      {loading && !dashboard ? <p className="admin-muted">加载中…</p> : null}

      <div className="admin-dash-stat-grid">
        {STAT_CARDS.map((item) => (
          <StatCard
            key={item.key}
            item={item}
            value={stats[item.key]}
            trend={trends[item.key] || { text: '—', up: true, neutral: true }}
          />
        ))}
      </div>

      <div className="admin-dash-charts">
        <LineChart
          title="最近7天收入"
          rows={dashboard?.revenueLast7Days || []}
          valueKey="amountUsd"
          stroke="#c084fc"
          fill="#a855f7"
          tone="purple"
          axisMin={0}
          axisMax={400}
          formatValue={(v) => formatUsdAmount(v)}
        />
        <LineChart
          title="最近7天活跃用户"
          rows={dashboard?.activityLast7Days || []}
          valueKey="activeUsers"
          stroke="#38bdf8"
          fill="#0ea5e9"
          tone="cyan"
          axisMin={0}
          axisMax={2000}
          formatValue={(v) => `${v}人`}
        />
      </div>

      <div className="admin-dash-latest-grid">
        <article className="admin-dash-latest-card admin-dash-latest-card--orders">
          <div className="admin-dash-latest-head">
            <h3>最新订单</h3>
            <Link className="admin-dash-latest-link" to="/admin/orders">
              查看全部
            </Link>
          </div>
          <div className="admin-dash-latest-list">
            {latestOrders.length ? (
              latestOrders.map((row) => (
                <div className="admin-dash-latest-item" key={row.id}>
                  <div className="admin-dash-latest-item-top">
                    <UserAvatar
                      name={row.firstName || row.username || row.telegramUserId}
                      seed={row.telegramUserId}
                      avatar={row.avatar}
                    />
                    <div className="admin-dash-latest-item-main">
                      <strong>{row.telegramUserId || '用户'}</strong>
                      <span className="admin-dash-time">{formatRelativeTime(row.paidAtMs || row.createdAtMs)}</span>
                    </div>
                  </div>
                  <div className="admin-dash-latest-item-foot">
                    <span className="admin-dash-pill admin-dash-pill--gold">{planLabel(row.planId)}</span>
                    <span className="admin-dash-money">{formatUsdAmount(row.amountUsd ?? row.amount)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="admin-dash-empty">暂无订单</p>
            )}
          </div>
        </article>

        <article className="admin-dash-latest-card admin-dash-latest-card--users">
          <div className="admin-dash-latest-head">
            <h3>最新用户</h3>
            <Link className="admin-dash-latest-link" to="/admin/users">
              查看全部
            </Link>
          </div>
          <div className="admin-dash-latest-list">
            {latestUsers.length ? (
              latestUsers.map((row) => (
                <div className="admin-dash-latest-item" key={row.id}>
                  <UserAvatar
                    name={row.firstName || row.username || row.tgId}
                    seed={row.tgId}
                    avatar={row.avatar}
                  />
                  <div className="admin-dash-latest-item-main">
                    <strong>{row.firstName || row.username || row.tgId}</strong>
                  </div>
                  <span className="admin-dash-time">{formatRelativeTime(row.lastSeenAt)}</span>
                </div>
              ))
            ) : (
              <p className="admin-dash-empty">暂无用户</p>
            )}
          </div>
        </article>

        <article className="admin-dash-latest-card admin-dash-latest-card--comments">
          <div className="admin-dash-latest-head">
            <h3>最新评论</h3>
          </div>
          <div className="admin-dash-latest-list">
            {latestComments.length ? (
              latestComments.map((row) => (
                <div className="admin-dash-latest-item admin-dash-latest-item--comment" key={row.id}>
                  <div className="admin-dash-latest-item-top">
                    <UserAvatar name={row.userName} seed={row.userId || row.userName} avatar={row.avatar} />
                    <div className="admin-dash-latest-item-main">
                      <strong>{row.userName || '用户'}</strong>
                      <span className="admin-dash-latest-sub">{row.novelTitle || row.novelId}</span>
                    </div>
                  </div>
                  <p className="admin-dash-comment-text">{row.text || '—'}</p>
                </div>
              ))
            ) : (
              <p className="admin-dash-empty">暂无评论</p>
            )}
          </div>
        </article>
      </div>
    </section>
  )
}
