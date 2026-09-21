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

interface Props {
  month: Date
  blocks: Busy[]
  preview?: PreviewEvent | null
  highlight?: Date | null
  onPickDay?: (day: Date, at: { x: number; y: number }) => void
  onMonthChange?: (month: Date) => void
  onManageInCalendar?: () => void
  onDeleteEvent?: (id: number) => void
  onMoveEvent?: (block: Busy, day: Date) => void
  headerActions?: React.ReactNode
}

function blockKey(block: Busy): string {
  return `${block.kind}-${block.label}-${block.start}-${block.event_id ?? ''}`
}

const KIND_NAMES: Record<Busy['kind'], string> = {
  course: 'Class Meeting',
  exam: 'Exam Sitting',
  event: 'Competing Event',
  ours: 'Our Event',
  closed: 'Campus Closed',
  academic: 'Academic Break',
}

function formatCellDateLabel(day: Date): { text: string; isFirst: boolean } {
  if (day.getDate() === 1) {
    const monthShort = day.toLocaleString('en-US', { month: 'short' })
    return { text: `${monthShort} 1`, isFirst: true }
  }
  return { text: String(day.getDate()), isFirst: false }
}

export function MonthCalendar({
  month,
  blocks,
  preview = null,
  highlight = null,
  onPickDay,
  onMonthChange,
  onManageInCalendar,
  onDeleteEvent,
  onMoveEvent,
  headerActions,
}: Props) {
  const [activeEvent, setActiveEvent] = useState<{ block: Busy; rect: DOMRect } | null>(null)
  const [dayExpanded, setDayExpanded] = useState<Date | null>(null)

  const days = useMemo(() => monthGrid(month), [month])
  const monthStart = startOfMonth(month)
  const today = useMemo(() => new Date(), [])
  const rowCount = Math.ceil(days.length / 7)

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

  const maxVisibleChips = 3

  return (
    <div className="notion-calendar-view">
      {/* Header bar */}
      <div className="notion-calendar-header">
        <div className="header-left">
          <h2 className="notion-month-title">{formatMonth(month)}</h2>
        </div>

        <div className="header-right">
          {headerActions}

          {onManageInCalendar && (
            <button
              type="button"
              className="notion-btn-manage"
              onClick={onManageInCalendar}
              title="Manage calendars and Google sync"
            >
              <Icon name="calendar21" size={15} />
              <span>Manage in Calendar</span>
            </button>
          )}

          {onMonthChange && (
            <div className="notion-nav-group">
              <button
                type="button"
                className="notion-nav-btn notion-nav-arrow"
                onClick={() => onMonthChange(addMonths(month, -1))}
                aria-label="Previous month"
                title="Previous month"
              >
                <Icon name="caretLeft" size={15} />
              </button>
              <button
                type="button"
                className="notion-nav-btn notion-nav-today"
                onClick={() => onMonthChange(startOfMonth(new Date()))}
                title="Jump to today"
              >
                Today
              </button>
              <button
                type="button"
                className="notion-nav-btn notion-nav-arrow"
                onClick={() => onMonthChange(addMonths(month, 1))}
                aria-label="Next month"
                title="Next month"
              >
                <Icon name="caretRight" size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Weekday headers: Sun Mon Tue Wed Thu Fri Sat */}
      <div className="notion-weekday-row">
        {DAY_NAMES.map((name) => (
          <div key={name} className="notion-weekday-label">
            {name}
          </div>
        ))}
      </div>

      {/* Month grid: exactly 35 or 42 cells filling available space */}
      <div className="notion-month-grid-wrapper">
        <div
          className="notion-month-grid"
          style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
        >
          {days.map((day) => {
            const key = day.toDateString()
            const isOutside = day.getMonth() !== monthStart.getMonth()
            const isToday = isSameDay(day, today)
            const showsPreview = key === previewDay
            const closed = closedDays.get(key)
            const isHighlighted = highlight ? isSameDay(day, highlight) : false

            const dayBlocks = byDay.get(key) ?? []
            const regularBlocks = dayBlocks.filter((b) => b.kind !== 'closed')
            const overflowCount = regularBlocks.length - maxVisibleChips
            const { text: dateText } = formatCellDateLabel(day)

            const cellClasses = [
              'notion-cell',
              isOutside && 'is-outside',
              isToday && 'is-today',
              showsPreview && 'has-preview',
              isHighlighted && 'is-highlighted',
              closed && 'is-closed',
              onPickDay && 'is-clickable',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                key={key}
                className={cellClasses}
                onClick={(e) => {
                  if (onPickDay) {
                    onPickDay(day, { x: e.clientX, y: e.clientY })
                  }
                }}
              >
                <div className="notion-cell-header">
                  {closed && (
                    <span className="notion-holiday-tag" title={closed.detail || closed.label}>
                      {closed.label}
                    </span>
                  )}
                  <div className="notion-date-wrap">
                    {isToday ? (
                      <span className="notion-today-circle">{day.getDate()}</span>
                    ) : (
                      <span className={`notion-cell-date ${isOutside ? 'is-outside' : ''}`}>
                        {dateText}
                      </span>
                    )}
                  </div>
                </div>

                <div className="notion-cell-events">
                  {showsPreview && preview && (
                    <div className="notion-event-chip is-preview" title="Proposed event slot">
                      <span className="chip-badge">★</span>
                      <span className="chip-time">{formatTime(parseLocal(preview.start))}</span>
                      <span className="chip-label">{preview.label}</span>
                    </div>
                  )}

                  {regularBlocks.slice(0, maxVisibleChips).map((block) => (
                    <div
                      key={blockKey(block)}
                      className={`notion-event-chip kind-${block.kind}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveEvent({
                          block,
                          rect: e.currentTarget.getBoundingClientRect(),
                        })
                      }}
                      title={`${block.label} (${formatTime(parseLocal(block.start))} - ${formatTime(parseLocal(block.end))})`}
                    >
                      <span className={`chip-dot kind-${block.kind}`} />
                      {block.kind !== 'academic' && (
                        <span className="chip-time">{formatTime(parseLocal(block.start))}</span>
                      )}
                      <span className="chip-label">{block.label}</span>
                    </div>
                  ))}

                  {overflowCount > 0 && (
                    <button
                      type="button"
                      className="notion-overflow-chip"
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

  const style = useMemo(() => {
    const margin = 8
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
    <div className="notion-popover-portal">
      <div ref={popoverRef} className="notion-popover" style={style} role="dialog">
        <div className="notion-popover-header">
          <span className={`notion-kind-tag kind-${block.kind}`}>{KIND_NAMES[block.kind]}</span>
          <button type="button" className="notion-btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        <h4 className="notion-popover-title">{block.label}</h4>

        <div className="notion-popover-meta">
          <div className="meta-row">
            <Icon name="calendar" size={14} />
            <span>{formatDay(start)}</span>
          </div>
          {!isWholeDay && (
            <div className="meta-row">
              <Icon name="clock" size={14} />
              <span>
                {formatTime(start)} - {formatTime(end)}
              </span>
            </div>
          )}
        </div>

        {block.detail && <p className="notion-popover-detail">{block.detail}</p>}

        {block.weight > 0 && !isWholeDay && (
          <div className="notion-popover-attendance">
            <Icon name="users" size={14} />
            <span>Affects ~{Math.round(block.weight)} students</span>
          </div>
        )}

        {(onDelete || onMove) && (
          <div className="notion-popover-actions">
            {!confirmDelete && !showReschedule && (
              <>
                {onMove && (
                  <button
                    type="button"
                    className="notion-btn-subtle-sm"
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
                    className="notion-btn-danger-sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" size={13} />
                    <span>Delete</span>
                  </button>
                )}
              </>
            )}

            {confirmDelete && (
              <div className="notion-confirm-box">
                <span>Delete event?</span>
                <div className="confirm-btn-row">
                  <button
                    type="button"
                    className="notion-btn-subtle-xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className="notion-btn-danger-xs" onClick={onDelete}>
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {showReschedule && (
              <div className="notion-reschedule-box">
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
                <div className="confirm-btn-row">
                  <button
                    type="button"
                    className="notion-btn-subtle-xs"
                    onClick={() => setShowReschedule(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="notion-btn-primary-xs"
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
    <div className="notion-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="notion-modal-card day-events-modal" role="dialog">
        <div className="notion-modal-header">
          <div>
            <div className="section-label">Events for</div>
            <h3>{formatDay(day)}</h3>
          </div>
          <button type="button" className="notion-modal-close" onClick={onClose} aria-label="Close">
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
                <span className={`notion-kind-tag kind-${block.kind}`}>{KIND_NAMES[block.kind]}</span>
                <span className="meta-time">
                  {block.kind === 'closed' || block.kind === 'academic'
                    ? 'All Day'
                    : `${formatTime(parseLocal(block.start))} - ${formatTime(parseLocal(block.end))}`}
                </span>
              </div>
              <div className="day-modal-title">{block.label}</div>
              {block.detail && <p className="day-modal-detail">{block.detail}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
