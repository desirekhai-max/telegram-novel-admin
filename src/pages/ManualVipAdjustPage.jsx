import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAdminUserProfile, fetchUsers, manualVipAdjust } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'

const REASON_PRESETS = ['活动赠送', '管理员赠送', '补偿用户', '测试账号', '违规处罚']

const EMPTY_TIME = { hours: '', days: '', months: '', years: '' }

function membershipLabel(profile) {
  if (!profile) return '—'
  const vip = profile.vip
  const role = vip?.role
  if (!vip?.vipActive) return '普通会员'
  if (role === 'author') return '作者会员'
  return 'VIP会员'
}

function formatMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
}

function InfoRow({ label, value, children }) {
  return (
    <div className="admin-manual-vip-info-row">
      <span className="admin-manual-vip-info-label">{label}</span>
      <span className="admin-manual-vip-info-value">{children ?? value ?? '—'}</span>
    </div>
  )
}

export default function ManualVipAdjustPage() {
  const [searchNickname, setSearchNickname] = useState('')
  const [searchUsername, setSearchUsername] = useState('')
  const [searchTgId, setSearchTgId] = useState('')
  const [searching, setSearching] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [selectedTgId, setSelectedTgId] = useState('')
  const [membershipType, setMembershipType] = useState('')
  const [initialMembership, setInitialMembership] = useState('')
  const [preset, setPreset] = useState('')
  const [addTime, setAddTime] = useState({ ...EMPTY_TIME })
  const [subTime, setSubTime] = useState({ ...EMPTY_TIME })
  const [reason, setReason] = useState('')

  const logs = useMemo(() => {
    const list = profile?.systemLogs || []
    return list.filter((row) => /vip|role|manual|gift|deduct|extend|reduce/i.test(String(row.action || '')))
  }, [profile])

  const loadProfile = useCallback(async (tgId) => {
    const id = String(tgId || '').trim().replace(/^@/, '')
    if (!id) return
    setLoadingProfile(true)
    setError('')
    try {
      const data = await fetchAdminUserProfile({ token: getToken(), tgId: id })
      if (!data) throw new Error('未找到用户')
      setProfile(data)
      setSelectedTgId(data.tgId)
      const vip = data.vip
      const nextMembership = !vip?.vipActive ? 'normal' : vip.role === 'author' ? 'author' : 'vip'
      setMembershipType(nextMembership)
      setInitialMembership(nextMembership)
      setPreset('')
      setAddTime({ ...EMPTY_TIME })
      setSubTime({ ...EMPTY_TIME })
    } catch (err) {
      setProfile(null)
      setError(err?.message || '加载用户失败')
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  const onSearch = async () => {
    setSearching(true)
    setError('')
    setMessage('')
    try {
      const tgIdRaw = searchTgId.trim().replace(/^tg_/i, '').replace(/^@/, '')
      if (tgIdRaw && /^\d+$/.test(tgIdRaw)) {
        await loadProfile(tgIdRaw)
        return
      }
      const data = await fetchUsers({ token: getToken() })
      const users = Array.isArray(data?.users) ? data.users : []
      const nick = searchNickname.trim().toLowerCase()
      const user = searchUsername.trim().replace(/^@/, '').toLowerCase()
      const match = users.find((row) => {
        const name = String(row.nickname || row.firstName || '').toLowerCase()
        const uname = String(row.username || '').toLowerCase()
        if (nick && !name.includes(nick)) return false
        if (user && uname !== user && !uname.includes(user)) return false
        if (tgIdRaw && String(row.telegramId || row.tgId || '') !== tgIdRaw) return false
        return nick || user || tgIdRaw
      })
      if (!match) throw new Error('未找到匹配用户')
      await loadProfile(match.telegramId || match.tgId)
    } catch (err) {
      setError(err?.message || '查询失败')
    } finally {
      setSearching(false)
    }
  }

  const onRefresh = () => {
    if (selectedTgId) void loadProfile(selectedTgId)
  }

  const onCancel = () => {
    setMembershipType(initialMembership)
    setPreset('')
    setAddTime({ ...EMPTY_TIME })
    setSubTime({ ...EMPTY_TIME })
    setReason('')
    setMessage('')
    setError('')
  }

  const buildTimePayload = () => {
    const hasAdd = Object.values(addTime).some((v) => Number(v) > 0)
    const hasSub = Object.values(subTime).some((v) => Number(v) > 0)
    if (hasAdd) {
      return {
        direction: 'add',
        hours: Number(addTime.hours) || 0,
        days: Number(addTime.days) || 0,
        months: Number(addTime.months) || 0,
        years: Number(addTime.years) || 0,
      }
    }
    if (hasSub) {
      return {
        direction: 'sub',
        hours: Number(subTime.hours) || 0,
        days: Number(subTime.days) || 0,
        months: Number(subTime.months) || 0,
        years: Number(subTime.years) || 0,
      }
    }
    return null
  }

  const onSave = async () => {
    if (!selectedTgId) {
      setError('请先查询用户')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const timeDelta = buildTimePayload()
      const next = await manualVipAdjust({
        token: getToken(),
        tgId: selectedTgId,
        payload: {
          membershipType: membershipType !== initialMembership ? membershipType : undefined,
          preset: preset || undefined,
          timeDelta: timeDelta || undefined,
          note: reason.trim(),
        },
      })
      if (next) {
        setProfile(next)
        const vip = next.vip
        const nextMembership = !vip?.vipActive ? 'normal' : vip.role === 'author' ? 'author' : 'vip'
        setMembershipType(nextMembership)
        setInitialMembership(nextMembership)
      }
      setMessage('已保存修改')
      setPreset('')
      setAddTime({ ...EMPTY_TIME })
      setSubTime({ ...EMPTY_TIME })
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const basic = profile?.basic
  const vip = profile?.vip

  return (
    <section className="admin-panel admin-manual-vip-page">
      {error ? <p className="admin-error admin-manual-vip-alert">{error}</p> : null}
      {message ? <p className="admin-success admin-manual-vip-alert">{message}</p> : null}

      <div className="admin-novel-mgmt-table-card admin-manual-vip-card">
        <h4 className="admin-manual-vip-section-title">搜索用户</h4>
        <div className="admin-manual-vip-search-grid">
          <label className="admin-reading-mgmt-field">
            <span>搜索昵称</span>
            <input className="admin-input" value={searchNickname} onChange={(e) => setSearchNickname(e.target.value)} />
          </label>
          <label className="admin-reading-mgmt-field">
            <span>搜索 Username</span>
            <input className="admin-input" value={searchUsername} onChange={(e) => setSearchUsername(e.target.value)} placeholder="@username" />
          </label>
          <label className="admin-reading-mgmt-field">
            <span>搜索 Telegram ID</span>
            <input className="admin-input" value={searchTgId} onChange={(e) => setSearchTgId(e.target.value)} />
          </label>
        </div>
        <div className="admin-manual-vip-search-actions">
          <button className="admin-btn admin-btn-primary" type="button" disabled={searching} onClick={onSearch}>
            {searching ? '查询中…' : '查询'}
          </button>
          <button className="admin-btn" type="button" onClick={onRefresh} disabled={!selectedTgId || loadingProfile}>
            刷新
          </button>
        </div>
      </div>

      {loadingProfile ? <p className="admin-table-empty">加载用户信息…</p> : null}

      {profile ? (
        <>
          <div className="admin-novel-mgmt-table-card admin-manual-vip-card">
            <h4 className="admin-manual-vip-section-title">用户信息</h4>
            <div className="admin-manual-vip-user-grid">
              <div className="admin-manual-vip-avatar-wrap">
                {basic?.avatar ? (
                  <img className="admin-manual-vip-avatar" src={basic.avatar} alt="" />
                ) : (
                  <div className="admin-manual-vip-avatar admin-manual-vip-avatar--empty">👤</div>
                )}
              </div>
              <div className="admin-manual-vip-info-grid">
                <InfoRow label="昵称" value={basic?.nickname} />
                <InfoRow label="Telegram ID" value={basic?.telegramId} />
                <InfoRow label="Username" value={basic?.username} />
                <InfoRow label="当前会员状态" value={membershipLabel(profile)} />
                <InfoRow label="开始时间" value={vip?.startAt} />
                <InfoRow label="到期时间" value={vip?.expireAt} />
                <InfoRow label="剩余VIP时间" value={vip?.remainingLabel} />
                <InfoRow label="累计消费金额" value={formatMoney(vip?.totalSpendUsd)} />
              </div>
            </div>
          </div>

          <div className="admin-novel-mgmt-table-card admin-manual-vip-card">
            <h4 className="admin-manual-vip-section-title">会员调整</h4>
            <div className="admin-manual-vip-chip-row">
              {[
                { key: 'normal', label: '切换普通会员' },
                { key: 'vip', label: '切换VIP会员' },
                { key: 'author', label: '切换作者会员' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={['admin-manual-vip-chip', membershipType === item.key ? 'admin-manual-vip-chip--active' : ''].join(' ')}
                  onClick={() => setMembershipType(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-novel-mgmt-table-card admin-manual-vip-card">
            <h4 className="admin-manual-vip-section-title">VIP时间管理</h4>
            <div className="admin-manual-vip-time-block">
              <p className="admin-manual-vip-time-label">增加</p>
              <div className="admin-manual-vip-time-grid">
                {[
                  ['hours', '小时'],
                  ['days', '天数'],
                  ['months', '月份'],
                  ['years', '年份'],
                ].map(([key, label]) => (
                  <label key={`add-${key}`} className="admin-reading-mgmt-field">
                    <span>增加{label}</span>
                    <input
                      className="admin-input"
                      type="number"
                      min="0"
                      value={addTime[key]}
                      onChange={(e) => {
                        setSubTime({ ...EMPTY_TIME })
                        setAddTime((p) => ({ ...p, [key]: e.target.value }))
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="admin-manual-vip-time-block">
              <p className="admin-manual-vip-time-label">减少</p>
              <div className="admin-manual-vip-time-grid">
                {[
                  ['hours', '小时'],
                  ['days', '天数'],
                  ['months', '月份'],
                  ['years', '年份'],
                ].map(([key, label]) => (
                  <label key={`sub-${key}`} className="admin-reading-mgmt-field">
                    <span>减少{label}</span>
                    <input
                      className="admin-input"
                      type="number"
                      min="0"
                      value={subTime[key]}
                      onChange={(e) => {
                        setAddTime({ ...EMPTY_TIME })
                        setSubTime((p) => ({ ...p, [key]: e.target.value }))
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="admin-manual-vip-chip-row">
              {[
                { key: 'clear', label: '清空VIP时间' },
                { key: 'gift_30', label: '赠送30天' },
                { key: 'gift_90', label: '赠送90天' },
                { key: 'gift_180', label: '赠送180天' },
                { key: 'gift_365', label: '赠送365天' },
                { key: 'permanent', label: '永久VIP' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={['admin-manual-vip-chip', preset === item.key ? 'admin-manual-vip-chip--active' : ''].join(' ')}
                  onClick={() => setPreset((p) => (p === item.key ? '' : item.key))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-novel-mgmt-table-card admin-manual-vip-card">
            <h4 className="admin-manual-vip-section-title">操作原因</h4>
            <textarea
              className="admin-input admin-manual-vip-reason"
              rows={3}
              placeholder="请输入原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="admin-manual-vip-chip-row">
              {REASON_PRESETS.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="admin-manual-vip-chip admin-manual-vip-chip--ghost"
                  onClick={() => setReason(text)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-novel-mgmt-table-card admin-manual-vip-card">
            <h4 className="admin-manual-vip-section-title">操作日志</h4>
            <div className="admin-table-wrap">
              <table className="admin-table admin-manual-vip-log-table">
                <thead>
                  <tr>
                    <th>管理员</th>
                    <th>操作时间</th>
                    <th>修改前</th>
                    <th>修改后</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length ? (
                    logs.map((row) => (
                      <tr key={row.id}>
                        <td>{row.adminName || '—'}</td>
                        <td>{row.atLabel || '—'}</td>
                        <td className="admin-manual-vip-log-json">{row.before ? JSON.stringify(row.before) : '—'}</td>
                        <td className="admin-manual-vip-log-json">{row.after ? JSON.stringify(row.after) : '—'}</td>
                        <td>{row.note || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="admin-table-empty">
                        暂无操作日志
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-manual-vip-footer">
            <button className="admin-btn admin-btn-primary" type="button" disabled={saving} onClick={onSave}>
              {saving ? '保存中…' : '保存修改'}
            </button>
            <button className="admin-btn" type="button" onClick={onCancel}>
              取消
            </button>
            <button className="admin-btn" type="button" onClick={onRefresh}>
              刷新
            </button>
            <Link className="admin-btn" to="/admin/orders">
              返回订单列表
            </Link>
          </div>
        </>
      ) : null}
    </section>
  )
}
