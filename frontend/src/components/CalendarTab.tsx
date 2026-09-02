import { useMemo, useState } from 'react'
import { api } from '../api'
import { addDays, addMonths, formatMonth, monthGrid, startOfMonth, toDateInput } from '../dates'
import { useAsyncData } from '../useAsyncData'
import { MonthCalendar, MonthToolbar } from './MonthCalendar'
import { QuickAddEvent } from './QuickAddEvent'

/**
 * Looking at the schedule, one month to half a year.
 *
 * The zoom levels are all the same month grid repeated, not three different
 * renderers. A term is roughly four months, so six is enough to hold a whole
 * semester and its edges in one view - which is the actual question being asked
 * at that zoom: where are the empty stretches, not what is on the 14th.
 */

const SPANS = [
  { months: 1, label: 'Month' },
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
] as const

type Span = (typeof SPANS)[number]['months']

interface Props {
  refreshKey: number
  onChanged: () => void
}

export function CalendarTab({ refreshKey, onChanged }: Props) {
  const [span, setSpan] = useState<Span>(1)
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()))
  // `true` means opened by the button with no day in mind.
  const [adding, setAdding] = useState<Date | true | null>(null)

  const months = useMemo(
    () => Array.from({ length: span }, (_, index) => addMonths(anchor, index)),
    [anchor, span],
  )

  // One fetch for the whole span rather than one per month: the grids overlap
  // at their seams, so per-month requests would fetch the shared weeks twice
  // and could render them inconsistently mid-load.
  const firstGrid = monthGrid(months[0])
  const lastGrid = monthGrid(months[months.length - 1])
  const from = toDateInput(firstGrid[0])
  const to = toDateInput(addDays(lastGrid[lastGrid.length - 1], 1))

  const {
    data: blocks,
    loading,
    error,
  } = useAsyncData(
    () => api.busy(`${from}T00:00:00`, `${to}T00:00:00`),
    `${from}:${to}:${refreshKey}`,
    [],
  )

  const inRange = blocks.filter((block) => {
    const date = new Date(block.start)
    return months.some(
      (month) =>
        date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear(),
    )
  })

  return (
    <div className="card calendar-tab">
      <MonthToolbar
        month={anchor}
        onChange={setAnchor}
        // At a wider zoom the toolbar's own title names only the first month,
        // which would be misleading, so the range is spelled out instead.
        label={span === 1 ? undefined : `${formatMonth(months[0])} - ${formatMonth(months[span - 1])}`}
        step={span}
      >
        <div className="scale-toggle" role="tablist" aria-label="Zoom">
          {SPANS.map((option) => (
            <button
              key={option.months}
              role="tab"
              type="button"
              aria-selected={span === option.months}
              onClick={() => setSpan(option.months)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="faint">
          {loading ? 'Loading…' : `${inRange.length} event${inRange.length === 1 ? '' : 's'}`}
        </span>
        <button className="ghost" type="button" onClick={() => setAdding(true)} disabled={!!adding}>
          + Competing event
        </button>
      </MonthToolbar>

      {error && <div className="notice error">{error}</div>}

      {adding ? (
        <QuickAddEvent
          day={adding === true ? undefined : adding}
          onClose={() => setAdding(null)}
          onAdded={onChanged}
        />
      ) : (
        <p className="hint">Click a day to log a competing event on it.</p>
      )}

      <div className={`month-stack span-${span}`}>
        {months.map((month) => (
          <section key={month.toISOString()} className="month-panel">
            {span > 1 && <h4 className="month-panel-title">{formatMonth(month)}</h4>}
            <MonthCalendar
              month={month}
              blocks={blocks}
              dense={span > 1}
              onPickDay={setAdding}
            />
          </section>
        ))}
      </div>

      <div className="legend">
        <span className="exam">Exam</span>
        <span className="event">Competing event</span>
        <span className="course">Class meeting</span>
      </div>
    </div>
  )
}
