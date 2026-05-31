import { useEffect, useMemo, useState } from 'react'
import { fetchUsers } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'

const TYPE_LABEL = {
  normal: '普通',
  vip: 'VIP',
  author: '作者',
}
const BAN_OVERRIDE_STORAGE_KEY = 'admin_account_ban_overrides'
const USER_TYPE_OVERRIDE_STORAGE_KEY = 'admin_account_type_overrides'
const MEMBERSHIP_OVERRIDE_STORAGE_KEY = 'admin_account_membership_overrides'
const FINANCE_OVERRIDE_STORAGE_KEY = 'admin_account_finance_overrides'
const PURCHASE_MINUTES_MAP = {
  normal: { 1: 180, 3: 720, 5: 1440 },
  author: { 1: 300, 3: 1080, 5: 2160 },
}

function hasReadingVip(row) {
  if (row?.userType === 'normal') return false
  return Number(row?.remainingMinutes || 0) > 0 && String(row?.expiresAt || '').trim() !== '-'
}

function getDefaultMinutesByBaseType(baseType) {
  const tier = baseType === 'author' ? 'author' : 'normal'
  return PURCHASE_MINUTES_MAP[tier]?.[1] || 0
}

const DEMO_ACCOUNT_ROWS = [
  {
    id: 'demo-normal-1',
    avatar: '',
    nickname: '演示普通会员',
    username: 'demo_normal',
    tgId: '10001',
    userType: 'normal',
    registeredAt: '2026-04-20 09:00:00',
    registerIp: 'Phnom Penh',
    loginIp: 'Phnom Penh',
    remainingMinutes: 120,
    expiresAt: '2026-04-30 18:00:00',
    banType: 'normal',
    financeRows: [{ id: 'f1', amount: '$1', abaNo: 'ABA-10001', status: '成功' }],
  },
  {
    id: 'demo-vip-1',
    avatar: '',
    nickname: '演示VIP会员',
    username: 'demo_vip',
    tgId: '10002',
    userType: 'vip',
    registeredAt: '2026-04-21 10:20:00',
    registerIp: 'Siem Reap',
    loginIp: 'Phnom Penh',
    remainingMinutes: 560,
    expiresAt: '2026-06-01 08:00:00',
    banType: 'normal',
    financeRows: [{ id: 'f2', amount: '$5', abaNo: 'ABA-10002', status: '成功' }],
  },
  {
    id: 'demo-author-1',
    avatar: '',
    nickname: '演示作者会员',
    username: 'demo_author',
    tgId: '10003',
    userType: 'author',
    registeredAt: '2026-04-22 14:40:00',
    registerIp: 'Battambang',
    loginIp: 'Battambang',
    remainingMinutes: 0,
    expiresAt: '-',
    banType: 'normal',
    financeRows: [{ id: 'f3', amount: '$3', abaNo: 'ABA-10003', status: '成功' }],
  },
]

function normalizeType(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'vip') return 'vip'
  if (text === 'author') return 'author'
  return 'normal'
}

function normalizeFinanceRows(row = {}) {
  const rowLevelTime =
    row.lastPurchaseTime ||
    row.latestOrderTime ||
    row.orderTime ||
    row.purchaseTime ||
    row.paidAt ||
    row.payTime ||
    row.createdAt ||
    row.updatedAt ||
    '-'
  const source = Array.isArray(row.financeRecords)
    ? row.financeRecords
    : Array.isArray(row.rechargeRecords)
      ? row.rechargeRecords
      : Array.isArray(row.transactions)
        ? row.transactions
        : []
  return source.map((item, idx) => ({
    id: String(item.id || item.orderNo || idx),
    amount: item.amount || item.rechargeAmount || '$0',
    payMethod: item.payMethod || item.channel || item.abaNo || item.abaOrderNo || item.bankRef || '-',
    status: String(item.status || item.result || '-'),
    time:
      item.createdAt ||
      item.time ||
      item.paidAt ||
      item.payTime ||
      item.purchaseTime ||
      item.orderTime ||
      item.created_time ||
      item.pay_at ||
      item.updatedAt ||
      rowLevelTime ||
      '-',
  }))
}

