import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminVipPlans, getApiOriginLabel, getVipPlansReadSourceLabel, saveAdminVipPlans } from '../lib/vipPlansAdminApi.js'

const PLAN_ID_LABELS = {
  vip_entry: '入门套餐',
  vip_standard: '标准套餐',
  vip_premium: '高级套餐',
}

const EMPTY_PLAN = {
  planId: '',
  name: '',
  sortOrder: 1,
  featured: false,
  enabled: true,
  isAuthor: false,
  titleKm: '',
  flagKm: '',
  priceUsdLabel: '$1',
  priceHintKm: 'សិទ្ធិអាន VIP',
  durationKm: '',
  durationHours: 1,
  buyButtonKm: 'ទិញកម្រិតនេះ',
}

function sortedPlans(list = []) {
  return [...list].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
}

function planDisplayName(row) {
  const name = String(row?.name || '').trim()
  if (name) return name
  return PLAN_ID_LABELS[row?.planId] || row?.planId || '—'
}

function rowKey(row) {
  return `${String(row.planId || '').trim()}__${row.isAuthor ? 'author' : 'normal'}`
}

function mergeToRows(plans = [], plansAuthor = []) {
  const rows = [
    ...sortedPlans(plans).map((p) => ({ ...p, isAuthor: false, enabled: p.enabled !== false })),
    ...sortedPlans(plansAuthor).map((p) => ({ ...p, isAuthor: true, enabled: p.enabled !== false })),
  ]
  return sortedPlans(rows)
}

function splitFromRows(rows = []) {
  const strip = ({ isAuthor, ...rest }) => rest
  const plans = sortedPlans(rows.filter((r) => !r.isAuthor).map(strip))
  const plansAuthor = sortedPlans(rows.filter((r) => r.isAuthor).map(strip))
  return { plans, plansAuthor }
}

