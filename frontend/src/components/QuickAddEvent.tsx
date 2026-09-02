import { useState } from 'react'
import { api, ApiError } from '../api'
import { formatDay, toDateInput } from '../dates'

/**
 * Add a competing event to a day you clicked.
 *
 * Everything here is already decided except the name and the time, so the form
 * is three fields rather than the full event editor. The day came from the
 * click; the duration is almost always an hour; the audience fraction and
 * expected attendance are things nobody has ever filled in on this screen.
 */

interface Props {
  day: Date
  onClose: () => void
  onAdded: () => void
}

export function QuickAddEvent({ day, onClose, onAdded }: Props) {
  const [title, setTitle] = useState('')
  const [organization, setOrganization] = useState('')
  const [start, setStart] = useState('19:00')
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (title.trim() === '') {
      setError('Give it a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const date = toDateInput(day)
      const [hours, mins] = start.split(':').map(Number)
      const startsAt = new Date(day)
      startsAt.setHours(hours, mins, 0, 0)
      const endsAt = new Date(startsAt.getTime() + minutes * 60_000)

      await api.createEvent({
        title: title.trim(),
        organization: organization.trim(),
        location: '',
        starts_at: `${date}T${start}:00`,
        // Same local-time convention the rest of the app uses; never
        // toISOString, which would shift this into UTC and land it on the
        // wrong day for anything late in the evening.
        ends_at: `${toDateInput(endsAt)}T${String(endsAt.getHours()).padStart(2, '0')}:${String(
          endsAt.getMinutes(),
        ).padStart(2, '0')}:00`,
        expected_attendance: 0,
        audience_fraction: 1,
        source: 'manual',
        is_ours: false,
      })
      onAdded()
      onClose()
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="quick-add" onSubmit={submit}>
      <div className="quick-add-head">
        <strong>{formatDay(day)}</strong>
        <button type="button" className="ghost icon" aria-label="Cancel" onClick={onClose}>
          ×
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="field">
        <label htmlFor="qa-title">Event</label>
        <input
          id="qa-title"
          value={title}
          placeholder="Robotics callout"
          autoFocus
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="qa-org">Organization</label>
        <input
          id="qa-org"
          value={organization}
          placeholder="optional"
          disabled={busy}
          onChange={(event) => setOrganization(event.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="qa-start">Starts</label>
          <input
            id="qa-start"
            type="time"
            value={start}
            disabled={busy}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="qa-len">Length (min)</label>
          <input
            id="qa-len"
            type="number"
            min={15}
            max={480}
            step={15}
            value={minutes}
            disabled={busy}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </div>
      </div>

      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add competing event'}
      </button>
    </form>
  )
}
