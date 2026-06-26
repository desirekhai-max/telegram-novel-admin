import { useCallback, useEffect, useRef, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'
import {
  createManualBackup,
  downloadBackupVersion,
  downloadLiveExport,
  fetchBackupHistory,
  fetchBackupSettings,
  restoreBackupUpload,
  restoreBackupVersion,
  saveBackupSettings,
} from '../lib/novelBackupApi.js'
import { formatCambodiaNowText } from '../lib/cambodiaTime.js'

function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function ConfirmModal({ open, title, text, confirmLabel, onClose, onConfirm, busy }) {
  if (!open) return null
  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="admin-modal-card admin-backup-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <p className="admin-modal-title">{title}</p>
        <p className="admin-backup-confirm-text">{text}</p>
        <div className="admin-modal-actions">
          <button className="admin-btn admin-modal-btn-cancel" type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="admin-btn admin-backup-restore-confirm" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NovelBackupCenterPage() {
  const hasLegacy = hasLegacyToken()
  const fileInputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [settings, setSettings] = useState({ autoEnabled: false, intervalHours: 24 })
  const [history, setHistory] = useState([])
  const [restoreConfirm, setRestoreConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextSettings, items] = await Promise.all([fetchBackupSettings(), fetchBackupHistory()])
      setSettings(nextSettings)
      setHistory(items)
    } catch (err) {
      setError(err?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasLegacy) return
    void load()
  }, [hasLegacy, load])

  const run = async (key, fn) => {
    setBusy(key)
    setError('')
    setMessage('')
    try {
      await fn()
    } catch (err) {
      setError(err?.message || '操作失败')
    } finally {
      setBusy('')
    }
  }

  const onToggleAuto = async () => {
    const next = { ...settings, autoEnabled: !settings.autoEnabled }
    setSettings(next)
    try {
      const saved = await saveBackupSettings(next)
      setSettings(saved)
      setMessage(saved.autoEnabled ? '已开启自动备份' : '已关闭自动备份')
    } catch (err) {
      setSettings(settings)
      setError(err?.message || '保存失败')
    }
  }

  const onManualBackup = () =>
    run('manual', async () => {
      const item = await createManualBackup()
      setHistory(await fetchBackupHistory())
      setMessage(`已创建备份 · ${item?.count ?? 0} 本`)
    })

  const onRestoreFile = () => fileInputRef.current?.click()

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      setRestoreConfirm({ source: 'upload', payload, label: file.name })
    } catch {
      setError('无法读取备份文件')
    }
  }

  const doRestore = async () => {
    if (!restoreConfirm) return
    setBusy('restore')
    setError('')
    try {
      let result
      if (restoreConfirm.source === 'upload') {
        result = await restoreBackupUpload(restoreConfirm.payload)
      } else {
        result = await restoreBackupVersion(restoreConfirm.id)
      }
      setRestoreConfirm(null)
      setMessage(`已恢复 ${result?.count ?? 0} 本小说`)
    } catch (err) {
      setError(err?.message || '恢复失败')
    } finally {
      setBusy('')
    }
  }

  if (!hasLegacy) {
    return <LegacyRequiredNotice title="备份中心" />
  }

  return (
    <section className="admin-panel admin-backup-mgmt">
      {error ? <p className="admin-error admin-backup-mgmt-alert">{error}</p> : null}
      {message ? <p className="admin-success admin-backup-mgmt-alert">{message}</p> : null}

      <div className="admin-novel-mgmt-table-card admin-backup-mgmt-card">
        <div className="admin-novel-mgmt-table-head admin-backup-mgmt-head">
          <div>
            <h3>备份中心</h3>
            <span className="admin-novel-mgmt-meta">{history.length} 个历史版本</span>
          </div>
          <div className="admin-backup-mgmt-toolbar">
            <button
              className="admin-btn"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run('json', () => downloadLiveExport('json'))}
            >
              {busy === 'json' ? '导出中…' : '导出 JSON'}
            </button>
            <button
              className="admin-btn"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run('zip', () => downloadLiveExport('zip'))}
            >
              {busy === 'zip' ? '导出中…' : '导出 ZIP'}
            </button>
            <button className="admin-btn" type="button" disabled={Boolean(busy)} onClick={onRestoreFile}>
              恢复
            </button>
            <button
              className="admin-btn admin-btn-primary"
              type="button"
              disabled={Boolean(busy)}
              onClick={onManualBackup}
            >
              {busy === 'manual' ? '备份中…' : '手动备份'}
            </button>
          </div>
        </div>

        <div className="admin-backup-auto-row">
          <span className="admin-backup-auto-label">自动备份</span>
          <button
            type="button"
            className={[
              'admin-hfilter-status',
              settings.autoEnabled ? 'admin-hfilter-status--on' : 'admin-hfilter-status--off',
            ].join(' ')}
            disabled={Boolean(busy)}
            onClick={onToggleAuto}
          >
            {settings.autoEnabled ? '已开启' : '已关闭'}
          </button>
          {settings.autoEnabled ? (
            <span className="admin-backup-auto-meta">每 {settings.intervalHours || 24} 小时</span>
          ) : null}
        </div>

        <h4 className="admin-backup-section-title">历史版本</h4>

        <div className="admin-table-wrap admin-backup-mgmt-table-wrap">
          <table className="admin-table admin-backup-mgmt-table">
            <thead>
              <tr>
                <th>时间</th>
                <th className="admin-backup-col-kind">类型</th>
                <th className="admin-backup-col-count">小说</th>
                <th className="admin-backup-col-size">大小</th>
                <th className="admin-backup-col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    加载中…
                  </td>
                </tr>
              ) : history.length ? (
                history.map((row) => (
                  <tr key={row.id}>
                    <td className="admin-backup-time">{formatCambodiaNowText(new Date(row.createdAtMs))}</td>
                    <td>
                      <span
                        className={[
                          'admin-backup-kind',
                          row.kind === 'auto' ? 'admin-backup-kind--auto' : 'admin-backup-kind--manual',
                        ].join(' ')}
                      >
                        {row.kind === 'auto' ? '自动' : '手动'}
                      </span>
                    </td>
                    <td>{row.count}</td>
                    <td>{formatSize(row.sizeBytes)}</td>
                    <td>
                      <div className="admin-hfilter-actions">
                        <button
                          type="button"
                          className="admin-hfilter-icon-btn"
                          disabled={Boolean(busy)}
                          onClick={() => run(`dl-${row.id}`, () => downloadBackupVersion(row.id, 'json'))}
                        >
                          下载
                        </button>
                        <button
                          type="button"
                          className="admin-hfilter-icon-btn admin-hfilter-icon-btn--danger"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            setRestoreConfirm({
                              source: 'history',
                              id: row.id,
                              label: formatCambodiaNowText(new Date(row.createdAtMs)),
                            })
                          }
                        >
                          恢复
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    暂无历史版本
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="admin-backup-file-input"
        onChange={onFilePicked}
      />

      <ConfirmModal
        open={Boolean(restoreConfirm)}
        title="确认恢复？"
        text={
          restoreConfirm
            ? `将用备份「${restoreConfirm.label}」覆盖当前全部小说，此操作不可撤销。`
            : ''
        }
        confirmLabel="确认恢复"
        busy={busy === 'restore'}
        onClose={() => setRestoreConfirm(null)}
        onConfirm={doRestore}
      />
    </section>
  )
}
