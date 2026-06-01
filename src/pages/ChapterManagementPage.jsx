import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'
import {
  createAdminChapter,
  deleteAdminChapter,
  fetchAdminChapters,
  fetchAdminNovel,
  fetchAdminNovelTitles,
  updateAdminChapter,
} from '../lib/novelsAdminApi.js'

const PAGE_SIZE = 20
const EMPTY_FORM = {
  novelId: '',
  title: '',
  content: '',
  isVip: false,
}

function formatMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return new Date(n).toLocaleString('zh-CN', { hour12: false })
}

export default function ChapterManagementPage() {
  const hasLegacy = hasLegacyToken()
  const [novelOptions, setNovelOptions] = useState([])
  const [novelFilter, setNovelFilter] = useState('')
  const [search, setSearch] = useState('')
  const [appliedNovelId, setAppliedNovelId] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('create')
  const [editing, setEditing] = useState({ novelId: '', chapterIndex: 0 })
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadTitles = useCallback(async () => {
    if (!hasLegacy) return
    try {
      const items = await fetchAdminNovelTitles()
      setNovelOptions(items)
    } catch {
      setNovelOptions([])
    }
  }, [hasLegacy])

  const loadList = useCallback(async () => {
    if (!hasLegacy) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminChapters({
        page,
        pageSize: PAGE_SIZE,
        novelId: appliedNovelId,
        search: appliedSearch,
      })
      setRows(Array.isArray(data?.items) ? data.items : [])
      setTotal(Number(data?.total) || 0)
    } catch (err) {
      setError(err?.message || '加载章节列表失败')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [appliedNovelId, appliedSearch, hasLegacy, page])

  useEffect(() => {
    loadTitles()
  }, [loadTitles])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openCreate = () => {
    setEditorMode('create')
    setEditing({ novelId: '', chapterIndex: 0 })
    setForm({
      ...EMPTY_FORM,
      novelId: appliedNovelId || novelOptions[0]?.id || '',
    })
    setEditorOpen(true)
  }

  const openEdit = async (row) => {
    setEditorMode('edit')
    setEditing({ novelId: row.novelId, chapterIndex: row.chapterIndex })
    setError('')
    try {
      const data = await fetchAdminNovel(row.novelId)
      const chapter = data?.novel?.chapters?.[row.chapterIndex]
      const body = Array.isArray(chapter?.body) ? chapter.body.join('\n') : ''
      setForm({
        novelId: row.novelId,
        title: chapter?.title || row.title || '',
        content: body,
        isVip: chapter?.isVip === true,
      })
      setEditorOpen(true)
    } catch (err) {
      setError(err?.message || '加载章节详情失败')
    }
  }

  const onSave = async () => {
    if (!form.novelId) {
      setError('请选择所属小说')
      return
    }
    if (!form.title.trim()) {
      setError('请填写章节标题')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        novelId: form.novelId,
        title: form.title.trim(),
        content: form.content,
        isVip: form.isVip,
      }
      if (editorMode === 'create') {
        await createAdminChapter(payload)
      } else {
        await updateAdminChapter(editing.novelId, editing.chapterIndex, payload)
      }
      setEditorOpen(false)
      await loadList()
      await loadTitles()
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onConfirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    setError('')
    try {
      await deleteAdminChapter(deleteTarget.novelId, deleteTarget.chapterIndex)
      setDeleteTarget(null)
      await loadList()
    } catch (err) {
      setError(err?.message || '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const pagedHint = useMemo(() => `共 ${total} 条`, [total])

  if (!hasLegacy) {
    return <LegacyRequiredNotice />
  }

  return (
    <section className="admin-panel">
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-reports-filter-bar admin-novel-filter-bar">
        <label className="admin-reports-field">
          所属小说
          <select value={novelFilter} onChange={(e) => setNovelFilter(e.target.value)}>
            <option value="">全部</option>
            {novelOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-reports-field">
          章节搜索
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="标题或小说名" />
        </label>
        <div className="admin-reports-filter-actions">
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={() => {
              setAppliedNovelId(novelFilter)
              setAppliedSearch(search)
              setPage(1)
            }}
          >
            查询
          </button>
          <button
            className="admin-btn"
            type="button"
            onClick={() => {
              setNovelFilter('')
              setSearch('')
              setAppliedNovelId('')
              setAppliedSearch('')
              setPage(1)
            }}
          >
            重置
          </button>
          <button className="admin-btn admin-btn-primary" type="button" onClick={openCreate}>
            新增章节
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-chapter-table">
          <thead>
            <tr>
              <th>所属小说</th>
              <th>章节序号</th>
              <th>章节标题</th>
              <th>字数</th>
              <th>VIP</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${row.novelId}-${row.chapterIndex}`}>
                  <td>{row.novelTitle}</td>
                  <td>{row.chapterIndex + 1}</td>
                  <td>{row.title}</td>
                  <td>{row.wordCount ?? 0}</td>
                  <td>{row.isVip ? '是' : '否'}</td>
                  <td>{formatMs(row.updatedAtMs)}</td>
                  <td className="admin-novel-actions-cell">
                    <button className="admin-btn" type="button" onClick={() => openEdit(row)}>
                      编辑
                    </button>
                    <button className="admin-btn" type="button" onClick={() => setDeleteTarget(row)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  {loading ? '加载中...' : '暂无章节'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination-row">
        <p className="admin-pagination-meta">{pagedHint}</p>
        <div className="admin-pagination-controls">
          <button
            className="admin-btn"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>
            第 {page} / {totalPages} 页
          </span>
          <button
            className="admin-btn"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      {editorOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card admin-modal-card--wide">
            <p className="admin-modal-title">{editorMode === 'create' ? '新增章节' : '编辑章节'}</p>
            <div className="admin-novel-form-grid">
              <label>
                所属小说 *
                <select
                  value={form.novelId}
                  disabled={editorMode === 'edit'}
                  onChange={(e) => setForm((p) => ({ ...p, novelId: e.target.value }))}
                >
                  <option value="">请选择</option>
                  {novelOptions.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                章节标题 *
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </label>
              <label className="admin-novel-form-span2">
                <span className="admin-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.isVip}
                    onChange={(e) => setForm((p) => ({ ...p, isVip: e.target.checked }))}
                  />
                  VIP 章节
                </span>
              </label>
              <label className="admin-novel-form-span2">
                章节内容
                <textarea
                  rows={10}
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                />
              </label>
            </div>
            <div className="admin-modal-actions">
              <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={() => setEditorOpen(false)}>
                取消
              </button>
              <button className="admin-btn admin-btn-primary" type="button" disabled={saving} onClick={onSave}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card">
            <p className="admin-modal-title">确认删除章节？</p>
            <p className="admin-modal-sub">
              将删除「{deleteTarget.novelTitle}」第 {deleteTarget.chapterIndex + 1} 章，并自动重排序号。
            </p>
            <div className="admin-modal-actions">
              <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button className="admin-btn admin-btn-primary" type="button" disabled={saving} onClick={onConfirmDelete}>
                确定删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
