import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'
import NovelCoverUpload from '../components/NovelCoverUpload.jsx'
import {
  createAdminNovel,
  deleteAdminNovel,
  fetchAdminNovel,
  fetchAdminNovels,
  updateAdminNovel,
} from '../lib/novelsAdminApi.js'

const PAGE_SIZE = 20
const EMPTY_FILTERS = { title: '', author: '', genreId: '', status: '' }

const EMPTY_FORM = {
  coverUrl: '',
  title: '',
  author: '',
  genreId: '',
  tags: '',
  synopsis: '',
  status: 'ongoing',
  source: 'original',
  firstChapterTitle: '',
  firstChapterContent: '',
}

function formatMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return new Date(n).toLocaleString('zh-CN', { hour12: false })
}

function formatStatus(status) {
  return String(status) === 'completed' ? '完结' : '连载中'
}

function formatSource(source) {
  return String(source) === 'member' ? '会员创' : '原创'
}

function tagsToText(tags) {
  if (Array.isArray(tags)) return tags.join(', ')
  return String(tags || '')
}

export default function NovelManagementPage() {
  const hasLegacy = hasLegacyToken()
  const [inputFilters, setInputFilters] = useState(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('create')
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadList = useCallback(async () => {
    if (!hasLegacy) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminNovels({
        page,
        pageSize: PAGE_SIZE,
        ...appliedFilters,
      })
      setRows(Array.isArray(data?.items) ? data.items : [])
      setTotal(Number(data?.total) || 0)
    } catch (err) {
      setError(err?.message || '加载小说列表失败')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [appliedFilters, hasLegacy, page])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openCreate = () => {
    setEditorMode('create')
    setEditingId('')
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = async (row) => {
    setEditorMode('edit')
    setEditingId(row.id)
    setError('')
    try {
      const data = await fetchAdminNovel(row.id)
      const novel = data?.novel || row
      setForm({
        coverUrl: novel.coverUrl || '',
        title: novel.title || '',
        author: novel.author || '',
        genreId: novel.genreId || '',
        tags: tagsToText(novel.tags),
        synopsis: novel.synopsis || '',
        status: novel.status || 'ongoing',
        source: novel.source || 'original',
        firstChapterTitle: '',
        firstChapterContent: '',
      })
      setEditorOpen(true)
    } catch (err) {
      setError(err?.message || '加载小说详情失败')
    }
  }

  const onSave = async () => {
    if (!form.title.trim()) {
      setError('请填写小说标题')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        coverUrl: form.coverUrl.trim(),
        title: form.title.trim(),
        author: form.author.trim(),
        genreId: form.genreId.trim(),
        tags: form.tags,
        synopsis: form.synopsis.trim(),
        status: form.status,
        source: form.source,
      }
      if (editorMode === 'create') {
        payload.firstChapterTitle = form.firstChapterTitle.trim()
        payload.firstChapterContent = form.firstChapterContent
        await createAdminNovel(payload)
      } else {
        await updateAdminNovel(editingId, payload)
      }
      setEditorOpen(false)
      await loadList()
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onConfirmDelete = async () => {
    if (!deleteTarget?.id) return
    setSaving(true)
    setError('')
    try {
      await deleteAdminNovel(deleteTarget.id)
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
          标题
          <input
            value={inputFilters.title}
            onChange={(e) => setInputFilters((p) => ({ ...p, title: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field">
          作者
          <input
            value={inputFilters.author}
            onChange={(e) => setInputFilters((p) => ({ ...p, author: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field">
          题材
          <input
            value={inputFilters.genreId}
            onChange={(e) => setInputFilters((p) => ({ ...p, genreId: e.target.value }))}
          />
        </label>
        <label className="admin-reports-field">
          状态
          <select
            value={inputFilters.status}
            onChange={(e) => setInputFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="ongoing">连载中</option>
            <option value="completed">完结</option>
          </select>
        </label>
        <div className="admin-reports-filter-actions">
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={() => {
              setAppliedFilters({ ...inputFilters })
              setPage(1)
              setPageInput('1')
            }}
          >
            查询
          </button>
          <button
            className="admin-btn"
            type="button"
            onClick={() => {
              setInputFilters(EMPTY_FILTERS)
              setAppliedFilters(EMPTY_FILTERS)
              setPage(1)
              setPageInput('1')
            }}
          >
            重置
          </button>
          <button className="admin-btn admin-btn-primary" type="button" onClick={openCreate}>
            新增小说
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-novel-table">
          <thead>
            <tr>
              <th>封面</th>
              <th>标题</th>
              <th>作者</th>
              <th>题材</th>
              <th>标签</th>
              <th>状态</th>
              <th>类型</th>
              <th>章节数</th>
              <th>创建时间</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.coverUrl ? (
                      <img className="admin-novel-cover-thumb" src={row.coverUrl} alt="" />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{row.title}</td>
                  <td>{row.author || '—'}</td>
                  <td>{row.genreId || '—'}</td>
                  <td className="admin-novel-tags-cell">{tagsToText(row.tags) || '—'}</td>
                  <td>{formatStatus(row.status)}</td>
                  <td>{formatSource(row.source)}</td>
                  <td>{row.chapterCount ?? 0}</td>
                  <td>{formatMs(row.createdAtMs)}</td>
                  <td>{formatMs(row.updatedAtMs)}</td>
                  <td className="admin-novel-actions-cell">
                    <button className="admin-btn" type="button" onClick={() => openEdit(row)}>
                      编辑
                    </button>
                    <button
                      className="admin-btn"
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="admin-table-empty">
                  {loading ? '加载中...' : '暂无小说'}
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
            onClick={() => {
              const next = page - 1
              setPage(next)
              setPageInput(String(next))
            }}
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
            onClick={() => {
              const next = page + 1
              setPage(next)
              setPageInput(String(next))
            }}
          >
            下一页
          </button>
        </div>
      </div>

      {editorOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card admin-modal-card--wide">
            <p className="admin-modal-title">{editorMode === 'create' ? '新增小说' : '编辑小说'}</p>
            <div className="admin-novel-form-grid">
              <div className="admin-novel-form-cover">
                <NovelCoverUpload
                  coverUrl={form.coverUrl}
                  disabled={saving}
                  onChange={(coverUrl) => setForm((p) => ({ ...p, coverUrl }))}
                />
              </div>
              <label>
                标题 *
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </label>
              <label>
                作者
                <input value={form.author} onChange={(e) => setForm((p) => ({ ...p, author: e.target.value }))} />
              </label>
              <label>
                题材
                <input
                  value={form.genreId}
                  onChange={(e) => setForm((p) => ({ ...p, genreId: e.target.value }))}
                />
              </label>
              <label>
                标签（逗号分隔）
                <input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
              </label>
              <label>
                连载状态
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="ongoing">连载中</option>
                  <option value="completed">完结</option>
                </select>
              </label>
              <label>
                小说类型
                <select
                  value={form.source}
                  onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                >
                  <option value="original">原创</option>
                  <option value="member">会员创</option>
                </select>
              </label>
              <label className="admin-novel-form-span2">
                小说简介
                <textarea
                  rows={4}
                  value={form.synopsis}
                  onChange={(e) => setForm((p) => ({ ...p, synopsis: e.target.value }))}
                />
              </label>
              {editorMode === 'create' ? (
                <>
                  <label>
                    首章标题
                    <input
                      value={form.firstChapterTitle}
                      onChange={(e) => setForm((p) => ({ ...p, firstChapterTitle: e.target.value }))}
                    />
                  </label>
                  <label className="admin-novel-form-span2">
                    首章内容
                    <textarea
                      rows={6}
                      value={form.firstChapterContent}
                      onChange={(e) => setForm((p) => ({ ...p, firstChapterContent: e.target.value }))}
                    />
                  </label>
                </>
              ) : null}
            </div>
            <div className="admin-modal-actions">
              <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={() => setEditorOpen(false)}>
                取消
              </button>
              <button
                className="admin-btn admin-btn-primary"
                type="button"
                disabled={saving}
                onClick={onSave}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card">
            <p className="admin-modal-title">确认删除小说？</p>
            <p className="admin-modal-sub">
              将删除「{deleteTarget.title}」及全部章节，并清理相关阅读记录与举报关联。
            </p>
            <div className="admin-modal-actions">
              <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button
                className="admin-btn admin-btn-primary"
                type="button"
                disabled={saving}
                onClick={onConfirmDelete}
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
