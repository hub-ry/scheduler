import { useMemo, useState } from 'react'
import { api, type Slot } from '../api'
import { useAsyncData } from '../useAsyncData'
import {
  DAY_NAMES,
  addDays,
  formatTime,
  minutesIntoDay,
  parseLocal,
  startOfWeek,
  toDateInput,
} from '../dates'

/**
 * Week view of everything competing for the audience's evening.
 *
 * The grid is deliberately clipped to the evening hours by default: nobody is
 * scheduling a callout at 7am, and showing the full 24 hours would shrink the
 * block everyone actually cares about - the 8pm exam band - to a sliver.
 */

const PIXELS_PER_MINUTE = 44 / 60

interface Props {
  /** A slot picked on the Find a time tab, drawn over the grid for comparison. */
  proposed: Slot | null
  /** Bumped by the rest of the app when data changes, to force a refetch. */
  refreshKey: number
}

export function WeekCalendar({ proposed, refreshKey }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  // Follow a proposed slot into its week, so picking a result on the other tab
  // does not leave the user staring at an unrelated week. Adjusted during
  // render rather than in an effect - the state derives from a prop, and doing
  // it in an effect would render the wrong week first and then correct it.
  const [syncedProposal, setSyncedProposal] = useState<string | null>(null)
  if (proposed && proposed.start !== syncedProposal) {
    setSyncedProposal(proposed.start)
    setWeekStart(startOfWeek(parseLocal(proposed.start)))
  }

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )

  const {
    data: busy,
    loading,
    error,
  } = useAsyncData(
    () =>
      // toDateInput, not toISOString: the latter converts to UTC and would
      // shift the window by a day for anyone west of Greenwich.
      api.busy(
        `${toDateInput(weekStart)}T00:00:00`,
        `${toDateInput(addDays(weekStart, 6))}T23:59:59`,
      ),
    `${toDateInput(weekStart)}:${refreshKey}`,
    [],
  )

  // Frame the grid around the data: start an hour before the earliest block and
  // end an hour after the latest, clamped to a sane evening default when the
  // week is empty.
  const [hourFrom, hourTo] = useMemo(() => {
    const relevant = busy.filter((b) => withinWeek(parseLocal(b.start), days))
    if (relevant.length === 0) return [16, 23]
    const starts = relevant.map((b) => parseLocal(b.start).getHours())
    const ends = relevant.map((b) => Math.ceil(minutesIntoDay(parseLocal(b.end)) / 60))
    return [Math.max(0, Math.min(...starts) - 1), Math.min(24, Math.max(...ends) + 1)]
  }, [busy, days])

  const hours = Array.from({ length: hourTo - hourFrom }, (_, index) => hourFrom + index)
  const gridHeight = hours.length * 44

  function position(start: Date, end: Date) {
    const top = (minutesIntoDay(start) - hourFrom * 60) * PIXELS_PER_MINUTE
    const height = Math.max((end.getTime() - start.getTime()) / 60000, 20) * PIXELS_PER_MINUTE
    return { top, height }
  }

  const today = new Date().toDateString()

  return (
    <div className="card">
      <div className="week-toolbar">
        <button className="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ← Previous
        </button>
        <button className="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          This week
        </button>
        <button className="ghost" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          Next →
        </button>
        <span className="week-range">
          {weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} –{' '}
          {addDays(weekStart, 6).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <span className="spacer" />
        {loading && <span className="faint">Loading…</span>}
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="week-scroll">
        <div className="week">
          <div className="week-corner" />
          {days.map((day, index) => (
            <div
              key={day.toISOString()}
              className={`week-daylabel${day.toDateString() === today ? ' is-today' : ''}`}
            >
              {DAY_NAMES[index]}
              <span className="date">{day.getDate()}</span>
            </div>
          ))}

          <div className="week-hours" style={{ height: gridHeight }}>
            {hours.map((hour) => (
              <div key={hour} className="week-hour">
                {hour % 12 === 0 ? 12 : hour % 12}
                {hour < 12 ? 'a' : 'p'}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayKey = day.toDateString()
            const blocks = busy.filter((b) => parseLocal(b.start).toDateString() === dayKey)
            const showProposed =
              proposed && parseLocal(proposed.start).toDateString() === dayKey ? proposed : null
            return (
              <div key={dayKey} className="week-col" style={{ height: gridHeight }}>
                {blocks.map((block) => {
                  const start = parseLocal(block.start)
                  const end = parseLocal(block.end)
                  return (
                    <div
                      key={`${block.label}-${block.start}`}
                      className={`week-block kind-${block.kind}`}
                      style={position(start, end)}
                      title={`${block.label}\n${formatTime(start)} – ${formatTime(end)}`}
                    >
                      <strong>{block.label}</strong>
                      <span>{formatTime(start)}</span>
                    </div>
                  )
                })}
                {showProposed && (
                  <div
                    className="week-block is-proposed"
                    style={position(
                      parseLocal(showProposed.start),
                      parseLocal(showProposed.end),
                    )}
                    title="Your proposed slot"
                  >
                    <strong>Your event</strong>
                    <span>{formatTime(parseLocal(showProposed.start))}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="legend">
        <span className="exam">Exam</span>
        <span className="event">Competing event</span>
        <span className="course">Class meeting</span>
      </div>
    </div>
  )
}

function withinWeek(date: Date, days: Date[]): boolean {
  return days.some((day) => day.toDateString() === date.toDateString())
}
