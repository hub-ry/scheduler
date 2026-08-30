import { useState } from 'react'
import { api, ApiError, type ClubEvent } from '../api'
import { formatDay, formatTime, parseLocal } from '../dates'
import { useAsyncData } from '../useAsyncData'

/**
 * Manual entry and listing of events.
 *
 * Two kinds live here and the distinction matters to the ranker: competing
 * events (other orgs) push slots down, while our own events are excluded from
 * scoring so they never make their own slot look bad.
 */

interface Props {
  onChanged: () => void
  /** Prefills the form when a slot was picked on the Find a time tab. */
  prefill?: { starts_at: string; ends_at: string } | null
}

const EMPTY = {
  title: '',
  organization: '',
  location: '',
  starts_at: '',
  ends_at: '',
  expected_attendance: 0,
  audience_fraction: 1,
  source: 'manual',
  is_ours: false,
}

export function Events({ onChanged, prefill }: Props) {
  const [form, setForm] = useState({ ...EMPTY })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: events, error: loadError, reload } = useAsyncData<ClubEvent[]>(api.events, 'events', [])

  // Prefill from a slot chosen on the Find a time tab. Adjusted during render
  // rather than in an effect: it derives from a prop, and an effect would flash
  // an empty form before filling it in.
  const [syncedPrefill, setSyncedPrefill] = useState<string | null>(null)
  if (prefill && prefill.starts_at !== syncedPrefill) {
    setSyncedPrefill(prefill.starts_at)
    setForm((previous) => ({
      ...previous,
      // The datetime-local input wants no seconds.
      starts_at: prefill.starts_at.slice(0, 16),
      ends_at: prefill.ends_at.slice(0, 16),
      is_ours: true,
    }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createEvent({ ...form, expected_attendance: Number(form.expected_attendance) })
      setForm({ ...EMPTY })
      reload()
      onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteEvent(id)
      reload()
      onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught))
    }
  }

  return (
    <div className="columns">
      <form className="card" onSubmit={submit}>
        <h2>Add an event</h2>
        <p className="hint">
          Someone else's event competes for attendance. Your own is excluded from
          scoring so it never conflicts with itself.
        </p>

        {(error ?? loadError) && (
          <div className="notice error">{error ?? loadError}</div>
        )}

        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="org">Organization</label>
            <input
              id="org"
              value={form.organization}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="starts">Starts</label>
          <input
            id="starts"
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="ends">Ends</label>
          <input
            id="ends"
            type="datetime-local"
            value={form.ends_at}
            min={form.starts_at}
            onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="attendance">Expected attendance</label>
          <input
            id="attendance"
            type="number"
            min={0}
            value={form.expected_attendance}
            onChange={(e) => setForm({ ...form, expected_attendance: Number(e.target.value) })}
          />
        </div>

        <div className="field">
          <label htmlFor="ours" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input
              id="ours"
              type="checkbox"
              checked={form.is_ours}
              onChange={(e) => setForm({ ...form, is_ours: e.target.checked })}
              style={{ width: 'auto', marginRight: 8 }}
            />
            This is our event
          </label>
        </div>

        <button className="primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add event'}
        </button>
      </form>

      <div className="card">
        <h2>Scheduled events</h2>
        <p className="hint">{events.length} on the calendar.</p>
        {events.length === 0 ? (
          <p className="empty">Nothing yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th className="num">Attendance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const start = parseLocal(event.starts_at)
                return (
                  <tr key={event.id}>
                    <td>
                      {formatDay(start)}
                      <br />
                      <span className="faint">
                        {formatTime(start)} – {formatTime(parseLocal(event.ends_at))}
                      </span>
                    </td>
                    <td>
                      <strong>{event.title}</strong>
                      {event.is_ours && <span className="chip"> ours</span>}
                      <br />
                      <span className="muted">
                        {[event.organization, event.location].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="num muted">{event.expected_attendance || '—'}</td>
                    <td className="num">
                      <button
                        className="ghost"
                        onClick={() => remove(event.id)}
                        aria-label={`Delete ${event.title}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
