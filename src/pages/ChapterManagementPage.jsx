import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'
import { getApiOriginLabel } from '../lib/apiBase.js'
import {
  alignChapterRowsWithApp,
  countAppVisibleChapters,
  buildAppCatalogIdSet,
  fetchAppNovelsCatalog,
  fetchAppReaderChapterMeta,
} from '../lib/novelsCatalogApi.js'
import { formatAppCompactCount } from '../lib/novelAppDisplayStats.js'
import {
  createAdminChapter,
  deleteAdminChapter,
  fetchAdminChapters,
  fetchAdminNovel,
  fetchAdminNovelTitles,
  moveAdminChapter,
  updateAdminChapter,
} from '../lib/novelsAdminApi.js'

const PAGE_SIZE = 50
const EMPTY_FORM = {
  novelId: '',
  title: '',
  content: '',
  isVip: false,
  status: 'published',
}

function rowKey(row) {
  return `${row.novelId}-${row.chapterIndex}`
}

function formatMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return new Date(n).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCount(value) {
  return formatAppCompactCount(value)
}

function normalizeChapterStatus(value) {
  return String(value || '').trim().toLowerCase() === 'draft' ? 'draft' : 'published'
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
  const [rowBusyKey, setRowBusyKey] = useState('')
  const [appReaderChapterTotal, setAppReaderChapterTotal] = useState(0)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const canReorder = Boolean(appliedNovelId)

  const loadTitles = useCallback(async () => {
    if (!hasLegacy) return
    try {
      const [adminItems, catalog] = await Promise.all([
        fetchAdminNovelTitles(),
        fetchAppNovelsCatalog().catch(() => null),
      ])
      const byId = new Map()
      ;(Array.isArray(adminItems) ? adminItems : []).forEach((n) => {
        const id = String(n?.id || '').trim()
        if (id) byId.set(id, { id, title: n.title || id })
      })
      ;(catalog?.novels ?? []).forEach((n) => {
        const id = String(n?.id || '').trim()
        if (!id) return
        const prev = byId.get(id)
        byId.set(id, { id, title: n.title || prev?.title || id })
      })
      setNovelOptions([...byId.values()].sort((a, b) => String(a.title).localeCompare(String(b.title))))
    } catch {
      setNovelOptions([])
    }
  }, [hasLegacy])

  const loadList = useCallback(async ({ silent = false } = {}) => {
    if (!hasLegacy) return
    if (!silent) setLoading(true)
    setError('')
    try {
      const [data, catalog] = await Promise.all([
        fetchAdminChapters({
          page,
          pageSize: PAGE_SIZE,
          novelId: appliedNovelId,
          search: appliedSearch,
        }),
        fetchAppNovelsCatalog().catch(() => null),
      ])
      const catalogIds = buildAppCatalogIdSet(catalog?.novels ?? [])
      const chapterIdsByNovel = {}
      if (appliedNovelId) {
        try {
          const meta = await fetchAppReaderChapterMeta(appliedNovelId)
          chapterIdsByNovel[appliedNovelId] = meta.chapterIds
          setAppReaderChapterTotal(meta.count)
        } catch {
          setAppReaderChapterTotal(0)
        }
      } else {
        setAppReaderChapterTotal(0)
      }
      const items = alignChapterRowsWithApp(Array.isArray(data?.items) ? data.items : [], {
        catalogIds,
        chapterIdsByNovel,
      })
      setRows(items)
      setTotal(Number(data?.total) || 0)
    } catch (err) {
      setError(err?.message || '加载章节列表失败')
      setRows([])
      setTotal(0)
      setAppReaderChapterTotal(0)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [appliedNovelId, appliedSearch, hasLegacy, page])

  useEffect(() => {
    loadTitles()
  }, [loadTitles])

  useEffect(() => {
    loadList()
    const timer = window.setInterval(() => {
      void loadList({ silent: true })
    }, 15000)
    return () => window.clearInterval(timer)
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
      const body = Array.isArray(chapter?.body) ? chapter.body.join('\n') : String(chapter?.body || '')
      setForm({
        novelId: row.novelId,
        title: chapter?.title || row.title || '',
        content: body,
        isVip: chapter?.isVip === true,
        status: normalizeChapterStatus(chapter?.status ?? row.status),
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
        status: form.status,
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

  const patchChapter = async (row, patch) => {
    const key = rowKey(row)
    setRowBusyKey(key)
    setError('')
    try {
      await updateAdminChapter(row.novelId, row.chapterIndex, patch)
      await loadList()
    } catch (err) {
      setError(err?.message || '更新失败')
    } finally {
      setRowBusyKey('')
    }
  }

  const onSetFree = (row) => {
    if (!row.isVip) return
    patchChapter(row, { isVip: false })
  }

  const onSetVip = (row) => {
    if (row.isVip) return
    patchChapter(row, { isVip: true })
  }

  const onSetDraft = (row) => {
    if (normalizeChapterStatus(row.status) === 'draft') return
    patchChapter(row, { status: 'draft' })
  }

  const onSetPublished = (row) => {
    if (normalizeChapterStatus(row.status) === 'published') return
    patchChapter(row, { status: 'published' })
  }

  const onMove = async (row, direction) => {
    if (!canReorder) return
    const key = rowKey(row)
    setRowBusyKey(key)
    setError('')
    try {
      await moveAdminChapter(row.novelId, row.chapterIndex, direction)
      await loadList()
    } catch (err) {
      setError(err?.message || '排序失败')
    } finally {
      setRowBusyKey('')
    }
  }

  const pagedHint = useMemo(() => `共 ${total} 条`, [total])
  const appVisibleOnPage = useMemo(() => countAppVisibleChapters(rows), [rows])
  const dataSourceHint = useMemo(() => {
    const base = `数据源 ${getApiOriginLabel()} · 后台 ${total} 条`
    if (appliedNovelId) {
      return `${base} · APP 读者端 ${appReaderChapterTotal} 章 · 本页可见 ${appVisibleOnPage}`
    }
    return `${base} · 本页 APP 可见 ${appVisibleOnPage}`
  }, [total, appliedNovelId, appReaderChapterTotal, appVisibleOnPage])

  if (!hasLegacy) {
    return <LegacyRequiredNotice />
  }

  return (
    <section className="admin-chapter-mgmt">
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-novel-mgmt-toolbar">
        <div className="admin-novel-mgmt-filters">
          <label className="admin-novel-mgmt-field">
            <span>所属小说</span>
            <select value={novelFilter} onChange={(e) => setNovelFilter(e.target.value)}>
              <option value="">全部</option>
              {novelOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-novel-mgmt-field">
            <span>章节搜索</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="章节名或小说名"
            />
          </label>
        </div>
        <div className="admin-novel-mgmt-actions">
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

      <div className="admin-novel-mgmt-table-card">
        <div className="admin-novel-mgmt-table-head">
          <h3>章节列表</h3>
          <span className="admin-novel-mgmt-meta">
            {dataSourceHint}
            {canReorder ? '' : ' · 筛选单本小说后可排序'}
          </span>
        </div>
        <div className="admin-table-wrap admin-novel-mgmt-table-wrap">
          <table className="admin-table admin-novel-mgmt-table admin-chapter-mgmt-table">
            <thead>
              <tr>
                <th>章节ID</th>
                <th>章节名</th>
                <th>APP 可见</th>
                <th>字数</th>
                <th>更新时间</th>
                <th>免费</th>
                <th>VIP</th>
                <th>草稿</th>
                <th>发布</th>
                <th>排序</th>
                <th>编辑</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => {
                  const busy = rowBusyKey === rowKey(row)
                  const isDraft = normalizeChapterStatus(row.status) === 'draft'
                  const isPublished = !isDraft
                  return (
                    <tr key={rowKey(row)}>
                      <td className="admin-chapter-mgmt-id">{row.chapterId || '—'}</td>
                      <td className="admin-chapter-mgmt-title">
                        <span className="admin-chapter-mgmt-title-text">{row.title}</span>
                        {!appliedNovelId ? (
                          <span className="admin-chapter-mgmt-novel">{row.novelTitle}</span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`admin-novel-mgmt-app ${row.appVisible ? 'is-visible' : 'is-hidden'}`}
                          title={
                            row.appVisible
                              ? '读者端可阅读（GET /api/novels/:id 已发布章节）'
                              : '草稿、未上架小说或不在 APP 目录，读者端不可见'
                          }
                        >
                          {row.appVisible ? '可见' : '不可见'}
                        </span>
                      </td>
                      <td className="admin-novel-mgmt-num">{formatCount(row.wordCount)}</td>
                      <td className="admin-novel-mgmt-time">{formatMs(row.updatedAtMs)}</td>
                      <td>
                        <button
                          type="button"
                          className={`admin-chapter-mgmt-flag ${!row.isVip ? 'is-active' : ''}`}
                          disabled={busy}
                          onClick={() => onSetFree(row)}
                        >
                          免费
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`admin-chapter-mgmt-flag admin-chapter-mgmt-flag--vip ${row.isVip ? 'is-active' : ''}`}
                          disabled={busy}
                          onClick={() => onSetVip(row)}
                        >
                          VIP
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`admin-chapter-mgmt-flag admin-chapter-mgmt-flag--draft ${isDraft ? 'is-active' : ''}`}
                          disabled={busy}
                          onClick={() => onSetDraft(row)}
                        >
                          草稿
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`admin-chapter-mgmt-flag admin-chapter-mgmt-flag--publish ${isPublished ? 'is-active' : ''}`}
                          disabled={busy}
                          onClick={() => onSetPublished(row)}
                        >
                          发布
                        </button>
                      </td>
                      <td>
                        <div className="admin-chapter-mgmt-sort">
                          <button
                            type="button"
                            className="admin-chapter-mgmt-sort-btn"
                            disabled={busy || !canReorder || row.chapterIndex <= 0}
                            title={canReorder ? '上移' : '请先筛选单本小说'}
                            onClick={() => onMove(row, 'up')}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-chapter-mgmt-sort-btn"
                            disabled={
                              busy
                              || !canReorder
                              || row.chapterIndex >= Number(row.chapterCount || 1) - 1
                            }
                            title={canReorder ? '下移' : '请先筛选单本小说'}
                            onClick={() => onMove(row, 'down')}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="admin-novel-mgmt-row-actions">
                          <button
                            className="admin-novel-mgmt-act"
                            type="button"
                            disabled={busy}
                            onClick={() => openEdit(row)}
                          >
                            编辑
                          </button>
                          <button
                            className="admin-novel-mgmt-act admin-novel-mgmt-act--danger"
                            type="button"
                            disabled={busy}
                            onClick={() => setDeleteTarget(row)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={11} className="admin-table-empty">
                    {loading ? '加载中...' : '暂无章节'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-pagination-row admin-novel-mgmt-pagination">
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
          <div className="admin-modal-card admin-modal-card--wide admin-modal-card--scrollable">
            <div className="admin-modal-sticky-head">
              <p className="admin-modal-title">{editorMode === 'create' ? '新增章节' : '编辑章节'}</p>
            </div>
            <div className="admin-modal-scroll-body">
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
                  章节名 *
                  <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                </label>
                <label>
                  访问权限
                  <select
                    value={form.isVip ? 'vip' : 'free'}
                    onChange={(e) => setForm((p) => ({ ...p, isVip: e.target.value === 'vip' }))}
                  >
                    <option value="free">免费</option>
                    <option value="vip">VIP</option>
                  </select>
                </label>
                <label>
                  发布状态
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="published">发布</option>
                    <option value="draft">草稿</option>
                  </select>
                </label>
                <label className="admin-novel-form-span2">
                  小说文章
                  <textarea
                    rows={12}
                    value={form.content}
                    onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                    placeholder="章节正文内容"
                  />
                </label>
              </div>
            </div>
            <div className="admin-modal-actions admin-modal-actions--sticky">
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
              将删除「{deleteTarget.novelTitle}」章节「{deleteTarget.title}」，并自动重排序号。
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
