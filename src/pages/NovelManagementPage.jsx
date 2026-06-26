import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'
import NovelCoverUpload from '../components/NovelCoverUpload.jsx'
import { getApiOriginLabel } from '../lib/apiBase.js'
import { fetchAdminAppFilters } from '../lib/appFiltersAdminApi.js'
import { buildCatalogIndex, fetchAppHomeStats, fetchAppNovelsCatalog, alignNovelRowsWithAppStats } from '../lib/novelsCatalogApi.js'
import { formatAppCompactCount } from '../lib/novelAppDisplayStats.js'
import {
  createAdminNovel,
  deleteAdminNovel,
  fetchAdminNovel,
  fetchAdminNovels,
  toAdminNovelCoverPath,
  updateAdminChapter,
  updateAdminNovel,
  updateAdminNovelVisibility,
} from '../lib/novelsAdminApi.js'

const PAGE_SIZE = 50
const EMPTY_FILTERS = { title: '', author: '', genreId: '', status: '', visibility: '' }

const VISIBILITY_META = {
  published: { label: '已上架', short: '已上架' },
  draft: { label: '草稿', short: '草稿' },
  hidden: { label: '已下架', short: '已下架' },
}

const EMPTY_FORM = {
  coverUrl: '',
  title: '',
  author: '',
  genreId: '',
  tags: [],
  synopsis: '',
  status: 'ongoing',
  source: 'original',
  visibility: 'published',
  chapterTitle: '',
  chapterContent: '',
}

function chapterBodyToText(body) {
  if (Array.isArray(body)) return body.join('\n')
  return String(body || '')
}

