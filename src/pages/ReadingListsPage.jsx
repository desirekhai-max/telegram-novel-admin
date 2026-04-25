import { useEffect, useMemo, useState } from 'react'
import { fetchReadingRecords } from '../lib/adminApi.js'
import { getToken } from '../lib/adminAuth.js'

function toCsv(rows) {
  const headers = ['memberName', 'memberLevel', 'memberOrder', 'shelfTitle', 'readChapter', 'readAt']
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ]
  return lines.join('\n')
}

function downloadCsv(filename, content) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReadingListsPage() {
  const [filters, setFilters] = useState({
    memberName: '',
    memberLevel: '',
    memberOrder: '',
    from: '',
    to: '',
    shelfTitle: '',
    keyword: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [records, setRecords] = useState([])

  useEffect(() => {
    let stop = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchReadingRecords({ token: getToken(), filters })
        const rows = Array.isArray(data?.records) ? data.records : Array.isArray(data) ? data : []
        if (!stop) setRecords(rows)
      } catch (err) {
        if (!stop) setError(err?.message || '读取阅读记录失败')
      } finally {
        if (!stop) setLoading(false)
      }
    }
    load()
    return () => {
      stop = true
    }
  }, [filters])

  const filteredRows = useMemo(() => {
    const kw = filters.keyword.trim().toLowerCase()
    if (!kw) return records
    return records.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(kw),
    )
  }, [records, filters.keyword])

  return (
    <section className="admin-panel">
      <div className="admin-tools admin-tools-wrap">
        {Object.entries(filters).map(([key, value]) => (
          <label key={key}>
            {key}
            <input
              value={value}
              onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={`筛选 ${key}`}
            />
          </label>
        ))}
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => downloadCsv('reading-records.csv', toCsv(filteredRows))}
        >
          导出 CSV
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p className="admin-subtle">加载中...</p> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>会员</th>
              <th>等级</th>
              <th>订单</th>
              <th>书架题目</th>
              <th>阅读章节</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr key={`${row.memberId || row.memberName || 'row'}-${idx}`}>
                <td>{row.memberName || '-'}</td>
                <td>{row.memberLevel || '-'}</td>
                <td>{row.memberOrder || '-'}</td>
                <td>{row.shelfTitle || '-'}</td>
                <td>{row.readChapter || '-'}</td>
                <td>{row.readAt || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