function normalizeUsers(data) {
  const list = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : []
  return list.map((row, idx) => ({
    id: String(row.tgId || row.telegramId || row.userId || row.id || idx),
    avatar: row.avatar || row.avatarUrl || row.photoUrl || '',
    nickname: row.firstName || row.name || row.displayName || '-',
    username: row.username || row.tgUsername || '-',
    tgId: String(row.tgId || row.telegramId || row.userId || row.id || '-'),
    userType: normalizeType(row.userType || row.role || row.level),
    registeredAt: row.registeredAt || row.createdAt || row.registerTime || '-',
    registerIp: row.registerIp || row.registerLocation || row.registerCity || '-',
    loginIp: row.loginIp || row.currentIp || row.loginLocation || '-',
    remainingMinutes: Number(row.remainingMinutes ?? row.leftMinutes ?? row.durationLeft ?? 0),
    expiresAt: row.expiresAt || row.expiredAt || row.expireTime || '-',
    banType: row.isBanned || row.banned ? 'banned' : 'normal',
    financeRows: normalizeFinanceRows(row),
  }))
}

function loadBanOverrides() {
  try {
    const text = window.localStorage.getItem(BAN_OVERRIDE_STORAGE_KEY)
    if (!text) return {}
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveBanOverrides(map) {
  try {
    window.localStorage.setItem(BAN_OVERRIDE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore localStorage failures silently
  }
}

function loadUserTypeOverrides() {
  try {
    const text = window.localStorage.getItem(USER_TYPE_OVERRIDE_STORAGE_KEY)
    if (!text) return {}
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveUserTypeOverrides(map) {
  try {
    window.localStorage.setItem(USER_TYPE_OVERRIDE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore localStorage failures silently
  }
}

function loadMembershipOverrides() {
  try {
    const text = window.localStorage.getItem(MEMBERSHIP_OVERRIDE_STORAGE_KEY)
    if (!text) return {}
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveMembershipOverrides(map) {
  try {
    window.localStorage.setItem(MEMBERSHIP_OVERRIDE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore localStorage failures silently
  }
}

function loadFinanceOverrides() {
  try {
    const text = window.localStorage.getItem(FINANCE_OVERRIDE_STORAGE_KEY)
    if (!text) return {}
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveFinanceOverrides(map) {
  try {
    window.localStorage.setItem(FINANCE_OVERRIDE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore localStorage failures silently
  }
}

function resolveOverrideValue(map, row) {
  if (!map || typeof map !== 'object') return undefined
  const byId = map[row.id]
  if (byId !== undefined) return byId
  return map[row.tgId]
}

function applyBanOverrides(rows, overrides) {
  return rows.map((row) => {
    const override = resolveOverrideValue(overrides, row)
    if (override !== 'normal' && override !== 'banned') return row
    return { ...row, banType: override }
  })
}

function applyUserTypeOverrides(rows, overrides) {
  return rows.map((row) => {
    const override = resolveOverrideValue(overrides, row)
    if (override !== 'normal' && override !== 'vip' && override !== 'author') return row
    return { ...row, userType: override }
  })
}

function applyMembershipOverrides(rows, overrides) {
  return rows.map((row) => {
    const override = resolveOverrideValue(overrides, row)
    if (!override || typeof override !== 'object') return row
    const remainingMinutes = Number(override.remainingMinutes)
    const expiresAt = String(override.expiresAt || '').trim()
    if (!Number.isFinite(remainingMinutes) || !expiresAt) return row
    return {
      ...row,
      remainingMinutes: Math.max(0, remainingMinutes),
      expiresAt,
    }
  })
}

function applyFinanceOverrides(rows, overrides) {
  return rows.map((row) => {
    const override = resolveOverrideValue(overrides, row)
    if (!Array.isArray(override) || !override.length) return row
    return {
      ...row,
      financeRows: override.map((item, idx) => ({
        id: String(item.id || `manual-${idx}`),
        amount: String(item.amount || '-'),
        payMethod: String(item.payMethod || item.abaNo || '-'),
        status: String(item.status || '-'),
        time: String(item.time || '-'),
      })),
    }
  })
}

function buildManualFinanceRows(options = {}) {
  const {
    amount = '管理手动',
    payMethod = '管理手动',
    status = '管理手动',
    time = formatDateTimeText(new Date()),
  } = options
  const id = `manual-${Date.now()}`
  return [
    {
      id,
      amount,
      payMethod,
      status,
      time,
    },
  ]
}

function toCsv(rows) {
  const headers = [
    '昵称',
    '用户名',
    'ID',
    '用户类型',
    '剩余时长(分钟)',
    '过期时间',
    '封禁类型',
    '注册IP',
    '登录IP',
  ]
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const lines = rows.map((row) =>
    [
      row.nickname,
      row.username,
      row.tgId,
      TYPE_LABEL[row.userType] || '普通',
      row.remainingMinutes,
      row.expiresAt,
      row.banType === 'banned' ? '封禁' : '正常',
      row.registerIp,
      row.loginIp,
    ]
      .map(escapeCell)
      .join(','),
  )
  return [headers.join(','), ...lines].join('\n')
}

function downloadCsv(filename, content) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatDateTimeText(date) {
  const pad2 = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function parseDateTimeText(value) {
  const text = String(value || '').trim()
  const matched = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (!matched) return null
  const [, y, m, d, hh, mm, ss = '00'] = matched
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))
  return Number.isNaN(date.getTime()) ? null : date
}

function applyMembershipExpiry(rows, options = {}) {
  const { syncOverrides = false } = options
  const now = Date.now()
  const expiredVipIds = []
  const nextRows = rows.map((row) => {
    if (!hasReadingVip(row)) return row
    const expiresAt = parseDateTimeText(row.expiresAt)
    if (!expiresAt || expiresAt.getTime() > now) return row
    if (row.userType === 'vip') expiredVipIds.push(row.id)
    return {
      ...row,
      userType: row.userType === 'vip' ? 'normal' : row.userType,
      remainingMinutes: 0,
      expiresAt: '-',
    }
  })
  if (syncOverrides && expiredVipIds.length) {
    const typeOverrides = loadUserTypeOverrides()
    const membershipOverrides = loadMembershipOverrides()
    let changed = false
    expiredVipIds.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(typeOverrides, id)) {
        delete typeOverrides[id]
        changed = true
      }
      if (Object.prototype.hasOwnProperty.call(membershipOverrides, id)) {
        delete membershipOverrides[id]
        changed = true
      }
    })
    if (changed) {
      saveUserTypeOverrides(typeOverrides)
      saveMembershipOverrides(membershipOverrides)
    }
  }
  return nextRows
}

export default function AccountProfilePage() {
  const [loading, setLoading] = useState(false)
  const [linkRefreshFlash, setLinkRefreshFlash] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [queryTick, setQueryTick] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [memberNameInput, setMemberNameInput] = useState('')
  const [memberIdInput, setMemberIdInput] = useState('')
  const [memberAccountInput, setMemberAccountInput] = useState('')
  const [banTypeInput, setBanTypeInput] = useState('all')
  const [typeInput, setTypeInput] = useState('all')
  const [filters, setFilters] = useState({
    memberName: '',
    memberId: '',
    memberAccount: '',
    banType: 'all',
    type: 'all',
  })
  const [adjustInput, setAdjustInput] = useState('0')

  useEffect(() => {
    let stop = false
    const load = async () => {
      setLoading(true)
      setError('')
      const banOverrides = loadBanOverrides()
      const userTypeOverrides = loadUserTypeOverrides()
      const membershipOverrides = loadMembershipOverrides()
      const financeOverrides = loadFinanceOverrides()
      try {
        const data = await fetchUsers({ token: getToken() })
        const normalized = normalizeUsers(data)
        if (!stop) {
          const sourceRows = normalized.length ? normalized : DEMO_ACCOUNT_ROWS
          const withTypes = applyUserTypeOverrides(sourceRows, userTypeOverrides)
          const withMembership = applyMembershipOverrides(withTypes, membershipOverrides)
          const withFinance = applyFinanceOverrides(withMembership, financeOverrides)
          const withExpiry = applyMembershipExpiry(withFinance, { syncOverrides: true })
          const finalRows = applyBanOverrides(withExpiry, banOverrides)
          setRows(finalRows)
          setSelectedId(finalRows[0]?.id || '')
        }
      } catch (err) {
        if (!stop) {
          const withTypes = applyUserTypeOverrides(DEMO_ACCOUNT_ROWS, userTypeOverrides)
          const withMembership = applyMembershipOverrides(withTypes, membershipOverrides)
          const withFinance = applyFinanceOverrides(withMembership, financeOverrides)
          const withExpiry = applyMembershipExpiry(withFinance, { syncOverrides: true })
          const finalRows = applyBanOverrides(withExpiry, banOverrides)
          setRows(finalRows)
          setSelectedId(finalRows[0]?.id || '')
          setError(err?.message || '账户资料加载失败')
        }
      } finally {
        if (!stop) setLoading(false)
      }
    }
    load()
    const timer = window.setInterval(load, 60 * 1000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [queryTick])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const name = String(row.nickname || '').toLowerCase()
      const id = String(row.tgId || '').toLowerCase()
      const account = String(row.username || '').toLowerCase()
      if (filters.type !== 'all' && row.userType !== filters.type) return false
      if (filters.banType !== 'all' && row.banType !== filters.banType) return false
      if (filters.memberName.trim() && !name.includes(filters.memberName.trim().toLowerCase())) return false
      if (filters.memberId.trim() && !id.includes(filters.memberId.trim().toLowerCase())) return false
      if (filters.memberAccount.trim() && !account.includes(filters.memberAccount.trim().toLowerCase())) return false
      return true
    })
  }, [rows, filters])

  const selected = useMemo(() => {
    return filteredRows.find((row) => row.id === selectedId) || filteredRows[0] || null
  }, [filteredRows, selectedId])

  useEffect(() => {
    if (!selected && filteredRows.length) setSelectedId(filteredRows[0].id)
  }, [selected, filteredRows])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRows((prev) => applyMembershipExpiry(prev, { syncOverrides: true }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const patchSelected = (patch) => {
    if (!selected) return
    setRows((prev) => {
      const shouldUseManualFinance =
        Object.prototype.hasOwnProperty.call(patch, 'userType') ||
        Object.prototype.hasOwnProperty.call(patch, 'remainingMinutes') ||
        Object.prototype.hasOwnProperty.call(patch, 'expiresAt')
      const hasFinanceRowsPatch = Object.prototype.hasOwnProperty.call(patch, 'financeRows')
      const mergedPatch =
        shouldUseManualFinance && !hasFinanceRowsPatch ? { ...patch, financeRows: buildManualFinanceRows() } : patch
      const nextRows = prev.map((row) => {
        if (row.id !== selected.id) return row
        const nextRow = { ...row, ...mergedPatch }
        if (hasFinanceRowsPatch || (shouldUseManualFinance && !hasFinanceRowsPatch)) {
          const appendRows = Array.isArray(mergedPatch.financeRows) ? mergedPatch.financeRows : []
          nextRow.financeRows = [...(Array.isArray(row.financeRows) ? row.financeRows : []), ...appendRows]
        }
        return nextRow
      })
      const selectedNext = nextRows.find((row) => row.id === selected.id)
      if (Object.prototype.hasOwnProperty.call(patch, 'userType')) {
        const typeOverrides = loadUserTypeOverrides()
        typeOverrides[selected.id] = patch.userType
        typeOverrides[selected.tgId] = patch.userType
        saveUserTypeOverrides(typeOverrides)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'banType')) {
        const overrides = loadBanOverrides()
        overrides[selected.id] = patch.banType
        overrides[selected.tgId] = patch.banType
        saveBanOverrides(overrides)
      }
      if (
        Object.prototype.hasOwnProperty.call(patch, 'remainingMinutes') ||
        Object.prototype.hasOwnProperty.call(patch, 'expiresAt')
      ) {
        const membershipOverrides = loadMembershipOverrides()
        const prev = membershipOverrides[selected.id] || membershipOverrides[selected.tgId] || {}
        const nextOverride = {
          ...prev,
          ...(Object.prototype.hasOwnProperty.call(patch, 'remainingMinutes')
            ? { remainingMinutes: patch.remainingMinutes }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(patch, 'expiresAt') ? { expiresAt: patch.expiresAt } : {}),
        }
        membershipOverrides[selected.id] = nextOverride
        membershipOverrides[selected.tgId] = nextOverride
        saveMembershipOverrides(membershipOverrides)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'financeRows')) {
        const financeOverrides = loadFinanceOverrides()
        const finalRows = Array.isArray(selectedNext?.financeRows) ? selectedNext.financeRows : []
        financeOverrides[selected.id] = finalRows
        financeOverrides[selected.tgId] = finalRows
        saveFinanceOverrides(financeOverrides)
      }
      if (!Object.prototype.hasOwnProperty.call(patch, 'financeRows') && shouldUseManualFinance) {
        const financeOverrides = loadFinanceOverrides()
        const finalRows = Array.isArray(selectedNext?.financeRows) ? selectedNext.financeRows : []
        financeOverrides[selected.id] = finalRows
        financeOverrides[selected.tgId] = finalRows
        saveFinanceOverrides(financeOverrides)
      }
      return nextRows
    })
  }

  const adjustMinutes = (direction) => {
    const n = Math.max(0, Number(adjustInput) || 0)
    if (!n) return
    const delta = direction === 'plus' ? n : -n
    const nextRemaining = Math.max(0, selected.remainingMinutes + delta)
    const nextExpiresAt = nextRemaining > 0 ? new Date() : null
    if (nextExpiresAt) nextExpiresAt.setMinutes(nextExpiresAt.getMinutes() + nextRemaining)
    const patch = {
      remainingMinutes: nextRemaining,
      expiresAt: nextExpiresAt ? formatDateTimeText(nextExpiresAt) : '-',
      financeRows: buildManualFinanceRows({
        status: direction === 'plus' ? '管理手动加' : '管理手动减',
      }),
    }
    patchSelected(patch)
  }

  const onManualUpgradeToVip = () => {
    if (!selected) return
    const patch = { userType: 'vip' }
    if (!hasReadingVip(selected) && (selected.userType === 'normal' || selected.userType === 'author')) {
      const bonusMinutes = getDefaultMinutesByBaseType(selected.userType)
      if (bonusMinutes > 0) {
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + bonusMinutes)
        patch.remainingMinutes = bonusMinutes
        patch.expiresAt = formatDateTimeText(expiresAt)
      }
    }
    patch.financeRows = buildManualFinanceRows({ status: 'VIP会员' })
    patchSelected(patch)
  }

  const onManualSwitchToNormal = () => {
    if (!selected) return
    patchSelected({
      userType: 'normal',
      remainingMinutes: 0,
      expiresAt: '-',
      financeRows: buildManualFinanceRows({ status: '普通会员' }),
    })
  }

  const onManualSwitchToAuthor = () => {
    if (!selected) return
    const bonusMinutes = PURCHASE_MINUTES_MAP.author[1] || 300
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + bonusMinutes)
    const patch = {
      userType: 'author',
      remainingMinutes: bonusMinutes,
      expiresAt: formatDateTimeText(expiresAt),
      financeRows: buildManualFinanceRows({ status: '作者会员' }),
    }
    patchSelected(patch)
  }

  const purchaseVipByAmount = (amount) => {
    if (!selected) return
    const tier = selected.userType === 'author' ? 'author' : 'normal'
    const addMinutes = PURCHASE_MINUTES_MAP[tier]?.[amount] || 0
    if (!addMinutes) return
    const nextRemaining = selected.remainingMinutes + addMinutes
    const nextExpiresAt = new Date()
    nextExpiresAt.setMinutes(nextExpiresAt.getMinutes() + nextRemaining)
    patchSelected({
      remainingMinutes: nextRemaining,
      expiresAt: formatDateTimeText(nextExpiresAt),
      financeRows: buildManualFinanceRows({ status: '管理手动加' }),
    })
  }

  const onQuery = () => {
    setLinkRefreshFlash(true)
    window.setTimeout(() => setLinkRefreshFlash(false), 140)
    setFilters({
      memberName: memberNameInput,
      memberId: memberIdInput,
      memberAccount: memberAccountInput,
      banType: banTypeInput,
      type: typeInput,
    })
    setSelectedId('')
    setQueryTick((v) => v + 1)
  }

  const onReset = () => {
    setMemberNameInput('')
    setMemberIdInput('')
    setMemberAccountInput('')
    setBanTypeInput('all')
    setTypeInput('all')
    setFilters({
      memberName: '',
      memberId: '',
      memberAccount: '',
      banType: 'all',
      type: 'all',
    })
    setSelectedId('')
    setQueryTick((v) => v + 1)
  }

  return (
    <section className="admin-panel">
      {linkRefreshFlash ? <div className="admin-link-refresh-flash" /> : null}
      <div className="admin-tools admin-tools-wrap admin-account-tools">
        <label className="admin-account-type-filter">
          会员名称
          <input value={memberNameInput} onChange={(e) => setMemberNameInput(e.target.value)} />
        </label>
        <label className="admin-account-type-filter">
          会员ID
          <input value={memberIdInput} onChange={(e) => setMemberIdInput(e.target.value)} />
        </label>
        <label className="admin-account-type-filter">
          会员账号
          <input value={memberAccountInput} onChange={(e) => setMemberAccountInput(e.target.value)} />
        </label>
        <label className="admin-account-type-filter">
          封禁类型
          <select value={banTypeInput} onChange={(e) => setBanTypeInput(e.target.value)}>
            <option value="all">全部</option>
            <option value="normal">正常</option>
            <option value="banned">封禁</option>
          </select>
        </label>
        <label className="admin-account-type-filter">
          用户类型
          <select value={typeInput} onChange={(e) => setTypeInput(e.target.value)}>
            <option value="all">全部</option>
            <option value="normal">普通</option>
            <option value="vip">VIP</option>
            <option value="author">作者</option>
          </select>
        </label>
        <button className="admin-btn admin-btn-primary" type="button" onClick={onQuery}>
          查询
        </button>
        <button className="admin-btn" type="button" onClick={onReset}>
          重置
        </button>
        <button
          className="admin-btn admin-btn-primary"
          type="button"
          onClick={() => downloadCsv('账户资料.csv', toCsv(filteredRows))}
        >
          导出表格
        </button>
      </div>

      {error && !/not found/i.test(error) ? <p className="admin-error">{error}</p> : null}

      {selected ? (
        <>
          <div className="admin-account-block admin-account-block-plain">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>头像</th>
                    <th>昵称</th>
                    <th>用户名</th>
                    <th>ID</th>
                    <th>用户类型</th>
                    <th>剩余时长</th>
                    <th>过期时间</th>
                    <th>封禁类型</th>
                    <th>注册IP/登录IP</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={`overview-${row.id}`}>
                      <td>
                        <img
                          className="admin-user-avatar-cell"
                          src={row.avatar || '/admin-cartoon-avatar.svg'}
                          alt="avatar"
                        />
                      </td>
                      <td>{row.nickname}</td>
                      <td>@{row.username}</td>
                      <td>{row.tgId}</td>
                      <td>{TYPE_LABEL[row.userType]}</td>
                      <td>{hasReadingVip(row) ? `${row.remainingMinutes} 分钟` : '无'}</td>
                      <td>{hasReadingVip(row) ? row.expiresAt : '无'}</td>
                      <td>{row.banType === 'banned' ? '封禁' : '正常'}</td>
                      <td>
                        注册：{row.registerIp}
                        <br />
                        登录：{row.loginIp}
                      </td>
                      <td>
                        <button
                          className="admin-btn"
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-account-block">
            <h3>1. 基础资料</h3>
            <div className="admin-account-grid">
              <p>头像</p>
              <div>
                <img
                  className="admin-user-avatar-cell"
                  src={selected.avatar || '/admin-cartoon-avatar.svg'}
                  alt="avatar"
                />
              </div>
              <p>昵称</p>
              <div>{selected.nickname}</div>
              <p>用户名</p>
              <div>@{selected.username}</div>
              <p>ID</p>
              <div>{selected.tgId}</div>
              <p>用户类型</p>
              <div className="admin-account-type-switch">
                <button className="admin-btn" type="button" onClick={onManualSwitchToNormal}>
                  普通
                </button>
                <button className="admin-btn" type="button" onClick={onManualUpgradeToVip}>
                  VIP
                </button>
                <button className="admin-btn" type="button" onClick={onManualSwitchToAuthor}>
                  作者
                </button>
                <span className="admin-account-type-tag">当前：{TYPE_LABEL[selected.userType]}</span>
              </div>
              <p>注册时间</p>
              <div>{selected.registeredAt}</div>
              <p>注册IP/登录IP</p>
              <div>
                注册：{selected.registerIp} / 登录：{selected.loginIp}
              </div>
            </div>
          </div>

          <div className="admin-account-block">
            <h3>2. 资产/时长管理</h3>
            <div className="admin-account-grid">
              <p>剩余时长</p>
              <div>{hasReadingVip(selected) ? `${selected.remainingMinutes} 分钟` : '无'}</div>
              <p>过期时间</p>
              <div>{hasReadingVip(selected) ? selected.expiresAt : '无'}</div>
              <p>手动校准</p>
              <div className="admin-account-adjust-row">
                <input
                  value={adjustInput}
                  onChange={(e) => setAdjustInput(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                />
                <button className="admin-btn admin-btn-primary" type="button" onClick={() => adjustMinutes('plus')}>
                  +
                </button>
                <button className="admin-btn" type="button" onClick={() => adjustMinutes('minus')}>
                  -
                </button>
              </div>
              <p>快捷充值</p>
              <div className="admin-account-type-switch">
                <button className="admin-btn" type="button" onClick={() => purchaseVipByAmount(1)}>
                  $1
                </button>
                <button className="admin-btn" type="button" onClick={() => purchaseVipByAmount(3)}>
                  $3
                </button>
                <button className="admin-btn" type="button" onClick={() => purchaseVipByAmount(5)}>
                  $5
                </button>
                <span className="admin-account-type-tag">
                  {selected.userType === 'author' ? '作者购买规则' : '普通购买规则'}
                </span>
              </div>
            </div>
          </div>

          <div className="admin-account-block">
            <h3>3. 封禁类型</h3>
            <div className="admin-account-ban-row">
              <button
                className={`admin-btn ${selected.banType === 'normal' ? 'admin-ban-normal-active' : ''}`}
                type="button"
                onClick={() => patchSelected({ banType: 'normal' })}
              >
                正常
              </button>
              <button
                className={`admin-btn ${selected.banType === 'banned' ? 'admin-ban-banned-active' : ''}`}
                type="button"
                onClick={() => patchSelected({ banType: 'banned' })}
              >
                封禁
              </button>
            </div>
          </div>

          <div className="admin-account-block">
            <h3>4. 财务明细</h3>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>充值金额</th>
                    <th>支付方式</th>
                    <th>状态</th>
                    <th>时间日期</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.financeRows.length ? (
                    selected.financeRows.map((item) => (
                      <tr key={item.id}>
                        <td>{item.amount}</td>
                        <td>{item.payMethod || item.abaNo || '-'}</td>
                        <td>{item.status}</td>
                        <td>{item.time || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="admin-table-empty">
                        暂无记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="admin-account-block admin-account-block-plain">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>头像</th>
                  <th>昵称</th>
                  <th>用户名</th>
                  <th>ID</th>
                  <th>用户类型</th>
                  <th>剩余时长</th>
                  <th>过期时间</th>
                  <th>封禁类型</th>
                  <th>注册IP/登录IP</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={10} className="admin-table-empty">
                    {loading ? '加载中...' : '暂无记录'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

