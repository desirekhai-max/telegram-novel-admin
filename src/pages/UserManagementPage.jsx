import { useEffect, useMemo, useState } from 'react'
import { fetchUsers, updateUserFlags } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'

const TYPE_LABEL = {
  normal: '普通',
  vip: 'VIP',
  author: '作者',
}

function normalizeUserType(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'vip') return 'vip'
  if (text === 'author') return 'author'
  return 'normal'
}

function normalizeTaskHistory(row = {}) {
  return {
    shareAt: row.shareTaskAt || row.shareCompletedAt || row.taskShareAt || '-',
    groupAt: row.groupTaskAt || row.groupCompletedAt || row.taskGroupAt || '-',
    freeMinutes:
      row.freeMinutes ?? row.totalFreeMinutes ?? row.rewardMinutes ?? row.taskRewardMinutes ?? 0,
  }
}

function normalizeUsers(data) {
  const list = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : []
  return list.map((row) => {
    const tgId = String(row.tgId || row.telegramId || row.userId || row.id || '')
    return {
      id: tgId || String(row.id || Math.random()),
      tgId: tgId || '-',
      avatar: row.avatar || row.avatarUrl || row.photoUrl || '',
      firstName: row.firstName || row.name || row.displayName || '-',
      username: row.username || row.tgUsername || row.account || '-',
      ipLocation: row.ipLocation || row.location || row.ipCity || row.loginLocation || '-',
      userType: normalizeUserType(row.userType || row.role || row.level),
      isBanned: Boolean(row.isBanned || row.banned || row.ban),
      whitelist: Boolean(row.whitelist || row.allowBypassTask || row.skipTask),
      tasks: normalizeTaskHistory(row),
    }
  })
}

function shouldShowError(message) {
  const text = String(message || '').trim().toLowerCase()
  return text && text !== 'not found'
}

export default function UserManagementPage() {
  const [loading, setLoading] = useState(false)
  const [submittingId, setSubmittingId] = useState('')
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({
    memberName: '',
    memberId: '',
    memberAccount: '',
    userType: '',
  })

  useEffect(() => {
    let stop = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchUsers({ token: getToken() })
        if (!stop) setRows(normalizeUsers(data))
      } catch (err) {
        if (!stop) {
          setRows([])
          setError(err?.message || '用户列表加载失败')
        }
      } finally {
        if (!stop) setLoading(false)
      }
    }
    load()
    return () => {
      stop = true
    }
  }, [])

  const filteredRows = useMemo(() => {
    const memberName = filters.memberName.trim().toLowerCase()
    const memberId = filters.memberId.trim().toLowerCase()
    const memberAccount = filters.memberAccount.trim().toLowerCase()
    const userType = filters.userType.trim().toLowerCase()
    return rows.filter((row) => {
      if (userType && row.userType !== userType) return false
      const rowName = String(row.firstName || '').toLowerCase()
      const rowId = String(row.tgId || '').toLowerCase()
      const rowAccount = String(row.username || '').toLowerCase()
      if (memberName && !rowName.includes(memberName)) return false
      if (memberId && !rowId.includes(memberId)) return false
      if (memberAccount && !rowAccount.includes(memberAccount)) return false
      return true
    })
  }, [rows, filters])

  const applyFlags = async (row, patch) => {
    const next = { ...row, ...patch }
    setSubmittingId(row.id)
    setError('')
    try {
      await updateUserFlags({
        token: getToken(),
        userId: row.id,
        patch: { isBanned: next.isBanned, whitelist: next.whitelist },
      })
      setRows((prev) => prev.map((item) => (item.id === row.id ? next : item)))
    } catch (err) {
      setError(err?.message || '状态更新失败')
    } finally {
      setSubmittingId('')
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-tools admin-tools-wrap admin-user-filter-row">
        <label>
          会员名称
          <input
            value={filters.memberName}
            onChange={(e) => setFilters((prev) => ({ ...prev, memberName: e.target.value }))}
          />
        </label>
        <label>
          会员ID
          <input
            value={filters.memberId}
            onChange={(e) => setFilters((prev) => ({ ...prev, memberId: e.target.value }))}
          />
        </label>
        <label>
          会员账号
          <input
            value={filters.memberAccount}
            onChange={(e) => setFilters((prev) => ({ ...prev, memberAccount: e.target.value }))}
          />
        </label>
        <label className="admin-user-type-filter">
          用户类型
          <select
            value={filters.userType}
            onChange={(e) => setFilters((prev) => ({ ...prev, userType: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="normal">普通</option>
            <option value="vip">VIP</option>
            <option value="author">作者</option>
          </select>
        </label>
      </div>

      {shouldShowError(error) ? <p className="admin-error">{error}</p> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Avatar</th>
              <th>First Name</th>
              <th>Username</th>
              <th>TG ID</th>
              <th>用户类型</th>
              <th>分享任务完成</th>
              <th>进群任务完成</th>
              <th>累计免费时长(分钟)</th>
              <th>封禁</th>
              <th>IP地点</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.avatar ? (
                      <img className="admin-user-avatar-cell" src={row.avatar} alt="avatar" />
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{row.firstName}</td>
                  <td>{row.username}</td>
                  <td>{row.tgId}</td>
                  <td>{TYPE_LABEL[row.userType] || '普通'}</td>
                  <td>{row.tasks.shareAt || '-'}</td>
                  <td>{row.tasks.groupAt || '-'}</td>
                  <td>{row.tasks.freeMinutes}</td>
                  <td>
                    <button
                      className="admin-btn"
                      type="button"
                      disabled={submittingId === row.id}
                      onClick={() => applyFlags(row, { isBanned: !row.isBanned })}
                    >
                      {row.isBanned ? '解除封禁' : '封禁'}
                    </button>
                  </td>
                  <td>{row.ipLocation}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="admin-table-empty">
                  {loading ? '加载中...' : '暂无记录'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

