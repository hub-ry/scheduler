import React, { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import { toDateInput } from '../dates'
import { Icon } from './Icons'

interface Props {
  day?: Date
  at?: { x: number; y: number } | null
  onClose: () => void
  onAdded: () => void
}

const DURATION_PRESETS = [30, 60, 90, 120]

export function QuickAddEvent({ day, onClose, onAdded }: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [isOurs, setIsOurs] = useState(false)
  const [title, setTitle] = useState('')
  const [organization, setOrganization] = useState('')
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

      await api.createEvent({
        title: title.trim(),
        organization: organization.trim(),
        location: '',
        starts_at: `${date}T${start}:00`,
        ends_at: `${toDateInput(endsAt)}T${String(endsAt.getHours()).padStart(2, '0')}:${String(
          endsAt.getMinutes(),
        ).padStart(2, '0')}:00`,
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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card quick-add-modal" ref={modalRef} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className={`event-badge ${isOurs ? 'kind-ours' : 'kind-event'}`}>
              {isOurs ? 'Our Event' : 'Competing Event'}
            </span>
            <h3>Add New Event</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="quick-add-form">
          {error && <div className="notice error">{error}</div>}

          <div className="type-toggle-row">
            <button
              type="button"
              className={`type-pill ${!isOurs ? 'is-active' : ''}`}
              onClick={() => setIsOurs(false)}
            >
              Competing Event
            </button>
            <button
              type="button"
              className={`type-pill ${isOurs ? 'is-active' : ''}`}
              onClick={() => setIsOurs(true)}
            >
              Our Club Event
            </button>
          </div>

          <div className="field">
            <label htmlFor="qa-title">Event Title</label>
            <input
              id="qa-title"
              ref={inputRef}
              value={title}
              placeholder={isOurs ? 'e.g. BoilerMake Callout #1' : 'e.g. Robotics Club Callout'}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="qa-org">Host / Organization <span className="label-opt">(optional)</span></label>
            <input
              id="qa-org"
              value={organization}
              placeholder="e.g. ACM, IEEE, Company"
              disabled={busy}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field flex-2">
              <label htmlFor="qa-date">Date</label>
              <input
                id="qa-date"
                type="date"
                value={date}
                disabled={busy}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="field flex-1">
              <label htmlFor="qa-start">Start Time</label>
              <input
                id="qa-start"
                type="time"
                value={start}
                disabled={busy}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <div className="label-with-presets">
              <label htmlFor="qa-duration">Duration ({minutes} mins)</label>
              <div className="preset-buttons">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`btn-preset ${minutes === p ? 'is-selected' : ''}`}
                    onClick={() => setMinutes(p)}
                  >
                    {p}m
                  </button>
                ))}
              </div>
            </div>
            <input
              id="qa-duration"
              type="range"
              min={15}
              max={240}
              step={15}
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !title.trim()}>
              {busy ? 'Saving...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
