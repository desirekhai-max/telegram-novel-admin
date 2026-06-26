import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasLegacyToken } from '../lib/adminAuth.js'
import { fetchAdminAppSettings, saveAdminAppSettings } from '../lib/appSettingsAdminApi.js'
import LegacyRequiredNotice from '../components/LegacyRequiredNotice.jsx'

const SECTIONS = [
  { key: 'basic', label: '基础设置' },
  { key: 'payment', label: '支付设置' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'reading', label: '阅读' },
]

const EMPTY = {
  basic: {
    platformName: '',
    logoUrl: '',
    contact: '',
    about: '',
    terms: '',
    privacy: '',
  },
  payment: {
    merchantId: '',
    apiKey: '',
    sandbox: true,
    production: false,
    abaEnabled: true,
    paywayEnabled: true,
  },
  telegram: {
    botToken: '',
    miniAppUrl: '',
    webhookUrl: '',
  },
  reading: {
    defaultFreeChapters: 3,
    commentModeration: false,
    reportEnabled: true,
    vipEnabled: true,
  },
}

function Toggle({ on, onClick, disabled, onLabel = '已开启', offLabel = '已关闭' }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={['admin-hfilter-status', on ? 'admin-hfilter-status--on' : 'admin-hfilter-status--off'].join(' ')}
      onClick={onClick}
    >
      {on ? onLabel : offLabel}
    </button>
  )
}

