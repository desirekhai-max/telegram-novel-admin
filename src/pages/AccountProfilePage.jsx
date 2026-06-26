import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { adminUserAction, adminUserVipPurchase, fetchAdminUserProfile, fetchUsers } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'
import { resolveApiAssetUrl } from '../lib/apiBase.js'
import { fetchAdminVipPlans } from '../lib/vipPlansAdminApi.js'
import { patchAdminUserFlags } from '../lib/usersApi.js'

const VIP_PLAN_LABELS = {
  vip_entry: '入门',
  vip_standard: '标准',
  vip_premium: '高级',
}

const VIP_PURCHASE_FALLBACK = [
  { planId: 'vip_entry', priceUsdLabel: '$1', durationHours: 3 },
  { planId: 'vip_standard', priceUsdLabel: '$3', durationHours: 12 },
  { planId: 'vip_premium', priceUsdLabel: '$5', durationHours: 24 },
]

function ProfileSection({ title, children }) {
  return (
    <section className="admin-account-profile-section">
      <div className="admin-account-profile-section-head">
        <span className="admin-account-profile-section-line" aria-hidden />
        <h3>{title}</h3>
        <span className="admin-account-profile-section-line" aria-hidden />
      </div>
      <div className="admin-account-profile-section-body">{children}</div>
    </section>
  )
}

