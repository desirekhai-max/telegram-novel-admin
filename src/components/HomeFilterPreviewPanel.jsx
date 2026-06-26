import { useEffect, useMemo, useState } from 'react'
import { buildPreviewPanelFromSections, DEFAULT_SORT_PREVIEW_OPTIONS } from '../lib/homeFilterPreview.js'

const PREVIEW_PICKS = {
  genre: 'all',
  status: 'all',
  lengthId: 'all',
  tags: [],
}

export default function HomeFilterPreviewPanel({ sections }) {
  const panel = useMemo(() => buildPreviewPanelFromSections(sections), [sections])
  const sortOptions = DEFAULT_SORT_PREVIEW_OPTIONS
  const [picks, setPicks] = useState(PREVIEW_PICKS)

  const pickSingle = (key, value) => {
    setPicks((p) => ({ ...p, [key]: value }))
  }

  const toggleTag = (value) => {
    setPicks((p) => {
      const set = new Set(p.tags)
      if (set.has(value)) set.delete(value)
      else if (set.size < (panel.maxSelectedTags || 3)) set.add(value)
      return { ...p, tags: [...set] }
    })
  }

  return (
    <aside className="admin-hfilter-preview">
      <h3 className="admin-hfilter-preview__title">APP 预览</h3>
      <p className="admin-hfilter-preview__sub">筛选弹窗效果（修改左侧列表后即时更新）</p>

      <div className="admin-hfilter-phone">
        <div className="admin-hfilter-phone__bar" />
        <div className="admin-hfilter-phone__screen">
          <div className="admin-hfilter-sheet">
            <div className="admin-hfilter-sheet__head">
              <span>{panel.title}</span>
              <span className="admin-hfilter-sheet__close">{panel.closeLabel}</span>
            </div>
            <div className="admin-hfilter-sheet__body">
              {panel.groups.map((group) => (
                <div key={group.key} className="admin-hfilter-sheet__group">
                  <p className="admin-hfilter-sheet__group-title">{group.title}</p>
                  <div className="admin-hfilter-sheet__chips">
                    {group.type === 'tags' ? (
                      <>
                        <button
                          type="button"
                          className={[
                            'admin-hfilter-chip',
                            picks.tags.length === 0 ? 'admin-hfilter-chip--active' : '',
                          ].join(' ')}
                          onClick={() => setPicks((p) => ({ ...p, tags: [] }))}
                        >
                          {group.allLabel || '全部'}
                        </button>
                        {group.options.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={[
                              'admin-hfilter-chip',
                              picks.tags.includes(opt.value) ? 'admin-hfilter-chip--active' : '',
                            ].join(' ')}
                            onClick={() => toggleTag(opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </>
                    ) : (
                      group.options.map((opt) => {
                        const active = picks[group.key] === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={[
                              'admin-hfilter-chip',
                              opt.long ? 'admin-hfilter-chip--long' : '',
                              active ? 'admin-hfilter-chip--active' : '',
                            ].join(' ')}
                            onClick={() => pickSingle(group.key, opt.value)}
                          >
                            {opt.label}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-hfilter-sortbar">
            <span className="admin-hfilter-sortbar__label">排序</span>
            {sortOptions.map((opt, i) => (
              <span
                key={opt.id}
                className={[
                  'admin-hfilter-sortbar__item',
                  i === 0 ? 'admin-hfilter-sortbar__item--active' : '',
                ].join(' ')}
              >
                {opt.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="admin-hfilter-preview__hint">预览仅供参考，实际以 APP 为准</p>
    </aside>
  )
}
