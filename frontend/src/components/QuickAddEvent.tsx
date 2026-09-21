import React, { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import { formatTime, toDateInput } from '../dates'
import { Icon } from './Icons'

interface Props {
  day?: Date
  at?: { x: number; y: number } | null
  onClose: () => void
  onAdded: () => void
}

const DURATION_PRESETS = [30, 45, 60, 90, 120]

function formatTimeRange(dateStr: string, timeStr: string, durMinutes: number): string {
  try {
    const [hours, mins] = timeStr.split(':').map(Number)
    const startsAt = new Date(`${dateStr}T00:00:00`)
    startsAt.setHours(hours, mins, 0, 0)
    const endsAt = new Date(startsAt.getTime() + durMinutes * 60_000)
    return `${formatTime(startsAt)} - ${formatTime(endsAt)}`
  } catch {
    return `${durMinutes} min`
  }
}

export function QuickAddEvent({ day, onClose, onAdded }: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [isOurs, setIsOurs] = useState(false)
  const [title, setTitle] = useState('')
  const [organization, setOrganization] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(() => toDateInput(day ?? new Date()))
  const [start, setStart] = useState('19:00')
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Please provide an event title.')
      return
    }
    setBusy(true)
    setError(null)

    try {
      const [hours, mins] = start.split(':').map(Number)
      const startsAt = new Date(`${date}T00:00:00`)
      startsAt.setHours(hours, mins, 0, 0)
      const endsAt = new Date(startsAt.getTime() + minutes * 60_000)

      const endsTimeStr = `${String(endsAt.getHours()).padStart(2, '0')}:${String(
        endsAt.getMinutes(),
      ).padStart(2, '0')}:00`
      const endsDateStr = toDateInput(endsAt)

      await api.createEvent({
        title: title.trim(),
        organization: organization.trim(),
        location: location.trim(),
        starts_at: `${date}T${start}:00`,
        ends_at: `${endsDateStr}T${endsTimeStr}`,
        expected_attendance: 0,
        audience_fraction: 1,
        source: 'manual',
        is_ours: isOurs,
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
    <div
      className="notion-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="notion-modal-card quick-add-dialog"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add Event"
      >
        <div className="notion-modal-header">
          <div className="modal-title-group">
            <span className={`chip-dot kind-${isOurs ? 'ours' : 'event'}`} />
            <h3>{isOurs ? 'New Club Event' : 'New Competing Event'}</h3>
          </div>
          <button
            type="button"
            className="notion-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="quick-add-form">
          {error && (
            <div className="notion-form-error">
              <Icon name="warningCircle" size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="notion-segmented-control" role="group" aria-label="Event category">
            <button
              type="button"
              className={`segmented-tab ${!isOurs ? 'is-active is-competing' : ''}`}
              onClick={() => setIsOurs(false)}
            >
              <span className="chip-dot kind-event" />
              <span>Competing Event</span>
            </button>
            <button
              type="button"
              className={`segmented-tab ${isOurs ? 'is-active is-ours' : ''}`}
              onClick={() => setIsOurs(true)}
            >
              <span className="chip-dot kind-ours" />
              <span>Our Club Event</span>
            </button>
          </div>

          <div className="notion-form-field">
            <label htmlFor="qa-title">Title</label>
            <input
              id="qa-title"
              ref={inputRef}
              className="notion-input"
              value={title}
              placeholder={isOurs ? 'e.g. Hack Night Kickoff' : 'e.g. ACM Tech Talk'}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="notion-form-field">
            <label htmlFor="qa-org">
              <span>Host / Organization</span>
              <span className="label-faint">optional</span>
            </label>
            <input
              id="qa-org"
              className="notion-input"
              value={organization}
              placeholder={isOurs ? 'e.g. Purdue Hackers' : 'e.g. Google, IEEE, CS Club'}
              disabled={busy}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>

          <div className="notion-form-row">
            <div className="notion-form-field flex-2">
              <label htmlFor="qa-date">Date</label>
              <input
                id="qa-date"
                type="date"
                className="notion-input"
                value={date}
                disabled={busy}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="notion-form-field flex-1">
              <label htmlFor="qa-start">Start Time</label>
              <input
                id="qa-start"
                type="time"
                className="notion-input"
                value={start}
                disabled={busy}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="notion-form-field">
            <div className="duration-label-row">
              <label htmlFor="qa-duration">Duration</label>
              <span className="duration-preview-badge">
                {minutes} min ({formatTimeRange(date, start, minutes)})
              </span>
            </div>
            <div className="duration-presets-group">
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`preset-pill ${minutes === p ? 'is-selected' : ''}`}
                  onClick={() => setMinutes(p)}
                >
                  {p < 60 ? `${p}m` : p % 60 === 0 ? `${p / 60}h` : `${Math.floor(p / 60)}h ${p % 60}m`}
                </button>
              ))}
            </div>
            <input
              id="qa-duration"
              type="range"
              className="notion-range-slider"
              min={15}
              max={240}
              step={15}
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>

          <div className="notion-form-field">
            <label htmlFor="qa-loc">
              <span>Location</span>
              <span className="label-faint">optional</span>
            </label>
            <input
              id="qa-loc"
              className="notion-input"
              value={location}
              placeholder="e.g. WALC 1055, Lawson B158, Discord"
              disabled={busy}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="notion-modal-footer-actions">
            <button
              type="button"
              className="notion-btn-subtle"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="notion-btn-primary"
              disabled={busy || !title.trim()}
            >
              {busy ? 'Saving...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