function ProfileGrid({ rows }) {
  return (
    <dl className="admin-account-profile-grid">
      {rows.map((row) => (
        <div key={row.label} className={row.wide ? 'is-wide' : undefined}>
          <dt>{row.label}</dt>
          <dd>{row.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatusBadge({ status, variant }) {
  const className = variant === 'banned' ? 'is-banned' : variant === 'vip' ? 'is-vip' : ''
  return <span className={`admin-account-profile-badge ${className}`.trim()}>{status}</span>
}

function formatMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value || '—')
  return `$${n.toFixed(2)}`
}

function normalizeUserRows(data) {
  const list = Array.isArray(data?.users) ? data.users : []
  return list.map((row, idx) => {
    const tgId = String(row.tgId || row.telegramId || row.userId || row.id || idx)
    return {
      tgId,
      nickname: String(row.nickname || row.firstName || row.displayName || '').trim(),
      username: String(row.username || row.tgUsername || '').trim().replace(/^@/, ''),
      whitelist: Boolean(row?.whitelist),
    }
  })
}

function matchUserRow(row, { nickname, username, userId }) {
  const idKey = String(userId || '').trim()
  if (idKey && row.tgId !== idKey) return false
  const nameKey = String(nickname || '').trim().toLowerCase()
  if (nameKey && !String(row.nickname || '').toLowerCase().includes(nameKey)) return false
  const userKey = String(username || '').trim().toLowerCase().replace(/^@/, '')
  if (userKey && !String(row.username || '').toLowerCase().includes(userKey)) return false
  return true
}

async function resolveSearchTgId({ nickname, username, userId }) {
  const id = String(userId || '').trim()
  const name = String(nickname || '').trim()
  const account = String(username || '').trim().replace(/^@/, '')
  if (!id && !name && !account) return { tgId: '', error: '请至少填写一项查询条件' }

  if (id && !name && !account) {
    return { tgId: id, error: '' }
  }

  const data = await fetchUsers({ token: getToken() })
  const rows = normalizeUserRows(data)
  const matched = rows.filter((row) => matchUserRow(row, { nickname: name, username: account, userId: id }))
  if (!matched.length) return { tgId: '', error: '未找到匹配用户' }
  if (matched.length > 1) return { tgId: '', error: '匹配到多个用户，请补充用户ID缩小范围' }
  return { tgId: matched[0].tgId, error: '' }
}

function pickVipPurchasePlans(payload, role) {
  const list =
    role === 'author'
      ? payload?.plansAuthor
      : payload?.plans
  if (!Array.isArray(list) || !list.length) return VIP_PURCHASE_FALLBACK
  return [...list].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
}

function vipPurchaseButtonLabel(plan) {
  const planId = String(plan?.planId || '').trim()
  const tier = VIP_PLAN_LABELS[planId] || planId || '套餐'
  const price = String(plan?.priceUsdLabel || '').trim()
  return price ? `VIP内购 · ${tier} ${price}` : `VIP内购 · ${tier}`
}

function applyProfileToSearchInputs(data, setters) {
  const basic = data?.basic
  if (!basic) return
  const nickname = String(basic.nickname || '').trim()
  const username = String(basic.username || '').trim().replace(/^@/, '')
  const tgId = String(basic.telegramId || '').trim()
  if (nickname && nickname !== '—') setters.setNicknameInput(nickname)
  if (username && username !== '—') setters.setUsernameInput(username)
  if (tgId) setters.setUserIdInput(tgId)
}

export default function AccountProfilePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [nicknameInput, setNicknameInput] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [userIdInput, setUserIdInput] = useState('')
  const [activeTgId, setActiveTgId] = useState('')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [vipPlansPayload, setVipPlansPayload] = useState(null)
  const [whitelist, setWhitelist] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAdminVipPlans()
      .then((data) => {
        if (!cancelled) setVipPlansPayload(data)
      })
      .catch(() => {
        if (!cancelled) setVipPlansPayload(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadProfile = useCallback(async (tgId) => {
    const id = String(tgId || '').trim()
    if (!id) {
      setProfile(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminUserProfile({ token: getToken(), tgId: id })
      if (!data) throw new Error('未找到该用户')
      setProfile(data)
      try {
        const list = await fetchUsers({ token: getToken() })
        const rows = normalizeUserRows(list)
        const row = rows.find((item) => item.tgId === id)
        setWhitelist(Boolean(row?.whitelist))
      } catch {
        setWhitelist(false)
      }
      applyProfileToSearchInputs(data, { setNicknameInput, setUsernameInput, setUserIdInput })
    } catch (err) {
      setProfile(null)
      setError(err?.message || '账户资料加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const tgId = String(searchParams.get('tgId') || '').trim()
    const from = String(searchParams.get('from') || 'id').trim()
    const nickname = String(searchParams.get('nickname') || '').trim()
    const username = String(searchParams.get('username') || '').trim().replace(/^@/, '')

    setActiveTgId(tgId)
    if (from === 'name') {
      setNicknameInput(nickname)
      setUsernameInput('')
      setUserIdInput(tgId)
    } else if (from === 'username') {
      setNicknameInput('')
      setUsernameInput(username)
      setUserIdInput(tgId)
    } else {
      setNicknameInput('')
      setUsernameInput('')
      setUserIdInput(tgId)
    }
  }, [searchParams])

  useEffect(() => {
    if (activeTgId) loadProfile(activeTgId)
    else setProfile(null)
  }, [activeTgId, loadProfile])

  const onSearch = async () => {
    setSearching(true)
    setError('')
    try {
      const { tgId, error: resolveError } = await resolveSearchTgId({
        nickname: nicknameInput,
        username: usernameInput,
        userId: userIdInput,
      })
      if (resolveError) {
        setProfile(null)
        setActiveTgId('')
        setError(resolveError)
        return
      }
      setActiveTgId(tgId)
      const params = new URLSearchParams({ tgId, from: 'id' })
      navigate(`/admin/account?${params.toString()}`, { replace: true })
    } catch (err) {
      setProfile(null)
      setActiveTgId('')
      setError(err?.message || '查询失败')
    } finally {
      setSearching(false)
    }
  }

  const onSearchKeyDown = (event) => {
    if (event.key === 'Enter') onSearch()
  }

  const runAction = async (action, extra = {}) => {
    if (!activeTgId || actionLoading) return
    setActionLoading(action)
    setError('')
    try {
      const next = await adminUserAction({
        token: getToken(),
        tgId: activeTgId,
        action,
        ...extra,
      })
      if (next) setProfile(next)
      else await loadProfile(activeTgId)
    } catch (err) {
      setError(err?.message || '操作失败')
    } finally {
      setActionLoading('')
    }
  }

  const runVipPurchase = async (planId) => {
    const loadingKey = `vip_purchase:${planId}`
    if (!activeTgId || actionLoading) return
    setActionLoading(loadingKey)
    setError('')
    try {
      const next = await adminUserVipPurchase({
        token: getToken(),
        tgId: activeTgId,
        planId,
      })
      if (next) setProfile(next)
      else await loadProfile(activeTgId)
    } catch (err) {
      setError(err?.message || 'VIP 内购失败，请稍后重试')
    } finally {
      setActionLoading('')
    }
  }

  const toggleWhitelist = async () => {
    if (!activeTgId || actionLoading) return
    setActionLoading('whitelist')
    setError('')
    try {
      const updated = await patchAdminUserFlags(activeTgId, { whitelist: !whitelist })
      setWhitelist(updated ? updated.whitelist : !whitelist)
    } catch (err) {
      setError(err?.message || '白名单状态更新失败')
    } finally {
      setActionLoading('')
    }
  }

  const basic = profile?.basic
  const vip = profile?.vip
  const reading = profile?.reading
  const vipPurchasePlans = useMemo(
    () => pickVipPurchasePlans(vipPlansPayload, vip?.role === 'author' ? 'author' : 'normal'),
    [vipPlansPayload, vip?.role],
  )
  const interaction = profile?.interaction
  const orders = profile?.orders
  const keyword = encodeURIComponent(activeTgId || basic?.nickname || '')

  return (
    <section className="admin-panel admin-account-profile">
      <div className="admin-reading-mgmt-toolbar admin-account-profile-toolbar">
        <div className="admin-reading-mgmt-filters admin-account-profile-search">
          <label className="admin-reading-mgmt-field">
            <span>名称</span>
            <input
              value={nicknameInput}
              placeholder="昵称 / 显示名"
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
          </label>
          <label className="admin-reading-mgmt-field">
            <span>用户名</span>
            <input
              value={usernameInput}
              placeholder="@username"
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
          </label>
          <label className="admin-reading-mgmt-field">
            <span>用户ID</span>
            <input
              value={userIdInput}
              placeholder="Telegram 用户 ID"
              onChange={(e) => setUserIdInput(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={onSearchKeyDown}
            />
          </label>
        </div>
        <div className="admin-reading-mgmt-actions">
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={onSearch}
            disabled={searching}
          >
            {searching ? '查询中…' : '查询资料'}
          </button>
          <button
            className="admin-btn"
            type="button"
            onClick={() => activeTgId && loadProfile(activeTgId)}
            disabled={!activeTgId || loading}
          >
            {loading ? '刷新中…' : '刷新'}
          </button>
          <Link className="admin-btn admin-account-profile-users-btn" to="/admin/users">
            用户列表
          </Link>
        </div>
      </div>

      {error ? <p className="admin-error admin-account-profile-error">{error}</p> : null}

      {!activeTgId && !searching ? (
        <p className="admin-account-profile-hint">可按名称、用户名或用户ID查询，至少填写一项</p>
      ) : null}

      {activeTgId && loading && !profile ? (
        <p className="admin-account-profile-hint">正在加载账户详情…</p>
      ) : null}

      {activeTgId && !loading && !profile && !error ? (
        <p className="admin-account-profile-hint">未找到该用户资料</p>
      ) : null}

      {profile ? (
        <div className="admin-account-profile-detail">
          <ProfileSection title="基础信息">
            <ProfileGrid
              rows={[
                {
                  label: '头像',
                  wide: true,
                  value: (
                    <img
                      className="admin-account-profile-grid-avatar"
                      src={basic.avatar ? resolveApiAssetUrl(basic.avatar) : '/admin-cartoon-avatar.svg'}
                      alt=""
                    />
                  ),
                },
                { label: '昵称', value: basic.nickname },
                { label: 'Telegram ID', value: basic.telegramId },
                { label: 'Username', value: basic.username },
                { label: '注册时间', value: basic.registeredAt },
                { label: '最后在线时间', value: basic.lastOnlineAt },
                { label: '最后登录设备', value: basic.lastDevice },
                { label: '当前IP地址', value: basic.currentIp },
                { label: 'IP归属地', value: basic.ipLocation },
                {
                  label: '账户状态',
                  value: (
                    <StatusBadge
                      status={basic.accountStatus}
                      variant={basic.isBanned ? 'banned' : 'normal'}
                    />
                  ),
                },
                { label: '白名单', value: whitelist ? '已加入' : '未加入' },
              ]}
            />
          </ProfileSection>

          <ProfileSection title="VIP资料">
            <ProfileGrid
              rows={[
                { label: '当前会员状态', value: vip.membershipStatus },
                { label: '会员类型', value: vip.membershipType },
                { label: '当前套餐', value: vip.packageName },
                { label: '套餐价格', value: vip.packagePrice },
                { label: '开始时间', value: vip.startAt },
                { label: '到期时间', value: vip.expireAt },
                { label: '剩余阅读时长', value: vip.remainingLabel },
                { label: '累计购买次数', value: vip.purchaseCount },
                { label: '累计消费金额', value: formatMoney(vip.totalSpendUsd) },
              ]}
            />
          </ProfileSection>

          <ProfileSection title="阅读数据">
            <ProfileGrid
              rows={[
                { label: '已阅读小说数量', value: reading.novelCount },
                { label: '已阅读章节数量', value: reading.chapterCount },
                { label: '累计阅读时长', value: reading.totalDurationLabel },
                { label: '最近阅读小说', value: reading.lastNovel },
                { label: '最近阅读章节', value: reading.lastChapter },
                { label: '连续阅读天数', value: reading.streakDays },
              ]}
            />
          </ProfileSection>

          <ProfileSection title="互动数据">
            <ProfileGrid
              rows={[
                { label: '评论数量', value: interaction.commentCount },
                { label: '回复数量', value: interaction.replyCount },
                { label: '收藏数量', value: interaction.favoriteCount },
                { label: '点赞数量', value: interaction.likeCount },
                { label: '举报数量', value: interaction.reportCount },
              ]}
            />
          </ProfileSection>

          <ProfileSection title="订单资料">
            <ProfileGrid
              rows={[
                { label: '订单总数', value: orders.totalCount },
                { label: '累计消费金额', value: formatMoney(orders.totalSpendUsd) },
                { label: '最近充值时间', value: orders.latestRechargeAt },
                { label: '最近充值金额', value: formatMoney(orders.latestRechargeAmount) },
                { label: '支付方式', value: orders.latestPaymentMethod },
                { label: '最近订单编号', value: orders.latestOrderNo },
              ]}
            />
          </ProfileSection>

          <ProfileSection title="登录记录">
            <div className="admin-table-wrap">
              <table className="admin-table admin-account-profile-table">
                <thead>
                  <tr>
                    <th>登录时间</th>
                    <th>登录设备</th>
                    <th>操作系统</th>
                    <th>IP地址</th>
                    <th>IP归属地</th>
                    <th>登录方式</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.loginRecords?.length ? (
                    profile.loginRecords.map((row, idx) => (
                      <tr key={`${row.at}-${idx}`}>
                        <td>{row.atLabel}</td>
                        <td>{row.device}</td>
                        <td>{row.os}</td>
                        <td>{row.ip}</td>
                        <td>{row.ipLocation}</td>
                        <td>{row.loginMethod}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="admin-table-empty">
                        暂无登录记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ProfileSection>

          <ProfileSection title="管理员操作">
            <div className="admin-account-profile-actions">
              <div className="admin-account-profile-vip-purchase-group">
                {vipPurchasePlans.map((plan) => {
                  const planId = String(plan.planId || '').trim()
                  const loadingKey = `vip_purchase:${planId}`
                  return (
                    <button
                      key={planId}
                      className="admin-btn admin-btn-primary"
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => runVipPurchase(planId)}
                    >
                      {actionLoading === loadingKey ? '处理中…' : vipPurchaseButtonLabel(plan)}
                    </button>
                  )
                })}
              </div>
              <button
                className="admin-btn"
                type="button"
                disabled={Boolean(actionLoading)}
                onClick={() => runAction('deduct_vip')}
              >
                {actionLoading === 'deduct_vip' ? '处理中…' : '扣除VIP'}
              </button>
              {basic.isBanned ? (
                <button
                  className="admin-btn admin-btn-primary"
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => runAction('unban')}
                >
                  {actionLoading === 'unban' ? '处理中…' : '解除封禁'}
                </button>
              ) : (
                <button
                  className="admin-btn"
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => runAction('ban')}
                >
                  {actionLoading === 'ban' ? '处理中…' : '封禁用户'}
                </button>
              )}
              <button
                className={`admin-btn ${whitelist ? 'admin-btn-primary' : ''}`}
                type="button"
                disabled={Boolean(actionLoading)}
                onClick={toggleWhitelist}
              >
                {actionLoading === 'whitelist'
                  ? '处理中…'
                  : whitelist
                    ? '移出白名单'
                    : '加入白名单'}
              </button>
              <Link className="admin-btn" to={`/admin/orders?keyword=${keyword}`}>
                查看订单
              </Link>
              <Link className="admin-btn" to={`/admin/reports?keyword=${keyword}`}>
                查看评论
              </Link>
              <Link className="admin-btn" to={`/admin/reports?keyword=${keyword}`}>
                查看收藏
              </Link>
              <Link className="admin-btn" to={`/admin/lists?keyword=${keyword}`}>
                查看阅读历史
              </Link>
              <Link className="admin-btn" to={`/admin/reports?keyword=${keyword}`}>
                查看举报记录
              </Link>
            </div>
          </ProfileSection>
        </div>
      ) : null}
    </section>
  )
}
