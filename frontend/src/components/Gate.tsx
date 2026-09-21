import { useEffect, useState } from 'react'
import { api, ApiError, type Session } from '../api'
import { Icon } from './Icons'

interface Props {
  children: React.ReactNode
}

export function Gate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch(() => setSession({ required: true, authenticated: false }))
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setSession(await api.signIn(password))
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? 'Incorrect password.'
          : caught instanceof Error
            ? caught.message
            : String(caught),
      )
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  if (session === null) return null
  if (session.authenticated) return <>{children}</>

  return (
    <div className="gate-screen">
      <div className="gate-card">
        <div className="gate-brand">
          <div className="gate-icon-badge">
            <Icon name="calendar" size={28} />
          </div>
          <h2>Scheduler</h2>
          <p className="text-muted text-sm">Enter shared access password</p>
        </div>

        {error && <div className="notice error">{error}</div>}

        <form onSubmit={submit} className="gate-form">
          <div className="form-group">
            <label htmlFor="gate-password">Password</label>
            <input
              id="gate-password"
              type="password"
              value={password}
              autoFocus
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button className="btn-primary-block" type="submit" disabled={busy || password === ''}>
            {busy ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
