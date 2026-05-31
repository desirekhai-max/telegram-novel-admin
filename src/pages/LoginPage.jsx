import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginAdmin, saveAuth } from '../lib/adminAuth.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim() || !otp.trim()) {
      setError('请输入账号、密码和 OTP')
      return
    }

    setLoading(true)
    try {
      const authData = await loginAdmin({
        username: username.trim(),
        password: password.trim(),
        otp: otp.trim(),
      })
      saveAuth(authData.token, authData.username, authData.legacyToken)
      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message || '网络异常，请稍后重试')
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