import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAllVipOrdersFromMemberIps,
  fetchMemberIps,
  fetchPresenceStats,
  fetchReadingRecords,
} from '../lib/adminApi.js'
import { getLegacyToken } from '../lib/adminAuth.js'
import {
  buildDashboardCards,
  computeDashboardStats,
  getCurrentMonthPresenceRange,
} from '../lib/dashboardStats.js'
import { getSettlementDateString } from '../lib/cambodiaTime.js'

const AUTO_REFRESH_MS = 10 * 1000

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
  const [dashboardStats, setDashboardStats] = useState({})
  const [activeMembers, setActiveMembers] = useState({
    total: 0,
    android: 0,
    ios: 0,
    wap: 0,
    author: 0,
  })

  const cards = useMemo(() => buildDashboardCards(dashboardStats), [dashboardStats])

  const loadStats = useCallback(
    async ({ showFlash = true } = {}) => {
      if (showFlash) {
        setFlashVersion((v) => v + 1)
        setLinkRefreshFlash(true)
        window.setTimeout(() => setLinkRefreshFlash(false), 140)
      }

      setError('')

      const legacyToken = getLegacyToken()
      const monthRange = getCurrentMonthPresenceRange()

      let presenceCounts = {}
      let monthPresenceCounts = {}
      let onlinePresenceCounts = {}
      let readingRecords = []
      let orders = []
      let memberIps = []

      try {
        ;[presenceCounts, monthPresenceCounts, onlinePresenceCounts] = await Promise.all([
          fetchPresenceStats({}),
          fetchPresenceStats({ from: monthRange.start, to: monthRange.end }),
          fetchPresenceStats({ from: appliedFrom, to: appliedTo }),
        ])
      } catch (err) {
        setError(err?.message || '统计加载失败')
        return
      }

      if (legacyToken) {
        try {
          memberIps = await fetchMemberIps({ token: legacyToken })
          ;[readingRecords, orders] = await Promise.all([
            fetchReadingRecords({ token: legacyToken }),
            fetchAllVipOrdersFromMemberIps({ token: legacyToken, memberIps }),
          ])
          console.log('Dashboard member-ips', memberIps.length, 'vip orders', orders.length)
        } catch (err) {
          console.warn('Dashboard legacy fetch failed', err?.message || err)
        }
      }

      const stats = computeDashboardStats({
        presenceCounts,
        monthPresenceCounts,
        readingRecords: Array.isArray(readingRecords) ? readingRecords : [],
        orders: Array.isArray(orders) ? orders : [],
        memberIps: Array.isArray(memberIps) ? memberIps : [],
      })

      console.log('ORDERS COUNT', stats.debug.ordersCount)
      console.log('VIP USERS', stats.debug.vipUsersCount)
      console.log('MONTH ORDERS', stats.debug.monthOrdersCount)
      console.log('TOTAL REVENUE', stats.debug.totalRevenue)
      console.log('Dashboard stats sources', stats.debug)

      setActiveMembers(normalizeActiveMembers(onlinePresenceCounts || {}))
      setDashboardStats(stats)
    },
    [appliedFrom, appliedTo],
  )

  useEffect(() => {
    let stop = false

    const run = async () => {
      if (stop) return
      await loadStats({ showFlash: true })
    }

    run()
    const timerId = window.setInterval(() => {
      if (stop) return
      loadStats({ showFlash: false })
    }, AUTO_REFRESH_MS)

    return () => {
      stop = true
      window.clearInterval(timerId)
    }
  }, [loadStats, queryVersion])

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
    loadStats({ showFlash: true })
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
        <div className="admin-grid-cards admin-dashboard-grid">
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
