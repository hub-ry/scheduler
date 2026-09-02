import { useEffect, useState } from 'react'
import { api, ApiError, type Session } from '../api'

/**
 * The shared-password sign-in.
 *
 * Wraps the app rather than sitting on a route, because there is nothing to
 * look at before you are through it - every screen reads from the API.
 *
 * A deployment with no password configured never renders this at all: the
 * session endpoint reports the gate as unnecessary and already satisfied, so
 * running locally is unchanged.
 */

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
      // If even this fails the server is unreachable, and a sign-in box is a
      // more useful thing to show than a blank page.
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
          ? 'That is not the password.'
          : caught instanceof Error
            ? caught.message
            : String(caught),
      )
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  // Nothing rendered while we find out, so the sign-in box cannot flash up in
  // front of someone who is already signed in.
  if (session === null) return null

  if (session.authenticated) return <>{children}</>

  return (
    <div className="gate">
      <form className="card" onSubmit={submit}>
        <h1>Scheduler</h1>
        <p className="hint">Shared password.</p>

        {error && <div className="notice error">{error}</div>}

        <div className="field">
          <label htmlFor="gate-password">Password</label>
          <input
            id="gate-password"
            type="password"
            value={password}
            autoFocus
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button className="primary" type="submit" disabled={busy || password === ''}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
