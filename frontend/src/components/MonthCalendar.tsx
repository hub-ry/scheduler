import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Busy } from '../api'
import {
  addMonths,
  DAY_NAMES,
  formatDay,
  formatMonth,
  formatTime,
  isSameDay,
  monthGrid,
  parseLocal,
  startOfMonth,
  toDateInput,
} from '../dates'
import { Icon } from './Icons'

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
  preview?: PreviewEvent | null
  dense?: boolean
  onPickDay?: (day: Date, at: { x: number; y: number }) => void
  onSelectRange?: (range: DayRange) => void
  highlight?: Date | null
  onDeleteEvent?: (id: number) => void
  onMoveEvent?: (block: Busy, day: Date) => void
}

function blockKey(block: Busy): string {
  return `${block.kind}-${block.label}-${block.start}-${block.event_id ?? ''}`
}

function orderRange(a: Date, b: Date): DayRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a }
}

const KIND_NAMES: Record<Busy['kind'], string> = {
  course: 'Class Meeting',
  exam: 'Exam Sitting',
  event: 'Competing Event',
  ours: 'Our Event',
  closed: 'Campus Closed',
  academic: 'Academic Calendar',
}

export function MonthCalendar({
  month,
  blocks,
  preview = null,
  dense = false,
  onPickDay,
  onSelectRange,
  highlight = null,
  onDeleteEvent,
  onMoveEvent,
}: Props) {
  const [anchor, setAnchor] = useState<Date | null>(null)
  const [cursor, setCursor] = useState<Date | null>(null)
  const [activeEvent, setActiveEvent] = useState<{ block: Busy; rect: DOMRect } | null>(null)
  const [dayExpanded, setDayExpanded] = useState<Date | null>(null)

  // Drag selection listener for range
  useEffect(() => {
    if (anchor === null) return
    function finish(event: PointerEvent) {
      if (anchor && cursor) {
        if (isSameDay(anchor, cursor) && onPickDay) {
          onPickDay(anchor, { x: event.clientX, y: event.clientY })
        } else if (!isSameDay(anchor, cursor) && onSelectRange) {
          onSelectRange(orderRange(anchor, cursor))
        }
      }
      setAnchor(null)
      setCursor(null)
    }
    window.addEventListener('pointerup', finish)
    return () => window.removeEventListener('pointerup', finish)
  }, [anchor, cursor, onSelectRange, onPickDay])

  const selecting = anchor && cursor && !isSameDay(anchor, cursor) ? orderRange(anchor, cursor) : null
  const days = useMemo(() => monthGrid(month), [month])
  const monthStart = startOfMonth(month)
  const today = new Date()

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

  const closedDays = useMemo(() => {
    const map = new Map<string, Busy>()
    for (const block of blocks) {
      if (block.kind === 'closed') {
        map.set(parseLocal(block.start).toDateString(), block)
      }
    }
    return map
  }, [blocks])

  const maxVisibleChips = dense ? 2 : 3

  return (
    <div className={`month-view${dense ? ' is-dense' : ''}`}>
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
          const inRange = selecting !== null && day >= selecting.start && day <= selecting.end
          const dayBlocks = byDay.get(key) ?? []
          const regularBlocks = dayBlocks.filter((b) => b.kind !== 'closed')
          const overflowCount = regularBlocks.length - maxVisibleChips

          const cellClasses = [
            'month-cell',
            outside && 'is-outside',
            isSameDay(day, today) && 'is-today',
            showsPreview && 'has-preview',
            closed && 'is-closed',
            inRange && 'in-range',
            inRange && selecting && isSameDay(day, selecting.start) && 'range-start',
            inRange && selecting && isSameDay(day, selecting.end) && 'range-end',
            highlight && isSameDay(day, highlight) && 'is-selected',
            (onPickDay || onSelectRange) && 'is-pickable',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div
              key={key}
              className={cellClasses}
              onClick={
                onPickDay && !onSelectRange
                  ? (e) => onPickDay(day, { x: e.clientX, y: e.clientY })
                  : undefined
              }
              onPointerDown={
                onSelectRange
                  ? (e) => {
                      if (e.button !== 0) return
                      setAnchor(day)
                      setCursor(day)
                    }
                  : undefined
              }
              onPointerEnter={onSelectRange && anchor ? () => setCursor(day) : undefined}
            >
              <div className="cell-header">
                <span className={`month-date${isSameDay(day, today) ? ' today-pill' : ''}`}>
                  {day.getDate()}
                </span>
                {closed && (
                  <span className="holiday-badge" title={closed.detail || closed.label}>
                    {closed.label}
                  </span>
                )}
              </div>

              <div className="month-events">
                {showsPreview && preview && (
                  <div className="month-event is-preview" title="Proposed event slot">
                    <span className="event-dot" />
                    <span className="month-event-label">
                      <strong>{formatTime(parseLocal(preview.start))}</strong> {preview.label}
                    </span>
                  </div>
                )}

                {regularBlocks.slice(0, maxVisibleChips).map((block) => (
                  <div
                    key={blockKey(block)}
                    className={`month-event kind-${block.kind}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveEvent({
                        block,
                        rect: e.currentTarget.getBoundingClientRect(),
                      })
                    }}
                  >
                    <span className="event-dot" />
                    <span className="month-event-label">
                      {block.kind === 'academic' ? (
                        block.label
                      ) : (
                        <>
                          <span className="event-time">{formatTime(parseLocal(block.start))}</span>{' '}
                          {block.label}
                        </>
                      )}
                    </span>
                  </div>
                ))}

                {overflowCount > 0 && (
                  <button
                    type="button"
                    className="overflow-pill"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDayExpanded(day)
                    }}
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {activeEvent && (
        <EventDetailsPopover
          block={activeEvent.block}
          anchorRect={activeEvent.rect}
          onClose={() => setActiveEvent(null)}
          onDelete={
            onDeleteEvent && typeof activeEvent.block.event_id === 'number'
              ? () => {
                  onDeleteEvent(activeEvent.block.event_id as number)
                  setActiveEvent(null)
                }
              : undefined
          }
          onMove={
            onMoveEvent && typeof activeEvent.block.event_id === 'number'
              ? (targetDay) => {
                  onMoveEvent(activeEvent.block, targetDay)
                  setActiveEvent(null)
                }
              : undefined
          }
        />
      )}

      {dayExpanded && (
        <DayEventsModal
          day={dayExpanded}
          blocks={byDay.get(dayExpanded.toDateString()) ?? []}
          onClose={() => setDayExpanded(null)}
          onEventClick={(block, rect) => {
            setDayExpanded(null)
            setActiveEvent({ block, rect })
          }}
        />
      )}
    </div>
  )
}

function EventDetailsPopover({
  block,
  anchorRect,
  onClose,
  onDelete,
  onMove,
}: {
  block: Busy
  anchorRect: DOMRect
  onClose: () => void
  onDelete?: () => void
  onMove?: (day: Date) => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [showReschedule, setShowReschedule] = useState(false)

  const start = parseLocal(block.start)
  const end = parseLocal(block.end)
  const isWholeDay = block.kind === 'closed' || block.kind === 'academic'

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onPointerDown(e: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const t = setTimeout(() => window.addEventListener('pointerdown', onPointerDown), 0)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
      clearTimeout(t)
    }
  }, [onClose])

  // Calculate smart placement relative to anchorRect
  const style = useMemo(() => {
    const margin = 10
    const popWidth = 320
    let left = anchorRect.left
    if (left + popWidth > window.innerWidth - 16) {
      left = window.innerWidth - popWidth - 16
    }
    if (left < 16) left = 16

    let top = anchorRect.bottom + margin
    if (top + 280 > window.innerHeight && anchorRect.top > 280) {
      top = anchorRect.top - 280 - margin
    }
    return { left: `${left}px`, top: `${top}px` }
  }, [anchorRect])

  return (
    <div className="event-popover-portal">
      <div ref={popoverRef} className="event-popover" style={style} role="dialog">
        <div className="popover-header">
          <span className={`event-badge kind-${block.kind}`}>{KIND_NAMES[block.kind]}</span>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        <h4 className="popover-title">{block.label}</h4>

        <div className="popover-meta">
          <div className="meta-item">
            <Icon name="calendar" size={15} />
            <span>{formatDay(start)}</span>
          </div>
          {!isWholeDay && (
            <div className="meta-item">
              <Icon name="clock" size={15} />
              <span>
                {formatTime(start)} - {formatTime(end)}
              </span>
            </div>
          )}
        </div>

        {block.detail && <p className="popover-detail">{block.detail}</p>}

        {block.weight > 0 && !isWholeDay && (
          <div className="popover-attendance">
            <Icon name="users" size={14} />
            <span>Affects ~{Math.round(block.weight)} students</span>
          </div>
        )}

        {(onDelete || onMove) && (
          <div className="popover-actions">
            {!confirmDelete && !showReschedule && (
              <>
                {onMove && (
                  <button
                    type="button"
                    className="btn-outline-sm"
                    onClick={() => {
                      setRescheduleDate(toDateInput(start))
                      setShowReschedule(true)
                    }}
                  >
                    Reschedule
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="btn-danger-sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" size={13} />
                    <span>Delete</span>
                  </button>
                )}
              </>
            )}

            {confirmDelete && (
              <div className="confirm-delete-box">
                <span>Delete this event?</span>
                <div className="confirm-buttons">
                  <button type="button" className="btn-secondary-xs" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-danger-xs" onClick={onDelete}>
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}

            {showReschedule && (
              <div className="reschedule-box">
                <label htmlFor="resched-date">New Date:</label>
                <input
                  id="resched-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
                <div className="confirm-buttons">
                  <button type="button" className="btn-secondary-xs" onClick={() => setShowReschedule(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary-xs"
                    onClick={() => {
                      if (rescheduleDate && onMove) {
                        onMove(parseLocal(`${rescheduleDate}T00:00:00`))
                      }
                    }}
                  >
                    Move
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DayEventsModal({
  day,
  blocks,
  onClose,
  onEventClick,
}: {
  day: Date
  blocks: Busy[]
  onClose: () => void
  onEventClick: (block: Busy, rect: DOMRect) => void
}) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card day-events-modal" role="dialog">
        <div className="modal-header">
          <div>
            <span className="text-muted text-xs uppercase font-mono">Events for</span>
            <h3>{formatDay(day)}</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="day-modal-list">
          {blocks.map((block) => (
            <div
              key={blockKey(block)}
              className={`day-modal-event kind-${block.kind}`}
              onClick={(e) => onEventClick(block, e.currentTarget.getBoundingClientRect())}
            >
              <div className="day-modal-event-head">
                <span className={`event-badge kind-${block.kind}`}>{KIND_NAMES[block.kind]}</span>
                <span className="text-muted text-sm">
                  {block.kind === 'closed' || block.kind === 'academic'
                    ? 'All Day'
                    : `${formatTime(parseLocal(block.start))} - ${formatTime(parseLocal(block.end))}`}
                </span>
              </div>
              <strong className="day-modal-event-title">{block.label}</strong>
              {block.detail && <p className="text-muted text-xs mt-1">{block.detail}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

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
  label?: string
  step?: number
}) {
  return (
    <div className="month-toolbar">
      <div className="toolbar-left">
        <button
          className="btn-toolbar"
          type="button"
          onClick={() => onChange(startOfMonth(new Date()))}
          title="Jump to today"
        >
          Today
        </button>
        <div className="nav-arrows">
          <button
            className="btn-icon-toolbar"
            type="button"
            aria-label="Previous month"
            onClick={() => onChange(addMonths(month, -step))}
          >
            <Icon name="caretLeft" size={16} />
          </button>
          <button
            className="btn-icon-toolbar"
            type="button"
            aria-label="Next month"
            onClick={() => onChange(addMonths(month, step))}
          >
            <Icon name="caretRight" size={16} />
          </button>
        </div>
        <h2 className="month-title">{label ?? formatMonth(month)}</h2>
      </div>

      <div className="toolbar-right">{children}</div>
    </div>
  )
}
