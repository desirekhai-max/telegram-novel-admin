import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { resolveApiAssetUrl } from '../lib/apiBase.js'
import {
  fetchAdminUsers,
  getApiOriginLabel,
  normalizeAdminUserRow,
  patchAdminUserFlags,
} from '../lib/usersApi.js'

const PAGE_SIZE = 50
const AUTO_REFRESH_MS = 30 * 1000
const TYPE_LABEL = {
  normal: '普通',
  vip: 'VIP',
  author: '作者',
}

const EMPTY_FILTERS = {
  nickname: '',
  tgId: '',
  username: '',
  userType: '',
  vipOnly: '',
}

function createDefaultInputFilters() {
  return { ...EMPTY_FILTERS }
}

function formatCount(value) {
  const num = Number(value) || 0
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return String(num)
}

function formatSpend(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return '—'
  return `$${num.toFixed(2)}`
}

function formatUsername(value) {
  const text = String(value || '').trim()
  if (!text) return '—'
  return text.startsWith('@') ? text : `@${text}`
}

function buildAccountProfileLink(row, from) {
  const params = new URLSearchParams({ tgId: row.tgId, from })
  if (from === 'name' && row.nickname && row.nickname !== '—') {
    params.set('nickname', row.nickname)
  }
  if (from === 'username' && row.username) {
    params.set('username', row.username.replace(/^@/, ''))
  }
  return `/admin/account?${params.toString()}`
}

function shouldShowError(message) {
  const text = String(message || '').trim().toLowerCase()
  return text && text !== 'not found'
}