function DeleteConfirmModal({ open, label, onClose, onConfirm }) {
  if (!open) return null
  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="admin-modal-card admin-plans-mgmt-delete-modal" onClick={(e) => e.stopPropagation()}>
        <p className="admin-modal-title">确认删除套餐？</p>
        <p className="admin-plans-mgmt-delete-text">
          将删除「{label}」。保存后 APP 将不再展示该套餐。
        </p>
        <div className="admin-modal-actions">
          <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={onClose}>
            取消
          </button>
          <button className="admin-btn admin-plans-mgmt-delete-confirm" type="button" onClick={onConfirm}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

function PlanEditorModal({ open, title, initial, onClose, onConfirm, planIdLocked, existingKeys }) {
  const [form, setForm] = useState(EMPTY_PLAN)

  useEffect(() => {
    if (open) setForm({ ...EMPTY_PLAN, ...initial })
  }, [open, initial])

  if (!open) return null

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const key = rowKey(form)
  const duplicate = !planIdLocked && existingKeys.has(key)

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="admin-modal-card admin-plans-mgmt-modal" onClick={(e) => e.stopPropagation()}>
        <p className="admin-modal-title">{title}</p>

        <label className="admin-hfilter-modal-field">
          套餐名
          <input className="admin-input" value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </label>
        <label className="admin-hfilter-modal-field">
          套餐 ID（planId）
          <input
            className="admin-input"
            value={form.planId}
            disabled={planIdLocked}
            onChange={(e) => setField('planId', e.target.value.trim())}
          />
        </label>
        <div className="admin-plans-mgmt-modal-row">
          <label className="admin-hfilter-modal-field">
            价格
            <input
              className="admin-input"
              value={form.priceUsdLabel}
              onChange={(e) => setField('priceUsdLabel', e.target.value)}
            />
          </label>
          <label className="admin-hfilter-modal-field">
            小时
            <input
              className="admin-input"
              type="number"
              min="0"
              step="1"
              value={form.durationHours}
              onChange={(e) => setField('durationHours', Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <label className="admin-hfilter-modal-field">
          高棉文标题
          <input className="admin-input" value={form.titleKm} onChange={(e) => setField('titleKm', e.target.value)} />
        </label>
        <label className="admin-hfilter-modal-field">
          高棉文副标题
          <input className="admin-input" value={form.flagKm} onChange={(e) => setField('flagKm', e.target.value)} />
        </label>
        <label className="admin-hfilter-modal-field">
          时长文案（高棉语，APP 展示）
          <input className="admin-input" value={form.durationKm} onChange={(e) => setField('durationKm', e.target.value)} />
        </label>
        <div className="admin-plans-mgmt-modal-row">
          <label className="admin-hfilter-modal-field">
            排序
            <input
              className="admin-input"
              type="number"
              min="1"
              step="1"
              value={form.sortOrder}
              onChange={(e) => setField('sortOrder', Number(e.target.value) || 1)}
            />
          </label>
        </div>
        <label className="admin-checkbox-row admin-hfilter-modal-check">
          <input type="checkbox" checked={Boolean(form.isAuthor)} disabled={planIdLocked} onChange={(e) => setField('isAuthor', e.target.checked)} />
          作者套餐
        </label>
        <label className="admin-checkbox-row admin-hfilter-modal-check">
          <input type="checkbox" checked={form.enabled !== false} onChange={(e) => setField('enabled', e.target.checked)} />
          启用
        </label>
        <label className="admin-checkbox-row admin-hfilter-modal-check">
          <input type="checkbox" checked={Boolean(form.featured)} onChange={(e) => setField('featured', e.target.checked)} />
          APP 高亮推荐
        </label>
        {duplicate ? <p className="admin-error admin-plans-mgmt-modal-error">该 planId 在此类型下已存在</p> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            disabled={duplicate || !String(form.planId || '').trim()}
            onClick={() => {
              onConfirm({
                ...form,
                planId: String(form.planId).trim(),
                name: String(form.name || '').trim(),
                durationHours: Math.max(0, Number(form.durationHours) || 0),
                sortOrder: Number(form.sortOrder) || 1,
                enabled: form.enabled !== false,
              })
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VipPlansAdminPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [footerKm, setFooterKm] = useState('')
  const [rows, setRows] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [editor, setEditor] = useState({ open: false, index: -1 })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [readSourceLabel, setReadSourceLabel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminVipPlans()
      setFooterKm(String(data?.footerKm || ''))
      const merged = mergeToRows(data?.plans || [], data?.plansAuthor || [])
      setRows(merged)
      setSnapshot(JSON.stringify({ footerKm: data?.footerKm || '', rows: merged }))
      setReadSourceLabel(getVipPlansReadSourceLabel())
    } catch (err) {
      setError(err?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dataSourceHint = useMemo(() => {
    const parts = [`数据源 ${getApiOriginLabel()}`]
    if (readSourceLabel) parts.push(`读取自 ${readSourceLabel}`)
    return parts.join(' · ')
  }, [readSourceLabel])

  const dirty = useMemo(() => {
    if (!snapshot) return false
    return snapshot !== JSON.stringify({ footerKm, rows })
  }, [footerKm, rows, snapshot])

  const existingKeys = useMemo(() => {
    const keys = new Set(rows.map(rowKey))
    if (editor.index >= 0) keys.delete(rowKey(rows[editor.index]))
    return keys
  }, [rows, editor.index])

  const payload = useMemo(() => {
    const { plans, plansAuthor } = splitFromRows(rows)
    return {
      version: 1,
      footerKm: footerKm.trim(),
      plans,
      ...(plansAuthor.length ? { plansAuthor } : {}),
    }
  }, [footerKm, rows])

  const onSave = async () => {
    if (!payload.plans.length) {
      setError('至少保留一个普通会员套餐')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const saved = await saveAdminVipPlans(payload)
      setFooterKm(String(saved?.footerKm || footerKm))
      const merged = mergeToRows(saved?.plans || payload.plans, saved?.plansAuthor || payload.plansAuthor || [])
      setRows(merged)
      setSnapshot(JSON.stringify({ footerKm: saved?.footerKm || footerKm, rows: merged }))
      setMessage('已保存，APP 刷新后即可看到最新套餐。')
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = () => {
    if (deleteTarget == null) return
    const target = rows[deleteTarget]
    if (!target?.isAuthor && rows.filter((r) => !r.isAuthor).length <= 1) {
      setError('至少保留一个普通会员套餐')
      setDeleteTarget(null)
      return
    }
    setRows((prev) => prev.filter((_, i) => i !== deleteTarget))
    setDeleteTarget(null)
    setError('')
  }

  return (
    <section className="admin-panel admin-plans-mgmt">
      {error ? <p className="admin-error admin-plans-mgmt-alert">{error}</p> : null}
      {message ? <p className="admin-success admin-plans-mgmt-alert">{message}</p> : null}
      <p className="admin-novel-mgmt-meta admin-plans-mgmt-meta">{dataSourceHint}</p>

      <div className="admin-novel-mgmt-table-card admin-plans-mgmt-card">
        <div className="admin-novel-mgmt-table-head admin-plans-mgmt-head">
          <div>
            <h3>套餐管理</h3>
            <span className="admin-novel-mgmt-meta">
              {rows.length} 项{dirty ? ' · 有未保存更改' : ''}
            </span>
          </div>
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={() => setEditor({ open: true, index: -1 })}
          >
            + 新增套餐
          </button>
        </div>

        <div className="admin-table-wrap admin-plans-mgmt-table-wrap">
          <table className="admin-table admin-plans-mgmt-table">
            <thead>
              <tr>
                <th>套餐名</th>
                <th className="admin-plans-col-price">价格</th>
                <th className="admin-plans-col-hours">小时</th>
                <th>高棉文</th>
                <th className="admin-plans-col-author">作者套餐</th>
                <th className="admin-plans-col-status">状态</th>
                <th className="admin-plans-col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    加载中…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row, index) => (
                  <tr key={rowKey(row)}>
                    <td>
                      <div className="admin-plans-name">{planDisplayName(row)}</div>
                      <div className="admin-plans-id">{row.planId}</div>
                    </td>
                    <td className="admin-plans-price">{row.priceUsdLabel}</td>
                    <td className="admin-plans-hours">{row.durationHours}</td>
                    <td lang="km">
                      <div className="admin-plans-km-title">{row.titleKm || '—'}</div>
                      {row.flagKm ? <div className="admin-plans-km-flag">{row.flagKm}</div> : null}
                    </td>
                    <td>
                      <span
                        className={[
                          'admin-plans-author-badge',
                          row.isAuthor ? 'admin-plans-author-badge--yes' : 'admin-plans-author-badge--no',
                        ].join(' ')}
                      >
                        {row.isAuthor ? '是' : '否'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={[
                          'admin-hfilter-status',
                          row.enabled !== false ? 'admin-hfilter-status--on' : 'admin-hfilter-status--off',
                        ].join(' ')}
                        onClick={() => {
                          const next = [...rows]
                          next[index] = { ...row, enabled: row.enabled === false }
                          setRows(next)
                        }}
                      >
                        {row.enabled !== false ? '启用' : '停用'}
                      </button>
                    </td>
                    <td>
                      <div className="admin-hfilter-actions">
                        <button
                          type="button"
                          className="admin-hfilter-icon-btn admin-hfilter-icon-btn--edit"
                          onClick={() => setEditor({ open: true, index })}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="admin-hfilter-icon-btn admin-hfilter-icon-btn--danger"
                          onClick={() => setDeleteTarget(index)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    暂无套餐，点击上方按钮新增
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <label className="admin-plans-footer-field">
          <span>APP 底部共用文案（高棉语）</span>
          <input className="admin-input" value={footerKm} onChange={(e) => setFooterKm(e.target.value)} />
        </label>

        <p className="admin-plans-mgmt-tip">修改后请点击「保存所有更改」同步到 APP；停用后读者端不再展示该套餐。</p>
      </div>

      <div className="admin-plans-mgmt-footer">
        <p className="admin-plans-mgmt-footer-note">{dirty ? '有未保存的更改' : '已与服务器同步'}</p>
        <div className="admin-plans-mgmt-footer-actions">
          <button className="admin-btn" type="button" onClick={() => void load()} disabled={loading || saving}>
            重新加载
          </button>
          <button className="admin-btn admin-btn-primary" type="button" disabled={saving || loading || !dirty} onClick={onSave}>
            {saving ? '保存中…' : '保存所有更改'}
          </button>
        </div>
      </div>

      <PlanEditorModal
        open={editor.open}
        title={editor.index >= 0 ? '编辑套餐' : '新增套餐'}
        initial={
          editor.index >= 0
            ? rows[editor.index]
            : { ...EMPTY_PLAN, sortOrder: rows.length + 1 }
        }
        planIdLocked={editor.index >= 0}
        existingKeys={existingKeys}
        onClose={() => setEditor({ open: false, index: -1 })}
        onConfirm={(next) => {
          setRows((prev) => {
            const list = [...prev]
            if (editor.index >= 0) list[editor.index] = next
            else list.push(next)
            return sortedPlans(list)
          })
          setEditor({ open: false, index: -1 })
        }}
      />

      <DeleteConfirmModal
        open={deleteTarget != null}
        label={deleteTarget != null ? planDisplayName(rows[deleteTarget]) : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
