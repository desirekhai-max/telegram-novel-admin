import { useCallback, useEffect, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import { fetchAdminAppFilters, saveAdminAppFilterSection, SECTIONS } from '../lib/appFiltersAdminApi.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'

const TABS = [
  { key: 'genres', label: '题材' },
  { key: 'tags', label: '标签' },
  { key: 'status', label: '状态' },
  { key: 'wordRanges', label: '字数区间' },
  { key: 'sort', label: '排序' },
]

const EMPTY_ITEM = { id: '', label: '', enabled: true, sort: 0, pill: false, long: false }

function reindexSort(items) {
  return items.map((row, i) => ({ ...row, sort: i * 10 }))
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
  const [draft, setDraft] = useState(EMPTY_ITEM)

  const loadAll = useCallback(async () => {
    if (!hasLegacy) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminAppFilters()
      const next = {}
      for (const key of SECTIONS) {
        next[key] = { items: Array.isArray(data?.[key]?.items) ? data[key].items : [] }
      }
      setSections(next)
    } catch (err) {
      setError(err?.message || '加载筛选配置失败')
    } finally {
      setLoading(false)
    }
  }, [hasLegacy])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  if (!hasLegacy) {
    return <LegacyRequiredNotice />
  }

  const items = sections[tab]?.items || []

  const setItems = (nextItems) => {
    setSections((p) => ({ ...p, [tab]: { items: nextItems } }))
  }

  const onAdd = () => {
    const id = draft.id.trim()
    const label = draft.label.trim() || id
    if (!id) {
      setError('请填写 ID')
      return
    }
    if (items.some((r) => r.id === id)) {
      setError('ID 已存在')
      return
    }
    setError('')
    setItems(reindexSort([...items, { ...draft, id, label, enabled: true }]))
    setDraft(EMPTY_ITEM)
  }

  const onSave = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveAdminAppFilterSection(tab, reindexSort(items))
      setMessage('已保存，APP 刷新后将同步')
      await loadAll()
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const move = (index, dir) => {
    const next = [...items]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setItems(reindexSort(next))
  }

  return (
    <section className="admin-panel">
      <p className="admin-panel-kicker">APP配置</p>
      <h2 className="admin-panel-heading">首页筛选管理</h2>
      <p className="admin-panel-desc">
        修改后写入 Volume 持久化文件（filter-genres.json 等），APP 通过 GET /api/app-filters 拉取。
      </p>

      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}

      <div className="admin-tabs-row">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`admin-btn ${tab === t.key ? 'admin-btn-primary' : ''}`}
            onClick={() => {
              setTab(t.key)
              setError('')
              setMessage('')
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-filter-editor-bar">
        <label>
          ID
          <input value={draft.id} onChange={(e) => setDraft((p) => ({ ...p, id: e.target.value }))} />
        </label>
        <label>
          显示名
          <input
            value={draft.label}
            onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
          />
        </label>
        <label className="admin-checkbox-row">
          <input
            type="checkbox"
            checked={draft.pill}
            onChange={(e) => setDraft((p) => ({ ...p, pill: e.target.checked }))}
          />
          胶囊样式
        </label>
        {tab === 'wordRanges' && (
          <label className="admin-checkbox-row">
            <input
              type="checkbox"
              checked={draft.long}
              onChange={(e) => setDraft((p) => ({ ...p, long: e.target.checked }))}
            />
            长文案
          </label>
        )}
        <button className="admin-btn admin-btn-primary" type="button" onClick={onAdd}>
          新增
        </button>
        <button className="admin-btn admin-btn-primary" type="button" disabled={saving} onClick={onSave}>
          {saving ? '保存中...' : '保存当前分类'}
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>排序</th>
              <th>ID</th>
              <th>显示名</th>
              <th>启用</th>
              <th>操作</th>
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
              items.map((row, index) => (
                <tr key={row.id}>
                  <td>{row.sort}</td>
                  <td>{row.id}</td>
                  <td>
                    <input
                      value={row.label}
                      onChange={(e) => {
                        const next = [...items]
                        next[index] = { ...row, label: e.target.value }
                        setItems(next)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.enabled !== false}
                      onChange={(e) => {
                        const next = [...items]
                        next[index] = { ...row, enabled: e.target.checked }
                        setItems(next)
                      }}
                    />
                  </td>
                  <td className="admin-novel-actions-cell">
                    <button className="admin-btn" type="button" onClick={() => move(index, -1)}>
                      上移
                    </button>
                    <button className="admin-btn" type="button" onClick={() => move(index, 1)}>
                      下移
                    </button>
                    <button
                      className="admin-btn"
                      type="button"
                      onClick={() => setItems(items.filter((r) => r.id !== row.id))}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="admin-table-empty">
                  暂无项
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
