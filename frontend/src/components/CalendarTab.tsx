import { useMemo, useState } from 'react'
import { api, type Busy } from '../api'
import { addDays, addMonths, formatMonth, monthGrid, startOfMonth, toDateInput } from '../dates'
import { describeError, moveEventToDay } from '../eventEdits'
import { useAsyncData } from '../useAsyncData'
import { Icon } from './Icons'
import { MonthCalendar, MonthToolbar } from './MonthCalendar'
import { QuickAddEvent } from './QuickAddEvent'
import { useToast } from '../toastContext'

interface Props {
  refreshKey: number
  onChanged: () => void
}

type EventFilter = 'all' | 'exam' | 'event' | 'ours'

export function CalendarTab({ refreshKey, onChanged }: Props) {
  const { showToast } = useToast()
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()))
  const [span, setSpan] = useState<1 | 3 | 6>(1)
  const [filter, setFilter] = useState<EventFilter>('all')
  const [adding, setAdding] = useState<{ day: Date; at: { x: number; y: number } } | true | null>(null)

  async function handleEdit(change: Promise<unknown>, successMessage?: string) {
    try {
      await change
      onChanged()
      if (successMessage) showToast(successMessage, 'success')
    } catch (caught) {
      showToast(describeError(caught), 'error')
    }
  }

  const months = useMemo(
    () => Array.from({ length: span }, (_, index) => addMonths(anchor, index)),
    [anchor, span],
  )

  const windowStart = useMemo(() => {
    const firstGrid = monthGrid(months[0])
    return toDateInput(firstGrid[0])
  }, [months])

  const windowEnd = useMemo(() => {
    const lastGrid = monthGrid(months[months.length - 1])
    return toDateInput(addDays(lastGrid[lastGrid.length - 1], 1))
  }, [months])

  const { data: rawBlocks, error } = useAsyncData(
    () => api.busy(`${windowStart}T00:00:00`, `${windowEnd}T00:00:00`),
    `${windowStart}:${windowEnd}:${refreshKey}`,
    [],
  )

  const blocks = useMemo(() => {
    if (filter === 'all') return rawBlocks
    return rawBlocks.filter((b) => b.kind === 'closed' || b.kind === 'academic' || b.kind === filter)
  }, [rawBlocks, filter])

  const toolbarLabel = useMemo(() => {
    if (span === 1) return formatMonth(anchor)
    const last = months[months.length - 1]
    return `${formatMonth(anchor)} - ${formatMonth(last)}`
  }, [anchor, months, span])

  return (
    <div className="calendar-tab-container">
      <div className="calendar-tab-toolbar-wrapper">
        <MonthToolbar
          month={anchor}
          onChange={setAnchor}
          label={toolbarLabel}
          step={span}
        >
          <div className="filter-pills">
            <button
              type="button"
              className={`filter-pill ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-pill ${filter === 'ours' ? 'is-active' : ''}`}
              onClick={() => setFilter('ours')}
            >
              Our Events
            </button>
            <button
              type="button"
              className={`filter-pill ${filter === 'exam' ? 'is-active' : ''}`}
              onClick={() => setFilter('exam')}
            >
              Exams
            </button>
            <button
              type="button"
              className={`filter-pill ${filter === 'event' ? 'is-active' : ''}`}
              onClick={() => setFilter('event')}
            >
              Competing
            </button>
          </div>

          <div className="span-switcher">
            {[1, 3, 6].map((count) => (
              <button
                key={count}
                type="button"
                className={`span-btn ${span === count ? 'is-active' : ''}`}
                onClick={() => setSpan(count as 1 | 3 | 6)}
              >
                {count === 1 ? '1 Month' : `${count} Months`}
              </button>
            ))}
          </div>

          <button
            className="btn-add-event"
            type="button"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" size={14} />
            <span>Add Event</span>
          </button>
        </MonthToolbar>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className={`month-grid-stack span-${span}`}>
        {months.map((month) => (
          <div key={month.toISOString()} className="calendar-panel-card">
            {span > 1 && (
              <div className="calendar-panel-header">
                <h3>{formatMonth(month)}</h3>
              </div>
            )}
            <MonthCalendar
              month={month}
              blocks={blocks}
              dense={span > 1}
              highlight={adding && adding !== true ? adding.day : null}
              onPickDay={(day, at) => setAdding({ day, at })}
              onDeleteEvent={(id) => handleEdit(api.deleteEvent(id), 'Event deleted')}
              onMoveEvent={(block: Busy, day) =>
                handleEdit(moveEventToDay(block, day), `Rescheduled to ${toDateInput(day)}`)
              }
            />
          </div>
        ))}
      </div>

      {adding && (
        <QuickAddEvent
          day={adding === true ? anchor : adding.day}
          at={adding === true ? null : adding.at}
          onClose={() => setAdding(null)}
          onAdded={() => {
            onChanged()
            showToast('Event added successfully', 'success')
          }}
        />
      )}
    </div>
  )
}
