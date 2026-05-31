import { useEffect, useMemo, useState } from 'react'
import { fetchPresenceStats } from '../lib/adminApi.js'
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

const DEFAULT_FROM = getSettlementDateString(0)
const DEFAULT_TO = getSettlementDateString(1)

function normalizeCards(counts = {}) {
  return [
    { label: '注册用户', value: counts.registeredTotal ?? 0 },
    { label: 'VIP 用户', value: counts.paidTotal ?? 0 },
    { label: '今日活跃', value: counts.readToday ?? 0 },
    { label: '阅读总数', value: counts.readTotal ?? 0 },
    { label: '订单总数', value: counts.orderTotal ?? 0 },
  ]
}

function shouldShowError(message) {
  const text = String(message || '').trim().toLowerCase()
  return text && text !== 'not found'
}

function normalizeActiveMembers(counts = {}) {
  const android = Number(counts.android) || 0
  const ios = Number(counts.ios) || 0
  const wap = Number(counts.web) || 0
  const author = Number(counts.admin) || 0
  return {
    total: android + ios + wap,
    android,
    ios,
    wap,
    author,
  }
}

export default function DashboardConsolePage() {
  const [inputFrom, setInputFrom] = useState(toDisplayDate(DEFAULT_FROM))
  const [inputTo, setInputTo] = useState(toDisplayDate(DEFAULT_TO))
  const [appliedFrom, setAppliedFrom] = useState(DEFAULT_FROM)
  const [appliedTo, setAppliedTo] = useState(DEFAULT_TO)
  const [queryVersion, setQueryVersion] = useState(0)
  const [flashVersion, setFlashVersion] = useState(0)
  const [linkRefreshFlash, setLinkRefreshFlash] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({})
  const [activeMembers, setActiveMembers] = useState({
    total: 0,
    android: 0,
    ios: 0,
    wap: 0,
    author: 0,
  })

  const isTodayRange = useMemo(() => {
    return appliedFrom === getSettlementDateString(0) && appliedTo === getSettlementDateString(1)
  }, [appliedFrom, appliedTo])

  const cards = useMemo(() => normalizeCards(stats), [stats])

  useEffect(() => {
    let stop = false
    const fetchData = async () => {
      setFlashVersion((v) => v + 1)
      setLinkRefreshFlash(true)
      window.setTimeout(() => setLinkRefreshFlash(false), 140)
      setError('')
      try {
        const counts = await fetchPresenceStats({ from: appliedFrom, to: appliedTo })
        if (!stop) {
          setStats(counts || {})
          setActiveMembers(normalizeActiveMembers(counts || {}))
        }
      } catch (err) {
        if (!stop) setError(err?.message || '统计加载失败')
      }
    }

    fetchData()
    let timerId
    if (isTodayRange) {
      timerId = window.setInterval(fetchData, 30 * 1000)
    } else {
      timerId = window.setTimeout(() => {
        if (stop) return
        const todayFrom = getSettlementDateString(0)
        const todayTo = getSettlementDateString(1)
        setAppliedFrom(todayFrom)
        setAppliedTo(todayTo)
        setInputFrom(toDisplayDate(todayFrom))
        setInputTo(toDisplayDate(todayTo))
      }, 30 * 1000)
    }
    return () => {
      stop = true
      if (isTodayRange) {
        window.clearInterval(timerId)
      } else {
        window.clearTimeout(timerId)
      }
    }
  }, [appliedFrom, appliedTo, isTodayRange, queryVersion])

  const onQuery = () => {
    const apiFrom = toApiDate(inputFrom)
    const apiTo = toApiDate(inputTo)
    if (!apiFrom || !apiTo) {
      setError('日期格式请使用 YYYY-MM-DD 09:00:00')
      return
    }
    setAppliedFrom(apiFrom)
    setAppliedTo(apiTo)
    setQueryVersion((v) => v + 1)
  }

  return (
    <>
      {linkRefreshFlash ? <div className="admin-link-refresh-flash" /> : null}
      <section
        className="admin-panel"
        style={{
          animationName: flashVersion % 2 ? 'adminPanelFlashA' : 'adminPanelFlashB',
          animationDuration: '220ms',
          animationTimingFunction: 'ease-out',
        }}
      >
        {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}
        <div className="admin-grid-cards">
          {cards.map((card) => (
            <article className="admin-stat-card" key={card.label}>
              <p>{card.label}</p>
              <h3>{card.value}</h3>
            </article>
          ))}
        </div>
        <div className="admin-filter-row">
          <div className="admin-activity-block">
            <div className="admin-five-minute-headline">
              <span className="admin-five-minute-key">当前在线会员：</span>
              <span>{activeMembers.total}人</span>
            </div>
          </div>

          <div className="admin-datetime-strip">
            <div className="admin-tools admin-datetime-tools">
              <div className="admin-date-inline">
                <span className="admin-date-inline-label">日期</span>
                <input
                  value={inputFrom}
                  onChange={(e) => setInputFrom(e.target.value)}
                  placeholder="YYYY-MM-DD 09:00:00"
                />
                <input
                  value={inputTo}
                  onChange={(e) => setInputTo(e.target.value)}
                  placeholder="YYYY-MM-DD 09:00:00"
                />
                <button
                  className="admin-btn admin-btn-primary admin-date-query-btn"
                  type="button"
                  onClick={onQuery}
                >
                  查询
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-five-minute-active">
          <p>
            <span className="admin-five-minute-key">安卓：</span>
            <span>{activeMembers.android}人</span>
          </p>
          <p>
            <span className="admin-five-minute-key">IOS：</span>
            <span>{activeMembers.ios}人</span>
          </p>
          <p>
            <span className="admin-five-minute-key">WAP：</span>
            <span>{activeMembers.wap}人</span>
          </p>
          <p>
            <span className="admin-five-minute-key">后台：</span>
            <span>{activeMembers.author}人</span>
          </p>
        </div>
      </section>
    </>
  )
}
