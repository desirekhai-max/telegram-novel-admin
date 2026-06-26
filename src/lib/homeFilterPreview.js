/** 根据后台 sections 状态构建 APP 筛选预览用 panel（与后端 buildPublicAppFilters 结构一致） */

function enabledSorted(items) {
  return (items || [])
    .filter((it) => it.enabled !== false)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}

function toOptions(items) {
  return enabledSorted(items).map((it) => ({
    value: it.id,
    label: it.label || it.id,
    pill: Boolean(it.pill || it.id === 'all'),
    long: Boolean(it.long),
  }))
}

export function buildPreviewPanelFromSections(sections) {
  const genres = sections?.genres?.items || []
  const tags = sections?.tags?.items || []
  const status = sections?.status?.items || []
  const wordRanges = sections?.wordRanges?.items || []

  return {
    title: '筛选',
    closeLabel: '关闭',
    maxSelectedTags: 3,
    groups: [
      {
        key: 'genre',
        title: '题材',
        type: 'single',
        options: toOptions(genres),
      },
      {
        key: 'status',
        title: '状态',
        type: 'single',
        options: toOptions(status),
      },
      {
        key: 'tags',
        title: '标签',
        type: 'tags',
        allLabel: '全部标签',
        options: toOptions(tags),
      },
      {
        key: 'lengthId',
        title: '字数',
        type: 'single',
        options: toOptions(wordRanges),
      },
    ],
  }
}

export const DEFAULT_SORT_PREVIEW_OPTIONS = [
  { id: 'update', label: '最新更新' },
  { id: 'views', label: '最多阅读' },
  { id: 'rating', label: '最高评分' },
  { id: 'publish', label: '最新发布' },
]
