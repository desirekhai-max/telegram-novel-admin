import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAuth, fetchAdminSession, getToken, loginAdmin, saveAuth, verifyLegacyTokenInSession } from '../lib/adminAuth.js'
import { API_ERRORS, humanizeApiError } from '../lib/apiErrors.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    document.title = '登录'
  }, [])

  useEffect(() => {
    let active = true
    const token = getToken()
    if (!token) return undefined
    fetchAdminSession(token).then((session) => {
      if (!active || !session.ok) return
      navigate('/admin/dashboard', { replace: true })
    })
    return () => {
      active = false
    }
  }, [navigate])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim() || !otp.trim()) {
      setError(API_ERRORS.otpRequired)
      return
    }

    setLoading(true)
    try {
      const authData = await loginAdmin({
        username: username.trim(),
        password: password.trim(),
        otp: otp.trim(),
      })

      if (!authData.token || !authData.legacyToken) {
        clearAuth()
        setError(API_ERRORS.loginTokensMissing)
        return
      }

      saveAuth(authData.token, authData.username, authData.legacyToken)

      try {
        verifyLegacyTokenInSession()
      } catch (verifyErr) {
        clearAuth()
        setError(humanizeApiError(verifyErr?.message, API_ERRORS.loginIncomplete))
        return
      }

      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      clearAuth()
      setError(humanizeApiError(err?.message, '网络异常，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-heading">
          <h1 className="admin-login-title">系统后台登录</h1>
          <p className="admin-login-sub">请输入账号、密码与 Google OTP</p>
        </div>

        <form className="admin-login-form" onSubmit={onSubmit}>
          <input
            className="admin-input"
            placeholder="账号"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className="admin-password-wrap">
            <input
              className="admin-input admin-password-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="admin-password-toggle"
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
          <input
            className="admin-input"
            placeholder="OTP（6位数字）"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          />

          {error ? <p className="admin-error">{error}</p> : null}

          <button className="admin-btn admin-btn-primary" type="submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </main>
  )
}