export default function UserManagementPage() {  const [inputFilters, setInputFilters] = useState(createDefaultInputFilters)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [submittingId, setSubmittingId] = useState('')
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [lastFetchedAt, setLastFetchedAt] = useState(0)
  const stopRef = useRef(false)

  const loadUsers = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    try {
      const list = await fetchAdminUsers()
      if (!stopRef.current) {
        setRows(list)
        setLastFetchedAt(Date.now())
      }
      return true
    } catch (err) {
      if (!stopRef.current) {
        setRows([])
        setError(err?.message || '用户列表加载失败')
      }
      return false
    } finally {
      if (!stopRef.current && showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    stopRef.current = false
    loadUsers()

    const timer = window.setInterval(() => {
      loadUsers({ showLoading: false })
    }, AUTO_REFRESH_MS)

    return () => {
      stopRef.current = true
      window.clearInterval(timer)
    }
  }, [loadUsers])
  const filteredRows = useMemo(() => {
    const nickname = appliedFilters.nickname.trim().toLowerCase()
    const tgId = appliedFilters.tgId.trim().toLowerCase()
    const username = appliedFilters.username.trim().toLowerCase()
    const userType = appliedFilters.userType.trim().toLowerCase()
    const vipOnly = appliedFilters.vipOnly === 'yes'

    return rows.filter((row) => {
      if (userType && row.userType !== userType) return false
      if (vipOnly && !row.vipActive) return false
      if (nickname && !String(row.nickname || '').toLowerCase().includes(nickname)) return false
      if (tgId && !String(row.tgId || '').toLowerCase().includes(tgId)) return false
      const account = String(row.username || '').toLowerCase()
      if (username && !account.includes(username.replace(/^@/, ''))) return false
      return true
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
  }, [appliedFilters])

  const onQuery = async () => {
    setAppliedFilters({ ...inputFilters })
    setPage(1)
    setRefreshing(true)
    await loadUsers({ showLoading: false })
    setRefreshing(false)
  }

  const onReset = async () => {
    const reset = createDefaultInputFilters()
    setInputFilters(reset)
    setAppliedFilters(EMPTY_FILTERS)
    setPage(1)
    setRefreshing(true)
    await loadUsers({ showLoading: false })
    setRefreshing(false)
  }

  const applyBan = async (row, event) => {
    event.preventDefault()
    event.stopPropagation()
    setSubmittingId(`${row.id}:ban`)
    setError('')
    try {
      const updated = await patchAdminUserFlags(row.id, { isBanned: !row.isBanned })
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? updated || {
                ...item,
                isBanned: !row.isBanned,
                statusLabel: !row.isBanned
                  ? '已封禁'
                  : item.vipActive
                    ? 'VIP'
                    : TYPE_LABEL[item.userType] || '普通',
              }
            : item,
        ),
      )    } catch (err) {
      setError(err?.message || '封禁状态更新失败')
    } finally {
      setSubmittingId('')
    }
  }

  const applyWhitelist = async (row, event) => {
    event.preventDefault()
    event.stopPropagation()
    setSubmittingId(`${row.id}:whitelist`)
    setError('')
    try {
      const updated = await patchAdminUserFlags(row.id, { whitelist: !row.whitelist })
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? updated || {
                ...item,
                whitelist: !row.whitelist,
              }
            : item,
        ),
      )
    } catch (err) {
      setError(err?.message || '白名单状态更新失败')
    } finally {
      setSubmittingId('')
    }
  }

  const listMeta = useMemo(() => {
    const origin = `数据源 ${getApiOriginLabel()}`
    if (refreshing) return `${origin} · 正在同步用户数据…`
    if (lastFetchedAt > 0) {
      const time = new Date(lastFetchedAt).toLocaleTimeString('zh-CN', { hour12: false })
      return `${origin} · 共 ${total} 人（TG 用户） · 已同步 ${time} · 每 30 秒自动刷新`
    }
    return `${origin} · 共 ${total} 人（TG 用户） · 每 30 秒自动刷新`
  }, [refreshing, lastFetchedAt, total])
  return (
    <section className="admin-users-mgmt">
      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}

      <div className="admin-reading-mgmt-toolbar admin-users-mgmt-toolbar">
        <div className="admin-users-mgmt-filters">
          <label className="admin-reading-mgmt-field admin-users-mgmt-field--name">
            <span>昵称</span>
            <input
              value={inputFilters.nickname}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, nickname: e.target.value }))}
              placeholder="搜索昵称"
            />
          </label>
          <label className="admin-reading-mgmt-field admin-users-mgmt-field--id">
            <span>TG ID</span>
            <input
              value={inputFilters.tgId}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, tgId: e.target.value }))}
              placeholder="Telegram ID"
            />
          </label>
          <label className="admin-reading-mgmt-field admin-users-mgmt-field--account">
            <span>TG 用户名</span>
            <input
              value={inputFilters.username}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="@username"
            />
          </label>
          <label className="admin-reading-mgmt-field admin-users-mgmt-field--type">
            <span>用户类型</span>
            <select
              value={inputFilters.userType}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, userType: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="normal">普通</option>
              <option value="vip">VIP</option>
              <option value="author">作者</option>
            </select>
          </label>
          <label className="admin-reading-mgmt-field admin-users-mgmt-field--vip">
            <span>VIP</span>
            <select
              value={inputFilters.vipOnly}
              onChange={(e) => setInputFilters((prev) => ({ ...prev, vipOnly: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="yes">仅 VIP</option>
            </select>
          </label>
        </div>
        <div className="admin-reading-mgmt-actions">
          <button className="admin-btn admin-btn-primary" type="button" disabled={refreshing} onClick={onQuery}>
            {refreshing ? '查询中…' : '查询'}
          </button>
          <button className="admin-btn" type="button" disabled={refreshing} onClick={onReset}>
            重置
          </button>
        </div>
      </div>

      <div className={`admin-novel-mgmt-table-card${refreshing ? ' is-refreshing' : ''}`}>
        <div className="admin-novel-mgmt-table-head">
          <h3>用户管理</h3>
          <span className="admin-novel-mgmt-meta">{listMeta} · 名称 / 用户名 / 用户ID 可点击进入账户资料</span>
        </div>
        <div className="admin-table-wrap admin-novel-mgmt-table-wrap">
          <table className="admin-table admin-novel-mgmt-table admin-users-mgmt-table">
            <thead>
              <tr>
                <th>头像</th>
                <th>名称</th>
                <th>用户名</th>
                <th>用户ID</th>
                <th>VIP</th>
                <th>套餐</th>
                <th>到期时间</th>
                <th>消费</th>
                <th>评论</th>
                <th>收藏</th>
                <th>阅读</th>
                <th>状态</th>
                <th>白名单</th>
                <th>封禁</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length ? (
                pagedRows.map((row) => {
                  const banBusy = submittingId === `${row.id}:ban`
                  const whitelistBusy = submittingId === `${row.id}:whitelist`
                  return (
                    <tr key={row.id} className="admin-users-mgmt-row">
                      <td>
                        <Link className="admin-users-mgmt-row-link" to={`/admin/account?tgId=${encodeURIComponent(row.tgId)}`}>
                          {row.avatar ? (
                            <img className="admin-users-mgmt-avatar" src={resolveApiAssetUrl(row.avatar)} alt="" />
                          ) : (                            <span className="admin-users-mgmt-avatar-empty">无</span>
                          )}
                        </Link>
                      </td>
                      <td>
                        <Link
                          className="admin-users-mgmt-row-link admin-users-mgmt-name"
                          to={buildAccountProfileLink(row, 'name')}
                        >
                          {row.nickname}
                        </Link>
                      </td>
                      <td>
                        <Link
                          className="admin-users-mgmt-row-link admin-users-mgmt-username"
                          to={buildAccountProfileLink(row, 'username')}
                        >
                          {formatUsername(row.username)}
                        </Link>
                      </td>
                      <td>
                        <Link
                          className="admin-users-mgmt-row-link admin-users-mgmt-tgid-link"
                          to={buildAccountProfileLink(row, 'id')}
                        >
                          {row.tgId}
                        </Link>
                      </td>
                      <td>
                        <span className={`admin-users-mgmt-vip ${row.vipActive ? 'is-yes' : 'is-no'}`}>
                          {row.vipActive ? '是' : '否'}
                        </span>
                      </td>
                      <td className="admin-users-mgmt-package">{row.packageName}</td>
                      <td className="admin-novel-mgmt-time">{row.vipExpiresAt}</td>
                      <td className="admin-novel-mgmt-num">{formatSpend(row.spendUsd)}</td>
                      <td className="admin-novel-mgmt-num">{formatCount(row.commentCount)}</td>
                      <td className="admin-novel-mgmt-num">{formatCount(row.favoriteCount)}</td>
                      <td className="admin-novel-mgmt-num">{formatCount(row.readCount)}</td>
                      <td>
                        <span
                          className={[
                            'admin-users-mgmt-status',
                            row.isBanned ? 'is-banned' : '',
                            row.isOnline ? 'is-online' : '',
                            row.userType === 'author' ? 'is-author' : '',
                            row.vipActive ? 'is-vip' : '',
                          ].join(' ')}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`admin-novel-mgmt-act ${row.whitelist ? 'admin-novel-mgmt-act--success' : ''}`}
                          type="button"
                          disabled={whitelistBusy}
                          onClick={(event) => applyWhitelist(row, event)}
                        >
                          {whitelistBusy ? '处理中' : row.whitelist ? '移出' : '加入'}
                        </button>
                      </td>
                      <td>
                        <button
                          className={`admin-novel-mgmt-act ${row.isBanned ? 'admin-novel-mgmt-act--danger' : ''}`}
                          type="button"
                          disabled={banBusy}
                          onClick={(event) => applyBan(row, event)}
                        >
                          {banBusy ? '处理中' : row.isBanned ? '解封' : '封禁'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={14} className="admin-table-empty">
                    {loading || refreshing ? '加载中...' : '暂无用户'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-pagination-row admin-novel-mgmt-pagination">
        <p className="admin-pagination-meta">共 {total} 人</p>
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
    </section>
  )
}
