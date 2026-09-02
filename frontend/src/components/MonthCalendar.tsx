import { useEffect, useMemo, useState } from 'react'
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

export interface DayRange {
  start: Date
  end: Date
}

interface Props {
  month: Date
  blocks: Busy[]
  /** A slot being considered, drawn in place among the real blocks. */
  preview?: PreviewEvent | null
  /** Compact cells, for when this sits beside a list rather than filling the tab. */
  dense?: boolean
  /** The day, plus where the pointer was, so a popover can open at the cursor. */
  onPickDay?: (day: Date, at: { x: number; y: number }) => void
  /** Drag across cells to choose a date range. */
  onSelectRange?: (range: DayRange) => void
  /** One day to mark - the day being acted on, not a range. */
  highlight?: Date | null
}

export function MonthCalendar({
  month,
  blocks,
  preview = null,
  dense = false,
  onPickDay,
  onSelectRange,
  highlight = null,
}: Props) {
  // The in-progress drag. Kept here rather than lifted, because a half-made
  // selection is not something the rest of the app should be able to see.
  const [anchor, setAnchor] = useState<Date | null>(null)
  const [cursor, setCursor] = useState<Date | null>(null)

  // A drag that ends outside the grid still has to end. Without this the
  // component would stay in dragging state and paint a selection that follows
  // the pointer around with no button held.
  useEffect(() => {
    if (anchor === null) return
    function finish(event: PointerEvent) {
      if (anchor && cursor) {
        // A press that never left the cell it started in is a click, not a
        // drag of one day. Both gestures live on this grid - drag sets the
        // search window, click adds a competing event - and this is the line
        // between them, so a short drag cannot silently open a form.
        if (isSameDay(anchor, cursor) && onPickDay)
          onPickDay(anchor, { x: event.clientX, y: event.clientY })
        else onSelectRange?.(orderRange(anchor, cursor))
      }
      setAnchor(null)
      setCursor(null)
    }
    window.addEventListener('pointerup', finish)
    return () => window.removeEventListener('pointerup', finish)
  }, [anchor, cursor, onSelectRange, onPickDay])

  // Only the live drag paints across days. A committed window used to stay
  // shaded, which meant a fortnight of tinted cells sitting behind everything
  // and competing with the one day actually being acted on.
  const dragging = anchor && cursor && !isSameDay(anchor, cursor) ? orderRange(anchor, cursor) : null

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

  // A closed day is not "busy", it is unusable, so the whole cell is tinted
  // rather than the day carrying one more chip among the classes and exams.
  const closedDays = useMemo(() => {
    const days = new Map<string, Busy>()
    for (const block of blocks) {
      if (block.kind === 'closed') days.set(parseLocal(block.start).toDateString(), block)
    }
    return days
  }, [blocks])

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
          const closed = closedDays.get(key)
          const inRange = dragging !== null && day >= dragging.start && day <= dragging.end
          const classes = [
            'month-cell',
            outside && 'is-outside',
            isSameDay(day, today) && 'is-today',
            showsPreview && 'has-preview',
            closed && 'is-closed',
            inRange && 'in-range',
            inRange && dragging && isSameDay(day, dragging.start) && 'range-start',
            inRange && dragging && isSameDay(day, dragging.end) && 'range-end',
            highlight && isSameDay(day, highlight) && 'is-selected',
            (onPickDay || onSelectRange) && 'is-pickable',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div
              key={key}
              className={classes}
              onClick={
                onPickDay && !onSelectRange
                  ? (event) => onPickDay(day, { x: event.clientX, y: event.clientY })
                  : undefined
              }
              onPointerDown={
                onSelectRange
                  ? (event) => {
                      // Left button only, and never start a drag from inside an
                      // event chip - that gesture belongs to the chip.
                      if (event.button !== 0) return
                      setAnchor(day)
                      setCursor(day)
                    }
                  : undefined
              }
              onPointerEnter={onSelectRange && anchor ? () => setCursor(day) : undefined}
              role={onPickDay || onSelectRange ? 'button' : undefined}
              tabIndex={onPickDay || onSelectRange ? 0 : undefined}
            >
              <div className="month-date">{day.getDate()}</div>
              <div className="month-events">
                {closed && (
                  <div
                    className="month-event kind-closed"
                    title={closed.detail || `${closed.label} - no events`}
                  >
                    <span className="month-event-label">{closed.label}</span>
                  </div>
                )}
                {showsPreview && preview && (
                  <div className="month-event is-preview" title="The slot you are considering">
                    <span className="dot" />
                    <span className="month-event-label">
                      {formatTime(parseLocal(preview.start))} {preview.label}
                    </span>
                  </div>
                )}
                {(byDay.get(key) ?? []).map((block) =>
                  block.kind === 'closed' ? null : block.kind === 'academic' ? (
                    // A milestone owns the whole day, so a start time would be
                    // meaningless noise beside it.
                    <div
                      key={`${block.label}-${block.start}`}
                      className="month-event kind-academic"
                      title={block.detail || block.label}
                    >
                      <span className="dot" />
                      <span className="month-event-label">{block.label}</span>
                    </div>
                  ) : (
                    <div
                      key={`${block.label}-${block.start}`}
                      className={`month-event kind-${block.kind}`}
                      title={`${block.label}\n${formatTime(parseLocal(block.start))} - ${formatTime(
                        parseLocal(block.end),
                      )}`}
                    >
                      <span className="dot" />
                      <span className="month-event-label">
                        {formatTime(parseLocal(block.start))} {block.label}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Put a dragged pair of days the right way round. */
function orderRange(a: Date, b: Date): DayRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a }
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
