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
      saveAuth(authData.token, authData.username)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message || '网络异常，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        <h1 className="admin-login-title">系统后台登录</h1>
        <p className="admin-login-sub">请输入账号、密码与 Google OTP</p>

        <form className="admin-login-form" onSubmit={onSubmit}>
          <input
            className="admin-input"
            placeholder="账号"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="admin-input"
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
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