function Field({ label, children }) {
  return (
    <label className="admin-settings-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export default function SettingsAdminPage() {
  const hasLegacy = hasLegacyToken()
  const [tab, setTab] = useState('basic')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [snapshot, setSnapshot] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminAppSettings()
      const next = {
        basic: { ...EMPTY.basic, ...(data.basic || {}) },
        payment: { ...EMPTY.payment, ...(data.payment || {}) },
        telegram: { ...EMPTY.telegram, ...(data.telegram || {}) },
        reading: { ...EMPTY.reading, ...(data.reading || {}) },
      }
      setForm(next)
      setSnapshot(JSON.stringify(next))
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

  const dirty = useMemo(() => snapshot && snapshot !== JSON.stringify(form), [form, snapshot])

  const setBasic = (key, value) => setForm((p) => ({ ...p, basic: { ...p.basic, [key]: value } }))
  const setPayment = (key, value) => setForm((p) => ({ ...p, payment: { ...p.payment, [key]: value } }))
  const setTelegram = (key, value) => setForm((p) => ({ ...p, telegram: { ...p.telegram, [key]: value } }))
  const setReading = (key, value) => setForm((p) => ({ ...p, reading: { ...p.reading, [key]: value } }))

  const onSave = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const saved = await saveAdminAppSettings(form)
      const next = {
        basic: { ...EMPTY.basic, ...(saved.basic || {}) },
        payment: { ...EMPTY.payment, ...(saved.payment || {}) },
        telegram: { ...EMPTY.telegram, ...(saved.telegram || {}) },
        reading: { ...EMPTY.reading, ...(saved.reading || {}) },
      }
      setForm(next)
      setSnapshot(JSON.stringify(next))
      setMessage('已保存')
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!hasLegacy) {
    return <LegacyRequiredNotice title="设置" />
  }

  return (
    <section className="admin-panel admin-settings-mgmt">
      {error ? <p className="admin-error admin-settings-alert">{error}</p> : null}
      {message ? <p className="admin-success admin-settings-alert">{message}</p> : null}

      <div className="admin-settings-mgmt-body">
        <nav className="admin-filters-mgmt-side" aria-label="设置分类">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={[
                'admin-filters-mgmt-side__item',
                tab === s.key ? 'admin-filters-mgmt-side__item--active' : '',
              ].join(' ')}
              onClick={() => {
                setTab(s.key)
                setError('')
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="admin-settings-mgmt-main">
          <div className="admin-novel-mgmt-table-card admin-settings-card">
            <div className="admin-novel-mgmt-table-head admin-settings-head">
              <h3>{SECTIONS.find((s) => s.key === tab)?.label}</h3>
            </div>

            {loading ? (
              <p className="admin-table-empty admin-settings-loading">加载中…</p>
            ) : tab === 'basic' ? (
              <div className="admin-settings-form">
                <Field label="平台名称">
                  <input className="admin-input" value={form.basic.platformName} onChange={(e) => setBasic('platformName', e.target.value)} />
                </Field>
                <Field label="Logo">
                  <input className="admin-input" value={form.basic.logoUrl} onChange={(e) => setBasic('logoUrl', e.target.value)} placeholder="图片 URL" />
                </Field>
                <Field label="联系方式">
                  <textarea className="admin-input admin-settings-textarea" rows={3} value={form.basic.contact} onChange={(e) => setBasic('contact', e.target.value)} />
                </Field>
                <Field label="About">
                  <textarea className="admin-input admin-settings-textarea" rows={5} value={form.basic.about} onChange={(e) => setBasic('about', e.target.value)} />
                </Field>
                <Field label="Terms">
                  <textarea className="admin-input admin-settings-textarea" rows={5} value={form.basic.terms} onChange={(e) => setBasic('terms', e.target.value)} />
                </Field>
                <Field label="Privacy">
                  <textarea className="admin-input admin-settings-textarea" rows={5} value={form.basic.privacy} onChange={(e) => setBasic('privacy', e.target.value)} />
                </Field>
              </div>
            ) : tab === 'payment' ? (
              <div className="admin-settings-form">
                <Field label="MerchantID">
                  <input className="admin-input" value={form.payment.merchantId} onChange={(e) => setPayment('merchantId', e.target.value)} />
                </Field>
                <Field label="APIKey">
                  <input
                    className="admin-input"
                    type="password"
                    value={form.payment.apiKey}
                    onChange={(e) => setPayment('apiKey', e.target.value)}
                    placeholder="留空则不修改"
                    autoComplete="off"
                  />
                </Field>
                <div className="admin-settings-toggle-row">
                  <span>Sandbox</span>
                  <Toggle
                    on={form.payment.sandbox}
                    onLabel="Sandbox"
                    offLabel="关闭"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        payment: { ...p.payment, sandbox: true, production: false },
                      }))
                    }
                  />
                </div>
                <div className="admin-settings-toggle-row">
                  <span>Production</span>
                  <Toggle
                    on={form.payment.production}
                    onLabel="Production"
                    offLabel="关闭"
                    onClick={() => {
                      setForm((p) => ({
                        ...p,
                        payment: { ...p.payment, production: true, sandbox: false },
                      }))
                    }}
                  />
                </div>
                <div className="admin-settings-toggle-row">
                  <span>ABA</span>
                  <Toggle on={form.payment.abaEnabled} onClick={() => setPayment('abaEnabled', !form.payment.abaEnabled)} />
                </div>
                <div className="admin-settings-toggle-row">
                  <span>PayWay</span>
                  <Toggle on={form.payment.paywayEnabled} onClick={() => setPayment('paywayEnabled', !form.payment.paywayEnabled)} />
                </div>
              </div>
            ) : tab === 'telegram' ? (
              <div className="admin-settings-form">
                <Field label="Bot Token">
                  <input
                    className="admin-input"
                    type="password"
                    value={form.telegram.botToken}
                    onChange={(e) => setTelegram('botToken', e.target.value)}
                    placeholder="留空则不修改"
                    autoComplete="off"
                  />
                </Field>
                <Field label="MiniApp URL">
                  <input className="admin-input" value={form.telegram.miniAppUrl} onChange={(e) => setTelegram('miniAppUrl', e.target.value)} />
                </Field>
                <Field label="Webhook">
                  <input className="admin-input" value={form.telegram.webhookUrl} onChange={(e) => setTelegram('webhookUrl', e.target.value)} />
                </Field>
              </div>
            ) : (
              <div className="admin-settings-form">
                <Field label="默认免费章节">
                  <input
                    className="admin-input admin-settings-num"
                    type="number"
                    min="0"
                    max="999"
                    value={form.reading.defaultFreeChapters}
                    onChange={(e) => setReading('defaultFreeChapters', Number(e.target.value) || 0)}
                  />
                </Field>
                <div className="admin-settings-toggle-row">
                  <span>评论审核</span>
                  <Toggle on={form.reading.commentModeration} onClick={() => setReading('commentModeration', !form.reading.commentModeration)} />
                </div>
                <div className="admin-settings-toggle-row">
                  <span>举报开关</span>
                  <Toggle on={form.reading.reportEnabled} onClick={() => setReading('reportEnabled', !form.reading.reportEnabled)} />
                </div>
                <div className="admin-settings-toggle-row">
                  <span>VIP开关</span>
                  <Toggle on={form.reading.vipEnabled} onClick={() => setReading('vipEnabled', !form.reading.vipEnabled)} />
                </div>
              </div>
            )}
          </div>

          <div className="admin-settings-footer">
            <span className="admin-settings-footer-note">{dirty ? '有未保存更改' : '已与服务器同步'}</span>
            <button className="admin-btn admin-btn-primary" type="button" disabled={saving || loading || !dirty} onClick={onSave}>
              {saving ? '保存中…' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
