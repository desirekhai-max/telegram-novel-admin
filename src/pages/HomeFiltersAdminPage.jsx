import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminAppFilters, getApiOriginLabel, getAppFiltersReadSourceLabel, saveAdminAppFilterSection, SECTIONS } from '../lib/appFiltersAdminApi.js'
import HomeFilterPreviewPanel from '../components/HomeFilterPreviewPanel.jsx'

const SIDE_TABS = [
  { key: 'genres', label: '题材管理' },
  { key: 'tags', label: '标签管理' },
  { key: 'status', label: '状态管理' },
  { key: 'wordRanges', label: '字数区间管理' },
]

const TAB_META = {
  genres: { title: '题材管理', addBtn: '新增题材', nameCol: '名称' },
  tags: { title: '标签管理', addBtn: '新增标签', nameCol: '标签名称' },
  status: { title: '状态管理', addBtn: '新增状态', nameCol: '名称' },
  wordRanges: { title: '字数区间管理', addBtn: '新增字数区间', nameCol: '名称' },
}

function reindexSort(items) {
  return items.map((row, i) => ({ ...row, sort: i * 10 }))
}

function sortedItems(items) {
  return [...(items || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}

function newItemId(section, label, existingIds) {
  const text = String(label || '').trim()
  if (section === 'tags') return text

  // 将运营可见文案映射为 APP 真实的筛选 value（不暴露技术字段）
  if (section === 'status') {
    if (text === 'all' || text.includes('全部') || text.includes('គ្រប់ស្ថានភាព')) return 'all'
    if (text === 'ongoing' || text.includes('连载') || text.includes('កំពុងបន្ត')) return 'ongoing'
    if (text === 'completed' || text.includes('完结') || text.includes('已完结') || text.includes('រឿងពេញ')) return 'completed'
  }

  if (section === 'wordRanges') {
    if (text === 'all' || text.includes('全部') || text.includes('ទំហំទាំងអស់')) return 'all'
    if (text.includes('10万') && text.includes('以下')) return 'w_lt_10'
    if (text.includes('10-30万') || (text.includes('10') && text.includes('30') && text.includes('-'))) return 'w_10_30'
    if (text.includes('30-50万') || (text.includes('30') && text.includes('50') && text.includes('-'))) return 'w_30_50'
    if (text.includes('50-100万') || (text.includes('50') && text.includes('100') && text.includes('-'))) return 'w_50_100'
    if (text.includes('100万') && (text.includes('以上') || text.includes('上'))) return 'w_gt_100'
  }

  if (section === 'genres') {
    if (text === 'all' || text.includes('全部') || text.includes('គ្រប់ប្រភេទ')) return 'all'
    const map = {
      都市: 'urban',
      校园: 'campus',
      乱伦: 'taboo',
      玄幻: 'xuanhuan',
      系统: 'system',
      穿越: 'transmigration',
      武侠: 'wuxia',
      奇幻: 'fantasy',
      乡村: 'rural',
      历史: 'history',
      明星: 'celebrity',
      异能: 'superpower',
      科幻: 'scifi',
      同人: 'fanfic',
      // 兼容一些旧词
      科幻小说: 'scifi',
    }
    if (map[text]) return map[text]
  }

  const ascii = text
    .toLowerCase()
    .replace(/[^\w]+/g, '_')
    .replace(/^_|_$/g, '')
  let id = ascii || `opt_${Date.now().toString(36).slice(-8)}`
  let n = 1
  while (existingIds.includes(id)) {
    id = `${ascii || 'opt'}_${n++}`
  }
  return id
}

function DeleteConfirmModal({ open, title, labels, onClose, onConfirm }) {
  if (!open) return null
  const preview = Array.isArray(labels) ? labels.filter(Boolean) : []
  const shown = preview.slice(0, 8)
  const rest = preview.length - shown.length

  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-hfilter-delete-title"
      onClick={onClose}
    >
      <div className="admin-modal-card admin-filters-mgmt-delete-modal" onClick={(e) => e.stopPropagation()}>
        <p className="admin-modal-title" id="admin-hfilter-delete-title">
          {title}
        </p>
        <p className="admin-filters-mgmt-delete-text">删除后需点击底部「保存所有更改」才会同步到 APP。</p>
        {shown.length ? (
          <ul className="admin-filters-mgmt-delete-list">
            {shown.map((label) => (
              <li key={label}>{label}</li>
            ))}
            {rest > 0 ? <li className="admin-filters-mgmt-delete-more">…还有 {rest} 项</li> : null}
          </ul>
        ) : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={onClose}>
            取消
          </button>
          <button className="admin-btn admin-filters-mgmt-delete-confirm" type="button" onClick={onConfirm}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

function ItemEditorModal({ open, title, initial, onClose, onConfirm }) {
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (open) {
      setName(initial?.label || '')
      setEnabled(initial?.enabled !== false)
    }
  }, [open, initial])

  if (!open) return null

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <p className="admin-modal-title">{title}</p>
        <label className="admin-hfilter-modal-field">
          名称
          <input
            className="admin-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="admin-checkbox-row admin-hfilter-modal-check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用
        </label>
        <div className="admin-modal-actions">
          <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={() => {
              const label = name.trim()
              if (!label) return
              onConfirm({ label, enabled })
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HomeFiltersAdminPage() {
  const [tab, setTab] = useState('genres')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sections, setSections] = useState({
    genres: { items: [] },
    tags: { items: [] },
    status: { items: [] },
    wordRanges: { items: [] },
  })
  const [snapshot, setSnapshot] = useState(null)
  const [editor, setEditor] = useState({ open: false, mode: 'create', index: -1 })
  const [selectedIds, setSelectedIds] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, ids: [] })
  const [readSourceLabel, setReadSourceLabel] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminAppFilters()
      const next = {}
      for (const key of SECTIONS) {
        next[key] = { items: sortedItems(data?.[key]?.items) }
      }
      setSections(next)
      setSnapshot(JSON.stringify(next))
      setReadSourceLabel(getAppFiltersReadSourceLabel())
    } catch (err) {
      setError(err?.message || '加载筛选配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const meta = TAB_META[tab]
  const items = sections[tab]?.items || []
  const selectableItems = useMemo(() => items.filter((row) => row.id !== 'all'), [items])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected =
    selectableItems.length > 0 && selectableItems.every((row) => selectedSet.has(row.id))

  const setItems = (nextItems) => {
    setSections((p) => ({ ...p, [tab]: { items: reindexSort(nextItems) } }))
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return [...next]
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([])
      return
    }
    setSelectedIds(selectableItems.map((row) => row.id))
  }

  const openDeleteConfirm = (ids) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))]
    if (!uniqueIds.length) return
    setDeleteConfirm({ open: true, ids: uniqueIds })
  }

  const confirmDelete = () => {
    const idSet = new Set(deleteConfirm.ids)
    if (!idSet.size) {
      setDeleteConfirm({ open: false, ids: [] })
      return
    }
    setItems(items.filter((row) => !idSet.has(row.id)))
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)))
    setDeleteConfirm({ open: false, ids: [] })
    setError('')
  }

  const deletePreviewLabels = useMemo(() => {
    const idSet = new Set(deleteConfirm.ids)
    return items.filter((row) => idSet.has(row.id)).map((row) => row.label)
  }, [deleteConfirm.ids, items])

  const move = (index, dir) => {
    const next = [...items]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setItems(next)
  }

  const onSaveAll = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      for (const key of SECTIONS) {
        await saveAdminAppFilterSection(key, sections[key].items)
      }
      setMessage('已保存，APP 将自动同步最新筛选配置')
      await loadAll()
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    if (!snapshot) return
    try {
      setSections(JSON.parse(snapshot))
      setMessage('已恢复为上次加载的数据（未写入服务器）')
      setError('')
    } catch {
      setError('无法恢复')
    }
  }

  const dirty = useMemo(() => {
    if (!snapshot) return false
    return JSON.stringify(sections) !== snapshot
  }, [sections, snapshot])

  const dataSourceHint = useMemo(() => {
    const parts = [`数据源 ${getApiOriginLabel()}`]
    if (readSourceLabel) parts.push(`读取自 ${readSourceLabel}`)
    return parts.join(' · ')
  }, [readSourceLabel])

  return (
    <section className="admin-panel admin-filters-mgmt">
      {error ? <p className="admin-error admin-filters-mgmt-alert">{error}</p> : null}
      {message ? <p className="admin-success admin-filters-mgmt-alert">{message}</p> : null}
      <p className="admin-novel-mgmt-meta admin-filters-mgmt-meta">{dataSourceHint}</p>

      <div className="admin-filters-mgmt-body">
        <nav className="admin-filters-mgmt-side" aria-label="筛选分类">
          {SIDE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={[
                'admin-filters-mgmt-side__item',
                tab === t.key ? 'admin-filters-mgmt-side__item--active' : '',
              ].join(' ')}
              onClick={() => {
                setTab(t.key)
                setSelectedIds([])
                setDeleteConfirm({ open: false, ids: [] })
                setError('')
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="admin-filters-mgmt-center">
          <div className="admin-novel-mgmt-table-card">
            <div className="admin-novel-mgmt-table-head admin-filters-mgmt-table-head">
              <div>
                <h3>{meta.title}</h3>
                <span className="admin-novel-mgmt-meta">
                  {items.length} 项{dirty ? ' · 有未保存更改' : ''}
                </span>
              </div>
              <div className="admin-filters-mgmt-table-head-actions">
                {selectedIds.length ? (
                  <button
                    className="admin-btn admin-filters-mgmt-batch-delete"
                    type="button"
                    onClick={() => openDeleteConfirm(selectedIds)}
                  >
                    删除选中 ({selectedIds.length})
                  </button>
                ) : null}
                <button
                  className="admin-btn admin-btn-primary"
                  type="button"
                  onClick={() => setEditor({ open: true, mode: 'create', index: -1 })}
                >
                  + {meta.addBtn}
                </button>
              </div>
            </div>

            <div className="admin-table-wrap admin-filters-mgmt-table-wrap">
              <table className="admin-table admin-filters-mgmt-table">
              <thead>
                <tr>
                  <th className="admin-hfilter-col-check">
                    <input
                      className="admin-filters-mgmt-check"
                      type="checkbox"
                      checked={allSelected}
                      disabled={!selectableItems.length}
                      onChange={toggleSelectAll}
                      aria-label="全选"
                    />
                  </th>
                  <th className="admin-hfilter-col-seq">序号</th>
                  <th>{meta.nameCol}</th>
                  <th className="admin-hfilter-col-status">状态</th>
                  <th className="admin-hfilter-col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="admin-table-empty">
                      加载中...
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((row, index) => {
                    const canSelect = row.id !== 'all'
                    const checked = selectedSet.has(row.id)
                    return (
                    <tr key={row.id} className={checked ? 'admin-filters-mgmt-row--selected' : undefined}>
                      <td className="admin-hfilter-col-check">
                        <input
                          className="admin-filters-mgmt-check"
                          type="checkbox"
                          checked={checked}
                          disabled={!canSelect}
                          onChange={() => toggleSelect(row.id)}
                          aria-label={`选择 ${row.label}`}
                        />
                      </td>
                      <td>
                        <span className="admin-hfilter-seq">{index + 1}</span>
                      </td>
                      <td className="admin-hfilter-name">{row.label}</td>
                      <td>
                        <button
                          type="button"
                          className={[
                            'admin-hfilter-status',
                            row.enabled !== false ? 'admin-hfilter-status--on' : 'admin-hfilter-status--off',
                          ].join(' ')}
                          onClick={() => {
                            const next = [...items]
                            next[index] = { ...row, enabled: row.enabled === false }
                            setItems(next)
                          }}
                        >
                          {row.enabled !== false ? '启用' : '停用'}
                        </button>
                      </td>
                      <td>
                        <div className="admin-hfilter-actions">
                          <button
                            type="button"
                            className="admin-hfilter-icon-btn"
                            title="上移"
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-hfilter-icon-btn"
                            title="下移"
                            disabled={index === items.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-hfilter-icon-btn admin-hfilter-icon-btn--edit"
                            title="编辑"
                            onClick={() => setEditor({ open: true, mode: 'edit', index })}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="admin-hfilter-icon-btn admin-hfilter-icon-btn--danger"
                            title="删除"
                            disabled={row.id === 'all'}
                            onClick={() => {
                              if (row.id === 'all') return
                              openDeleteConfirm([row.id])
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})
                ) : (
                  <tr>
                    <td colSpan={5} className="admin-table-empty">
                      暂无数据，点击上方按钮新增
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>

            <p className="admin-filters-mgmt-tip">
              勾选后可批量删除；点击 ↑ ↓ 调整显示顺序。修改后请点击底部「保存所有更改」生效。
            </p>
          </div>
        </div>

        <HomeFilterPreviewPanel sections={sections} />
      </div>

      <div className="admin-reading-mgmt-toolbar admin-filters-mgmt-footer">
        <p className="admin-filters-mgmt-footer-note">保存后 APP 将自动同步最新筛选配置</p>
        <div className="admin-reading-mgmt-actions">
          <button className="admin-btn admin-btn-primary" type="button" disabled={saving} onClick={onSaveAll}>
            {saving ? '保存中...' : '保存所有更改'}
          </button>
          <button className="admin-btn" type="button" disabled={!dirty} onClick={onReset}>
            重置
          </button>
        </div>
      </div>

      <DeleteConfirmModal
        open={deleteConfirm.open}
        title={
          deleteConfirm.ids.length > 1
            ? `确认删除选中的 ${deleteConfirm.ids.length} 项？`
            : '确认删除该项？'
        }
        labels={deletePreviewLabels}
        onClose={() => setDeleteConfirm({ open: false, ids: [] })}
        onConfirm={confirmDelete}
      />

      <ItemEditorModal
        open={editor.open}
        title={editor.mode === 'create' ? meta.addBtn : '编辑'}
        initial={editor.index >= 0 ? items[editor.index] : null}
        onClose={() => setEditor({ open: false, mode: 'create', index: -1 })}
        onConfirm={({ label, enabled }) => {
          if (editor.mode === 'create') {
            const ids = items.map((r) => r.id)
            const id = newItemId(tab, label, ids)
            if (ids.includes(id)) {
              setError('名称已存在')
              return
            }
            setItems([
              ...items,
              {
                id,
                label,
                enabled,
                pill: id === 'all',
                long: tab === 'wordRanges' && id !== 'all',
              },
            ])
          } else if (editor.index >= 0) {
            const next = [...items]
            const row = next[editor.index]
            next[editor.index] = {
              ...row,
              label,
              enabled,
              ...(tab === 'tags' ? { id: label } : {}),
            }
            setItems(next)
          }
          setEditor({ open: false, mode: 'create', index: -1 })
          setError('')
        }}
      />
    </section>
  )
}
