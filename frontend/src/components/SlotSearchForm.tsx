import type { Package, RankRequest, Weekday } from '../api'
import { DAY_NAMES } from '../dates'

/**
 * The constraints half of the search: window, hours, length, weekdays.
 *
 * Split out of FindTime so the planning tab can put it beside a calendar
 * without a second copy of the form drifting away from this one.
 */

interface Props {
  request: RankRequest
  onChange: (request: RankRequest) => void
  onSubmit: (event: React.FormEvent) => void
  loading: boolean
  packages?: Package[]
  title?: string
  hint?: string
}

export function SlotSearchForm({
  request,
  onChange,
  onSubmit,
  loading,
  packages = [],
  title,
  hint,
}: Props) {
  function set<K extends keyof RankRequest>(key: K, value: RankRequest[K]) {
    onChange({ ...request, [key]: value })
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

  // Match by membership rather than storing an id: the request only ever
  // carries course ids, so a package edited elsewhere stops matching, which is
  // the honest thing to show rather than a stale name.
  const selected = request.course_ids
  const currentPackage =
    selected == null
      ? undefined
      : packages.find(
          (option) =>
            option.course_ids.length === selected.length &&
            option.course_ids.every((id) => selected.includes(id)),
        )
  const currentPackageId = currentPackage?.id

  return (
      <form className="card" onSubmit={onSubmit}>
        <h2>{title ?? 'Find a time'}</h2>
        {hint && <p className="hint">{hint}</p>}

        {packages.length > 0 && (
          <div className="field">
            <label htmlFor="audience">Audience</label>
            <select
              id="audience"
              value={currentPackageId ?? ''}
              onChange={(e) => {
                const chosen = packages.find((p) => String(p.id) === e.target.value)
                set('course_ids', chosen ? chosen.course_ids : null)
              }}
            >
              <option value="">Everyone (all tracked courses)</option>
              {packages.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.course_codes.length})
                </option>
              ))}
            </select>
            <span className="hint">
              {currentPackage?.description ??
                'Only the chosen courses\u2019 exams count against a slot.'}
            </span>
          </div>
        )}

        <div className="field">
          <label htmlFor="from">Window</label>
          <div className="range-row">
            <input
              id="from"
              type="date"
              value={request.window_start}
              onChange={(e) => set('window_start', e.target.value)}
              required
            />
            <span className="range-dash">to</span>
            <input
              id="to"
              type="date"
              value={request.window_end}
              min={request.window_start}
              onChange={(e) => set('window_end', e.target.value)}
              required
            />
          </div>
          <span className="hint">Or drag across the calendar.</span>
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
  )
}
