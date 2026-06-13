import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import { fetchAdminAppFilters, saveAdminAppFilterSection, SECTIONS } from '../lib/appFiltersAdminApi.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'
import HomeFilterPreviewPanel from '../components/HomeFilterPreviewPanel.jsx'

const SIDE_TABS = [
  { key: 'genres', label: '题材管理' },
  { key: 'tags', label: '标签管理' },
  { key: 'status', label: '状态管理' },
  { key: 'wordRanges', label: '字数区间管理' },
  { key: 'sort', label: '排序管理' },
]

const TAB_META = {
  genres: { title: '题材管理', addBtn: '新增题材', nameCol: '名称' },
  tags: { title: '标签管理', addBtn: '新增标签', nameCol: '标签名称' },
  status: { title: '状态管理', addBtn: '新增状态', nameCol: '名称' },
  wordRanges: { title: '字数区间管理', addBtn: '新增字数区间', nameCol: '名称' },
  sort: { title: '排序管理', addBtn: '新增排序项', nameCol: '名称' },
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

  if (section === 'sort') {
    if (text === 'update' || text.includes('最新更新')) return 'update'
    if (text === 'views' || text.includes('最多阅读')) return 'views'
    if (text === 'rating' || text.includes('最高评分')) return 'rating'
    if (text === 'publish' || text.includes('最新发布')) return 'publish'
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
  const hasLegacy = hasLegacyToken()
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
    sort: { items: [] },
  })
  const [snapshot, setSnapshot] = useState(null)
  const [editor, setEditor] = useState({ open: false, mode: 'create', index: -1 })

  const loadAll = useCallback(async () => {
    if (!hasLegacy) return
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
    } catch (err) {
      setError(err?.message || '加载筛选配置失败')
    } finally {
      setLoading(false)
    }
  }, [hasLegacy])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const meta = TAB_META[tab]
  const items = sections[tab]?.items || []

  const setItems = (nextItems) => {
    setSections((p) => ({ ...p, [tab]: { items: reindexSort(nextItems) } }))
  }

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

  if (!hasLegacy) {
    return <LegacyRequiredNotice />
  }

  return (
    <section className="admin-hfilter-page">
      <header className="admin-hfilter-header">
        <div>
          <p className="admin-panel-kicker">APP配置</p>
          <h2 className="admin-panel-heading">首页筛选管理</h2>
          <p className="admin-panel-desc">配置 APP 首页筛选项，保存后 APP 将自动同步更新</p>
        </div>
      </header>

      {error ? <p className="admin-error admin-hfilter-alert">{error}</p> : null}
      {message ? <p className="admin-success admin-hfilter-alert">{message}</p> : null}

      <div className="admin-hfilter-body">
        <nav className="admin-hfilter-side" aria-label="筛选分类">
          {SIDE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={['admin-hfilter-side__item', tab === t.key ? 'admin-hfilter-side__item--active' : ''].join(
                ' ',
              )}
              onClick={() => {
                setTab(t.key)
                setError('')
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="admin-hfilter-main">
          <div className="admin-hfilter-main__toolbar">
            <h3 className="admin-hfilter-main__title">{meta.title}</h3>
            <button
              className="admin-btn admin-btn-primary"
              type="button"
              onClick={() => setEditor({ open: true, mode: 'create', index: -1 })}
            >
              + {meta.addBtn}
            </button>
          </div>

          <div className="admin-table-wrap admin-hfilter-table-wrap">
            <table className="admin-table admin-hfilter-table">
              <thead>
                <tr>
                  <th className="admin-hfilter-col-seq">序号</th>
                  <th>{meta.nameCol}</th>
                  <th className="admin-hfilter-col-status">状态</th>
                  <th className="admin-hfilter-col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="admin-table-empty">
                      加载中...
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((row, index) => (
                    <tr key={row.id}>
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
                              if (!window.confirm(`确定删除「${row.label}」？`)) return
                              setItems(items.filter((r) => r.id !== row.id))
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="admin-table-empty">
                      暂无数据，点击上方按钮新增
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="admin-hfilter-tip">
            提示：点击 ↑ ↓ 调整显示顺序；序号越小越靠前。修改后请点击底部「保存所有更改」生效。
          </p>
        </main>

        <HomeFilterPreviewPanel sections={sections} />
      </div>

      <footer className="admin-hfilter-footer">
        <button className="admin-btn admin-btn-primary" type="button" disabled={saving} onClick={onSaveAll}>
          {saving ? '保存中...' : '保存所有更改'}
        </button>
        <button className="admin-btn admin-hfilter-btn-reset" type="button" disabled={!dirty} onClick={onReset}>
          重置
        </button>
      </footer>

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
