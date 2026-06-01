import { useNavigate } from 'react-router-dom'
import { clearAuth } from '../lib/adminAuth.js'

export const LEGACY_RELOGIN_MSG =
  '缺少 Legacy 管理员凭证（admin_legacy_token），小说与章节管理不可用。请重新登录并确保 Legacy 登录成功。'

export default function LegacyRequiredNotice({ message = LEGACY_RELOGIN_MSG }) {
  const navigate = useNavigate()

  return (
    <section className="admin-panel">
      <p className="admin-error">{message}</p>
      <button
        className="admin-btn admin-btn-primary"
        type="button"
        onClick={() => {
          clearAuth()
          navigate('/login', { replace: true })
        }}
      >
        重新登录
      </button>
    </section>
  )
}
