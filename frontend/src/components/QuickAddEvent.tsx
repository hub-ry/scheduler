import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import { toDateInput } from '../dates'

/**
 * Log a competing event: another org's thing that will take your audience.
 *
 * Opened by a button rather than by clicking a day, because on the Schedule tab
 * the grid already owns the drag gesture for the search window and a click that
 * sometimes meant "add an event" and sometimes meant "start a range" would
 * misfire on every short drag. Clicking a day where nothing else claims the
 * gesture just prefills the date.
 *
 * Four fields, not the full event editor: expected attendance and audience
 * fraction exist on the model but nobody has ever filled them in here.
 */

interface Props {
  /** Prefills the date, when the form was opened from a specific day. */
  day?: Date
  /** Where the pointer was. Given, the form floats at the cursor instead of
   *  sitting in the flow and pushing the calendar down the page. */
  at?: { x: number; y: number } | null
  onClose: () => void
  onAdded: () => void
}

export function QuickAddEvent({ day, at = null, onClose, onAdded }: Props) {
  const card = useRef<HTMLFormElement>(null)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null)

  // Measured after mount rather than guessed: the form's height depends on
  // whether an error is showing, and a popover that hangs off the bottom of the
  // window is worse than one that takes a frame to settle.
  useLayoutEffect(() => {
    if (!at || !card.current) return
    const box = card.current.getBoundingClientRect()
    const margin = 12
    setPlacement({
      left: Math.min(at.x + margin, window.innerWidth - box.width - margin),
      top: Math.min(at.y + margin, window.innerHeight - box.height - margin),
    })
  }, [at])

  // Escape closes, and so does a click anywhere outside. Both are what a
  // floating panel is expected to do, and without them the only way out is the
  // × in the corner.
  useEffect(() => {
    if (!at) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function onPointer(event: PointerEvent) {
      if (card.current && !card.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Deferred a tick: the very click that opened this would otherwise be the
    // outside click that closes it.
    const timer = setTimeout(() => window.addEventListener('pointerdown', onPointer), 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
      clearTimeout(timer)
    }
  }, [at, onClose])

  const [date, setDate] = useState(() => toDateInput(day ?? new Date()))
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
      const [hours, mins] = start.split(':').map(Number)
      const startsAt = new Date(`${date}T00:00:00`)
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
    <form
      ref={card}
      className={`quick-add${at ? ' is-floating' : ''}`}
      onSubmit={submit}
      style={
        at
          ? { left: placement?.left ?? at.x + 12, top: placement?.top ?? at.y + 12, visibility: placement ? 'visible' : 'hidden' }
          : undefined
      }
    >
      <div className="quick-add-head">
        <strong>Competing event</strong>
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
          <label htmlFor="qa-date">Date</label>
          <input
            id="qa-date"
            type="date"
            value={date}
            disabled={busy}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
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