function pickEditChapter(chapters) {
  const list = Array.isArray(chapters) ? chapters : []
  if (!list.length) return { index: -1, chapter: null }
  const index = list.length - 1
  return { index, chapter: list[index] }
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

function genreLabel(genreId, genreOptions) {
  const id = String(genreId || '').trim()
  if (!id) return '—'
  const hit = genreOptions.find((item) => item.id === id)
  return hit?.label || id
}

function formatStatus(status) {
  return String(status) === 'completed' ? '完结' : '连载中'
}

function normalizeVisibility(value) {
  const key = String(value || '').trim().toLowerCase()
  return VISIBILITY_META[key] ? key : 'published'
}

function isPublishedVisibility(value) {
  return normalizeVisibility(value) === 'published'
}

function tagsToText(tags) {
  if (Array.isArray(tags)) return tags.join(', ')
  return String(tags || '')
}

function tagsToArray(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean)
  return String(tags || '')
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean)
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
  const [appCatalogById, setAppCatalogById] = useState(() => new Map())
  const [appCatalogTotal, setAppCatalogTotal] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('create')
  const [editingId, setEditingId] = useState('')
  const [editingChapterIndex, setEditingChapterIndex] = useState(-1)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [visibilitySubmittingId, setVisibilitySubmittingId] = useState('')
  const [flagSubmittingId, setFlagSubmittingId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [genreOptions, setGenreOptions] = useState([])
  const [tagOptions, setTagOptions] = useState([])
  const [tagsSearch, setTagsSearch] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadList = useCallback(async ({ silent = false } = {}) => {
    if (!hasLegacy) return
    if (!silent) setLoading(true)
    setError('')
    try {
      const [data, catalog, homeStats] = await Promise.all([
        fetchAdminNovels({
          page,
          pageSize: PAGE_SIZE,
          ...appliedFilters,
        }),
        fetchAppNovelsCatalog().catch(() => null),
        fetchAppHomeStats().catch(() => null),
      ])
      const statsMap = homeStats && typeof homeStats === 'object' ? homeStats : {}
      const catalogById = buildCatalogIndex(catalog?.novels ?? [])
      const items = await alignNovelRowsWithAppStats(Array.isArray(data?.items) ? data.items : [], {
        homeStatsById: statsMap,
        catalogById,
      })
      setRows(items)
      setTotal(Number(data?.total) || 0)
      if (catalog) {
        setAppCatalogById(buildCatalogIndex(catalog.novels))
        setAppCatalogTotal(catalog.total)
      } else {
        setAppCatalogById(catalogById)
        setAppCatalogTotal(catalogById.size)
      }
    } catch (err) {
      setError(err?.message || '加载小说列表失败')
      setRows([])
      setTotal(0)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [appliedFilters, hasLegacy, page])

  useEffect(() => {
    loadList()
    const timer = window.setInterval(() => {
      void loadList({ silent: true })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [loadList])

  useEffect(() => {
    if (!hasLegacy) return
    let cancelled = false
    void fetchAdminAppFilters()
      .then((data) => {
        if (cancelled) return
        const genres = Array.isArray(data?.genres?.items)
          ? data.genres.items.filter((it) => it.enabled !== false)
          : []
        const tags = Array.isArray(data?.tags?.items)
          ? data.tags.items.filter((it) => it.enabled !== false)
          : []
        setGenreOptions(genres)
        setTagOptions(tags)
      })
      .catch(() => {
        if (cancelled) return
        setGenreOptions([])
        setTagOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [hasLegacy])

  useEffect(() => {
    if (!editorOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [editorOpen])

  const openCreate = () => {
    setEditorMode('create')
    setEditingId('')
    setEditingChapterIndex(-1)
    setForm(EMPTY_FORM)
    setTagsSearch('')
    setEditorOpen(true)
  }

  const openEdit = async (row) => {
    setEditorMode('edit')
    setEditingId(row.id)
    setError('')
    try {
      const data = await fetchAdminNovel(row.id)
      const novel = data?.novel || row
      const { index, chapter } = pickEditChapter(novel.chapters)
      setEditingChapterIndex(index)
      setForm({
        coverUrl: novel.coverUrl || '',
        title: novel.title || '',
        author: novel.author || '',
        genreId: novel.genreId || '',
        tags: tagsToArray(novel.tags),
        synopsis: novel.synopsis || '',
        status: novel.status || 'ongoing',
        source: novel.source || 'original',
        visibility: normalizeVisibility(novel.visibility),
        chapterTitle: chapter?.title || '',
        chapterContent: chapterBodyToText(chapter?.body),
      })
      setTagsSearch('')
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
        coverUrl: toAdminNovelCoverPath(form.coverUrl),
        title: form.title.trim(),
        author: form.author.trim(),
        genreId: form.genreId.trim(),
        tags: form.tags,
        synopsis: form.synopsis.trim(),
        status: form.status,
        source: form.source,
      }
      if (editorMode === 'create') {
        payload.firstChapterTitle = form.chapterTitle.trim()
        payload.firstChapterContent = form.chapterContent
        payload.visibility = form.visibility
        await createAdminNovel(payload)
      } else {
        await updateAdminNovel(editingId, payload)
        await updateAdminNovelVisibility(editingId, form.visibility)
        if (editingChapterIndex >= 0) {
          await updateAdminChapter(editingId, editingChapterIndex, {
            title: form.chapterTitle.trim() || '第一章',
            body: form.chapterContent,
          })
        }
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

  const onToggleFlag = async (row, field) => {
    setFlagSubmittingId(row.id)
    setError('')
    try {
      const next = !row[field]
      await updateAdminNovel(row.id, { [field]: next })
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, [field]: next } : item)))
    } catch (err) {
      setError(err?.message || '更新失败')
    } finally {
      setFlagSubmittingId('')
    }
  }

  const onVisibilityChange = async (row, visibility) => {
    const next = normalizeVisibility(visibility)
    if (normalizeVisibility(row.visibility) === next) return
    setVisibilitySubmittingId(row.id)
    setError('')
    try {
      await updateAdminNovelVisibility(row.id, next)
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, visibility: next } : item)))
    } catch (err) {
      setError(err?.message || '上架状态更新失败')
    } finally {
      setVisibilitySubmittingId('')
    }
  }

  const pagedHint = useMemo(() => `共 ${total} 条`, [total])
  const dataSourceHint = useMemo(
    () => `数据源 ${getApiOriginLabel()} · 后台 ${total} 本 · APP 目录 ${appCatalogTotal} 本`,
    [total, appCatalogTotal],
  )
  const filteredTagOptions = useMemo(() => {
    const kw = tagsSearch.trim().toLowerCase()
    if (!kw) return tagOptions
    return tagOptions.filter((it) => String(it.label || it.id).toLowerCase().includes(kw))
  }, [tagOptions, tagsSearch])

  const toggleTag = (id) => {
    setForm((prev) => {
      const current = new Set(tagsToArray(prev.tags))
      if (current.has(id)) current.delete(id)
      else current.add(id)
      return { ...prev, tags: [...current] }
    })
  }

  if (!hasLegacy) {
    return <LegacyRequiredNotice />
  }

  return (
    <section className="admin-panel admin-novel-mgmt">
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-novel-mgmt-toolbar">
        <div className="admin-novel-mgmt-filters">
          <label className="admin-novel-mgmt-field">
            <span>书名</span>
            <input
              value={inputFilters.title}
              onChange={(e) => setInputFilters((p) => ({ ...p, title: e.target.value }))}
              placeholder="搜索书名"
            />
          </label>
          <label className="admin-novel-mgmt-field">
            <span>作者</span>
            <input
              value={inputFilters.author}
              onChange={(e) => setInputFilters((p) => ({ ...p, author: e.target.value }))}
              placeholder="搜索作者"
            />
          </label>
          <label className="admin-novel-mgmt-field">
            <span>分类</span>
            <select
              value={inputFilters.genreId}
              onChange={(e) => setInputFilters((p) => ({ ...p, genreId: e.target.value }))}
            >
              <option value="">全部</option>
              {genreOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-novel-mgmt-field">
            <span>状态</span>
            <select
              value={inputFilters.status}
              onChange={(e) => setInputFilters((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="ongoing">连载中</option>
              <option value="completed">已完结</option>
            </select>
          </label>
          <label className="admin-novel-mgmt-field">
            <span>上架</span>
            <select
              value={inputFilters.visibility}
              onChange={(e) => setInputFilters((p) => ({ ...p, visibility: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="published">已上架</option>
              <option value="draft">草稿</option>
              <option value="hidden">已下架</option>
            </select>
          </label>
        </div>
        <div className="admin-novel-mgmt-actions">
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

      <div className="admin-novel-mgmt-table-card">
        <div className="admin-novel-mgmt-table-head">
          <h3>小说列表</h3>
          <span className="admin-novel-mgmt-meta">{dataSourceHint}</span>
        </div>
        <div className="admin-table-wrap admin-novel-mgmt-table-wrap">
          <table className="admin-table admin-novel-mgmt-table">
            <thead>
              <tr>
                <th>封面</th>
                <th>书名</th>
                <th>作者</th>
                <th>分类</th>
                <th>状态</th>
                <th>APP 可见</th>
                <th>是否推荐</th>
                <th>是否首页</th>
                <th>观看</th>
                <th>点赞</th>
                <th>收藏</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => {
                  const published = isPublishedVisibility(row.visibility)
                  const appVisible = appCatalogById.has(row.id)
                  const busy = visibilitySubmittingId === row.id || flagSubmittingId === row.id
                  return (
                    <tr key={row.id}>
                      <td>
                        {row.coverUrl ? (
                          <img className="admin-novel-mgmt-cover" src={row.coverUrl} alt="" />
                        ) : (
                          <span className="admin-novel-mgmt-cover-empty">无</span>
                        )}
                      </td>
                      <td className="admin-novel-mgmt-title">{row.title}</td>
                      <td>{row.author || '—'}</td>
                      <td>{genreLabel(row.genreId, genreOptions)}</td>
                      <td>
                        <span
                          className={`admin-novel-mgmt-status admin-novel-mgmt-status--${row.status === 'completed' ? 'done' : 'ongoing'}`}
                        >
                          {formatStatus(row.status)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`admin-novel-mgmt-app ${appVisible ? 'is-visible' : 'is-hidden'}`}
                          title={
                            appVisible
                              ? '读者端目录中可见'
                              : published
                                ? '已上架但未出现在 APP 目录（请刷新或检查数据）'
                                : '未上架，读者端不可见'
                          }
                        >
                          {appVisible ? '可见' : '不可见'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`admin-novel-mgmt-bool ${row.isRecommended ? 'is-yes' : 'is-no'}`}
                          disabled={busy}
                          onClick={() => onToggleFlag(row, 'isRecommended')}
                        >
                          {row.isRecommended ? '是' : '否'}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`admin-novel-mgmt-bool ${row.showOnHome ? 'is-yes' : 'is-no'}`}
                          disabled={busy}
                          onClick={() => onToggleFlag(row, 'showOnHome')}
                        >
                          {row.showOnHome ? '是' : '否'}
                        </button>
                      </td>
                      <td className="admin-novel-mgmt-num">{formatCount(row.cardViewCount)}</td>
                      <td className="admin-novel-mgmt-num">{formatCount(row.cardLikeCount)}</td>
                      <td className="admin-novel-mgmt-num">{formatCount(row.cardFavoriteCount)}</td>
                      <td className="admin-novel-mgmt-time">{formatMs(row.updatedAtMs)}</td>
                      <td>
                        <div className="admin-novel-mgmt-row-actions">
                          <button
                            className="admin-novel-mgmt-act admin-novel-mgmt-act--publish"
                            type="button"
                            disabled={busy || published}
                            onClick={() => onVisibilityChange(row, 'published')}
                          >
                            上架
                          </button>
                          <button
                            className="admin-novel-mgmt-act admin-novel-mgmt-act--unpublish"
                            type="button"
                            disabled={busy || !published}
                            onClick={() => onVisibilityChange(row, 'hidden')}
                          >
                            下架
                          </button>
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
                  <td colSpan={13} className="admin-table-empty">
                    {loading ? '加载中...' : '暂无小说'}
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
          <div className="admin-modal-card admin-modal-card--wide admin-modal-card--scrollable">
            <div className="admin-modal-sticky-head">
              <p className="admin-modal-title">{editorMode === 'create' ? '新增小说' : '编辑小说'}</p>
            </div>
            <div className="admin-modal-scroll-body">
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
                <select
                  value={form.genreId}
                  onChange={(e) => setForm((p) => ({ ...p, genreId: e.target.value }))}
                >
                  {genreOptions.length ? (
                    <>
                      <option value="">请选择题材</option>
                      {genreOptions.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.label}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value="">暂无可选题材</option>
                  )}
                </select>
              </label>
              <label className="admin-novel-form-span2">
                标签（多选）
                {tagOptions.length ? (
                  <>
                    <input
                      placeholder="搜索标签"
                      value={tagsSearch}
                      onChange={(e) => setTagsSearch(e.target.value)}
                    />
                    <div className="admin-novel-tag-picker">
                      {filteredTagOptions.length ? (
                        filteredTagOptions.map((it) => {
                          const selected = tagsToArray(form.tags).includes(it.id)
                          return (
                            <button
                              key={it.id}
                              type="button"
                              className={[
                                'admin-novel-tag-chip',
                                selected ? 'admin-novel-tag-chip--active' : '',
                              ].join(' ')}
                              onClick={() => toggleTag(it.id)}
                            >
                              {it.label}
                            </button>
                          )
                        })
                      ) : (
                        <span className="admin-novel-tag-empty">未匹配到标签</span>
                      )}
                    </div>
                    <div className="admin-novel-tag-selected">
                      {tagsToArray(form.tags).length
                        ? `已选：${tagsToArray(form.tags).join('、')}`
                        : '已选：无'}
                    </div>
                  </>
                ) : (
                  <p className="admin-novel-option-empty">暂无可选标签</p>
                )}
              </label>
              <div className="admin-novel-form-row3 admin-novel-form-span2">
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
                  上架状态
                  <select
                    value={form.visibility}
                    onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))}
                  >
                    <option value="published">已上架</option>
                    <option value="draft">草稿</option>
                    <option value="hidden">已下架</option>
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
              </div>
              <label className="admin-novel-form-span2">
                小说简介
                <textarea
                  rows={4}
                  value={form.synopsis}
                  onChange={(e) => setForm((p) => ({ ...p, synopsis: e.target.value }))}
                />
              </label>
              <label>
                章文
                <input
                  value={form.chapterTitle}
                  onChange={(e) => setForm((p) => ({ ...p, chapterTitle: e.target.value }))}
                  placeholder="章节标题"
                />
              </label>
              <label className="admin-novel-form-span2">
                小说文章
                <textarea
                  rows={8}
                  value={form.chapterContent}
                  onChange={(e) => setForm((p) => ({ ...p, chapterContent: e.target.value }))}
                  placeholder="章节正文内容"
                />
              </label>
              {editorMode === 'edit' && editingChapterIndex < 0 ? (
                <p className="admin-novel-form-hint admin-novel-form-span2">该书暂无章节，保存后可在章节管理新增。</p>
              ) : null}
              </div>
            </div>
            <div className="admin-modal-actions admin-modal-actions--sticky">
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
