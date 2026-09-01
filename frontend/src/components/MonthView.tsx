import { useState } from 'react'
import { api } from '../api'
import { addDays, addMonths, monthGrid, startOfMonth, toDateInput } from '../dates'
import { useAsyncData } from '../useAsyncData'
import { MonthCalendar, MonthToolbar } from './MonthCalendar'

/**
 * The read-only month view.
 *
 * Deliberately not Google's embed iframe. That would need the calendar made
 * public to show anything - the "you do not have the permission to view them"
 * banner is what a private calendar looks like in an embed - and it would give
 * the app a second calendar that looks nothing like the one on the planning
 * tab. This renders the same `/api/busy` data every other view uses.
 */

interface Props {
  refreshKey: number
}

export function MonthView({ refreshKey }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  // The grid always draws six whole weeks, so the fetch has to cover the
  // leading and trailing days too or events would vanish at the month seams.
  const days = monthGrid(month)
  const from = toDateInput(days[0])
  const to = toDateInput(addDays(days[days.length - 1], 1))

  const {
    data: blocks,
    loading,
    error,
  } = useAsyncData(
    () => api.busy(`${from}T00:00:00`, `${to}T00:00:00`),
    `${from}:${refreshKey}`,
    [],
  )

  const inMonth = blocks.filter((block) => {
    const date = new Date(block.start)
    return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear()
  })

  return (
    <div className="card">
      <MonthToolbar month={month} onChange={setMonth}>
        {loading ? (
          <span className="faint">Loading…</span>
        ) : (
          <span className="faint">
            {inMonth.length} event{inMonth.length === 1 ? '' : 's'} this month
          </span>
        )}
      </MonthToolbar>

      {error && <div className="notice error">{error}</div>}

      <MonthCalendar month={month} blocks={blocks} />

      <div className="legend">
        <span className="exam">Exam</span>
        <span className="event">Competing event</span>
        <span className="course">Class meeting</span>
      </div>

      <p className="hint">
        Everything competing for your audience. To see one of these on your phone, push it to
        Google Calendar from the Plan tab.{' '}
        <button className="linkish" type="button" onClick={() => setMonth(addMonths(month, 1))}>
          Next month
        </button>
      </p>
    </div>
  )
}
