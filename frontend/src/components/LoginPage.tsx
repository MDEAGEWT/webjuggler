import { useState } from 'react'
import { login, register } from '../api/auth'
import { useAuthStore } from '../stores/useAuthStore'

interface Props {
  hideRegister?: boolean
}

export default function LoginPage({ hideRegister }: Props) {
  const setAuth = useAuthStore((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(action: 'login' | 'register') {
    if (!username || !password) {
      setError('Username and password are required')
      return
    }
    setError('')
    setLoading(true)
    try {
      const fn = action === 'login' ? login : register
      const res = await fn(username, password)
      setAuth(res.token, username)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">WebJuggler</h1>
        <p className="login-subtitle">Flight log analysis</p>

        {error && <div className="login-error">{error}</div>}

        <input
          className="login-input"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit('login')}
          disabled={loading}
        />
        <input
          className="login-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit('login')}
          disabled={loading}
        />

        <div className="login-buttons">
          <button
            className="login-btn login-btn-primary"
            onClick={() => handleSubmit('login')}
            disabled={loading}
          >
            Log In
          </button>
          {!hideRegister && (
            <button
              className="login-btn login-btn-secondary"
              onClick={() => handleSubmit('register')}
              disabled={loading}
            >
              Register
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
