import { useMemo } from 'react'
import type { Busy } from '../api'
import {
  addMonths,
  DAY_NAMES,
  formatMonth,
  formatTime,
  isSameDay,
  monthGrid,
  parseLocal,
  startOfMonth,
} from '../dates'

/**
 * Month view of the busy landscape.
 *
 * Ours rather than Google's embed iframe, for one decisive reason: the embed
 * is a sealed frame that can only render calendars made public, and nothing can
 * be drawn inside it. The whole point of this view is showing a slot you have
 * not committed to yet, sitting among the things it would compete with - which
 * is exactly what an iframe cannot do.
 *
 * Rendered from the same `/api/busy` data as the week grid, so the two can
 * never disagree about what is on a given evening.
 */

export interface PreviewEvent {
  start: string
  end: string
  label: string
}

interface Props {
  month: Date
  blocks: Busy[]
  /** A slot being considered, drawn in place among the real blocks. */
  preview?: PreviewEvent | null
  /** Compact cells, for when this sits beside a list rather than filling the tab. */
  dense?: boolean
  onPickDay?: (day: Date) => void
}

export function MonthCalendar({ month, blocks, preview = null, dense = false, onPickDay }: Props) {
  const days = useMemo(() => monthGrid(month), [month])
  const monthStart = startOfMonth(month)
  const today = new Date()

  // Bucket by day once rather than filtering the whole list inside all 42 cells.
  const byDay = useMemo(() => {
    const buckets = new Map<string, Busy[]>()
    for (const block of blocks) {
      const key = parseLocal(block.start).toDateString()
      const bucket = buckets.get(key)
      if (bucket) bucket.push(block)
      else buckets.set(key, [block])
    }
    for (const bucket of buckets.values()) {
      bucket.sort((a, b) => a.start.localeCompare(b.start))
    }
    return buckets
  }, [blocks])

  const previewDay = preview ? parseLocal(preview.start).toDateString() : null

  return (
    <div className={`month${dense ? ' is-dense' : ''}`}>
      <div className="month-head">
        {DAY_NAMES.map((name) => (
          <div key={name} className="month-dayname">
            {name}
          </div>
        ))}
      </div>

      <div className="month-grid">
        {days.map((day) => {
          const key = day.toDateString()
          const outside = day.getMonth() !== monthStart.getMonth()
          const showsPreview = key === previewDay
          const classes = [
            'month-cell',
            outside && 'is-outside',
            isSameDay(day, today) && 'is-today',
            showsPreview && 'has-preview',
            onPickDay && 'is-pickable',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div
              key={key}
              className={classes}
              onClick={onPickDay ? () => onPickDay(day) : undefined}
              role={onPickDay ? 'button' : undefined}
              tabIndex={onPickDay ? 0 : undefined}
            >
              <div className="month-date">{day.getDate()}</div>
              <div className="month-events">
                {showsPreview && preview && (
                  <div className="month-event is-preview" title="The slot you are considering">
                    <span className="dot" />
                    {formatTime(parseLocal(preview.start))} {preview.label}
                  </div>
                )}
                {(byDay.get(key) ?? []).map((block) => (
                  <div
                    key={`${block.label}-${block.start}`}
                    className={`month-event kind-${block.kind}`}
                    title={`${block.label}\n${formatTime(parseLocal(block.start))} - ${formatTime(
                      parseLocal(block.end),
                    )}`}
                  >
                    <span className="dot" />
                    {formatTime(parseLocal(block.start))} {block.label}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Toolbar shared by every screen that pages through months. */
export function MonthToolbar({
  month,
  onChange,
  children,
  label,
  step = 1,
}: {
  month: Date
  onChange: (month: Date) => void
  children?: React.ReactNode
  /** Overrides the title when the view spans more than the anchor month. */
  label?: string
  /** How many months a page turn moves, so a six-month view pages by six. */
  step?: number
}) {
  return (
    <div className="month-toolbar">
      <button className="ghost" type="button" onClick={() => onChange(startOfMonth(new Date()))}>
        Today
      </button>
      <button
        className="ghost icon"
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(addMonths(month, -step))}
      >
        ‹
      </button>
      <button
        className="ghost icon"
        type="button"
        aria-label="Next month"
        onClick={() => onChange(addMonths(month, step))}
      >
        ›
      </button>
      <h3 className="month-title">{label ?? formatMonth(month)}</h3>
      <span className="spacer" />
      {children}
    </div>
  )
}
