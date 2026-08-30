import { useState } from 'react'
import { api, ApiError, type RankRequest, type RankResponse, type Slot, type Weekday } from '../api'
import { DAY_NAMES, addDays, formatDay, formatTime, parseLocal, toDateInput } from '../dates'

/**
 * The core feature: describe the event you want to hold, get back the times
 * your audience is least likely to be busy.
 */

const DEFAULT_WEEKDAYS: Weekday[] = [0, 1, 2, 3]

function defaultRequest(): RankRequest {
  const today = new Date()
  return {
    window_start: toDateInput(today),
    window_end: toDateInput(addDays(today, 13)),
    duration_minutes: 60,
    earliest: '17:00',
    latest: '22:00',
    weekdays: DEFAULT_WEEKDAYS,
    step_minutes: 30,
    limit: 12,
  }
}

/**
 * Bucket a slot for colour. The thresholds are relative to the worst slot in
 * the result set rather than absolute, because the weights may be placeholders
 * whose absolute magnitude means nothing.
 */
function tierOf(slot: Slot, worst: number): string {
  if (slot.is_clear) return 'tier-clear'
  return slot.lost_attendance > worst / 2 ? 'tier-heavy' : 'tier-light'
}

interface Props {
  onProposeSlot: (slot: Slot | null) => void
  proposed: Slot | null
}

export function FindTime({ onProposeSlot, proposed }: Props) {
  const [request, setRequest] = useState<RankRequest>(defaultRequest)
  const [result, setResult] = useState<RankResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function set<K extends keyof RankRequest>(key: K, value: RankRequest[K]) {
    setRequest((previous) => ({ ...previous, [key]: value }))
  }

  function toggleDay(day: Weekday) {
    const active = request.weekdays.includes(day)
    // Refuse to clear the last day: the API rejects an empty list, and silently
    // sending a request we know will fail is worse than not letting them.
    if (active && request.weekdays.length === 1) return
    set(
      'weekdays',
      active ? request.weekdays.filter((d) => d !== day) : [...request.weekdays, day].sort(),
    )
  }

  async function search(submit: React.FormEvent) {
    submit.preventDefault()
    setLoading(true)
    setError(null)
    onProposeSlot(null)
    try {
      setResult(await api.rank(request))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const worst = result ? Math.max(...result.slots.map((s) => s.lost_attendance), 1) : 1

  return (
    <div className="columns">
      <form className="card" onSubmit={search}>
        <h2>Find a time</h2>
        <p className="hint">Ranked by how little of your audience is already busy.</p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="from">From</label>
            <input
              id="from"
              type="date"
              value={request.window_start}
              onChange={(e) => set('window_start', e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input
              id="to"
              type="date"
              value={request.window_end}
              min={request.window_start}
              onChange={(e) => set('window_end', e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="earliest">No earlier than</label>
            <input
              id="earliest"
              type="time"
              value={request.earliest}
              onChange={(e) => set('earliest', e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="latest">No later than</label>
            <input
              id="latest"
              type="time"
              value={request.latest}
              onChange={(e) => set('latest', e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="duration">Length (min)</label>
            <input
              id="duration"
              type="number"
              min={15}
              max={480}
              step={15}
              value={request.duration_minutes}
              onChange={(e) => set('duration_minutes', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="results">Results</label>
            <input
              id="results"
              type="number"
              min={1}
              max={200}
              value={request.limit}
              onChange={(e) => set('limit', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="field">
          <label>Days to consider</label>
          <div className="daypicker">
            {DAY_NAMES.map((name, index) => (
              <button
                key={name}
                type="button"
                aria-pressed={request.weekdays.includes(index as Weekday)}
                onClick={() => toggleDay(index as Weekday)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Rank the options'}
        </button>
      </form>

      <div className="card">
        <h2>Best times</h2>
        <p className="hint">
          {result
            ? `${result.slots.length} shown of ${result.considered} candidate slots.`
            : 'Set your constraints and run a search.'}
        </p>

        {error && <div className="notice error">{error}</div>}

        {result?.uses_placeholder_weights && (
          <div className="notice warn">
            Ranking uses placeholder enrollment for{' '}
            {result.courses_missing_enrollment.join(', ')}. The order of clear slots is
            reliable; the size of each conflict is not. Fill enrollment in on the Courses
            tab to sharpen it.
          </div>
        )}

        {result && result.slots.length === 0 && (
          <p className="empty">
            No slot fits those constraints. Try a wider window or a shorter event.
          </p>
        )}

        <div className="slots">
          {result?.slots.map((slot, index) => {
            const start = parseLocal(slot.start)
            const isProposed = proposed?.start === slot.start
            return (
              <div
                key={slot.start}
                className={`slot ${tierOf(slot, worst)}`}
                onClick={() => onProposeSlot(isProposed ? null : slot)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onProposeSlot(isProposed ? null : slot)}
                title="Show this slot on the calendar"
              >
                <div className="slot-head">
                  <div className="slot-when">
                    <span className="rank">{index + 1}</span>
                    {formatDay(start)} · {formatTime(start)} – {formatTime(parseLocal(slot.end))}
                  </div>
                  <div className="slot-verdict">
                    {slot.is_clear
                      ? 'Nothing in the way'
                      : `~${Math.round(slot.lost_attendance)} unavailable`}
                  </div>
                </div>
                {slot.conflicts.length > 0 && (
                  <ul className="slot-conflicts">
                    {slot.conflicts.map((conflict) => (
                      <li
                        key={`${conflict.label}-${conflict.overlap_minutes}`}
                        className={`chip kind-${conflict.kind}`}
                      >
                        {conflict.label} · {Math.round(conflict.overlap_fraction * 100)}% overlap
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
