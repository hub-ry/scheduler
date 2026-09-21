import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Busy, ClubEvent } from '../api'
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
import { evaluateDayRecommendation } from '../recommend'

export interface PreviewEvent {
  start: string
  end: string
  label: string
}

export type CalendarSpan = 1 | 3 | 6

interface Props {
  month: Date
  span?: CalendarSpan
  onSpanChange?: (span: CalendarSpan) => void
  blocks: Busy[]
  preview?: PreviewEvent | null
  highlight?: Date | null
  recommendMode?: boolean
  onPickDay?: (day: Date, at: { x: number; y: number }) => void
  onMonthChange?: (month: Date) => void
  onManageInCalendar?: () => void
  onDeleteEvent?: (id: number) => void
  onMoveEvent?: (block: Busy, day: Date) => void
  onUpdateEvent?: (
    id: number,
    patch: Partial<Pick<ClubEvent, 'title' | 'organization' | 'location' | 'starts_at' | 'ends_at'>>,
  ) => Promise<void> | void
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

function formatSpanTitle(startMonth: Date, span: CalendarSpan): string {
  if (span === 1) {
    return formatMonth(startMonth)
  }
  const endMonth = addMonths(startMonth, span - 1)
  const startYear = startMonth.getFullYear()
  const endYear = endMonth.getFullYear()
  const startName = startMonth.toLocaleDateString(undefined, { month: 'short' })
  const endName = endMonth.toLocaleDateString(undefined, { month: 'short' })
  if (startYear === endYear) {
    return `${startName} - ${endName} ${startYear}`
  }
  return `${startName} ${startYear} - ${endName} ${endYear}`
}

export function MonthCalendar({
  month,
  span = 1,
  onSpanChange,
  blocks,
  preview = null,
  highlight = null,
  recommendMode = false,
  onPickDay,
  onMonthChange,
  onManageInCalendar,
  onDeleteEvent,
  onMoveEvent,
  onUpdateEvent,
  headerActions,
}: Props) {
  const [activeEvent, setActiveEvent] = useState<{ block: Busy; rect: DOMRect } | null>(null)
  const [dayExpanded, setDayExpanded] = useState<Date | null>(null)

  const months = useMemo(
    () => Array.from({ length: span }, (_, i) => addMonths(month, i)),
    [month, span],
  )

  const today = useMemo(() => new Date(), [])

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

  const headerTitle = useMemo(() => formatSpanTitle(month, span), [month, span])

  return (
    <div className={`notion-calendar-view span-${span}`}>
      {/* Notion Calendar Header Bar */}
      <div className="notion-calendar-header">
        <div className="header-left">
          <h2 className="notion-month-title">{headerTitle}</h2>
          {span > 1 && <span className="notion-span-badge">{span} Months</span>}
        </div>

        <div className="header-right">
          {/* Zoom pills: Month | 3 Months | 6 Months */}
          {onSpanChange && (
            <div className="notion-zoom-group" role="tablist" aria-label="Calendar Zoom">
              <button
                type="button"
                role="tab"
                aria-selected={span === 1}
                className={`notion-zoom-btn ${span === 1 ? 'is-active' : ''}`}
                onClick={() => onSpanChange(1)}
              >
                Month
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={span === 3}
                className={`notion-zoom-btn ${span === 3 ? 'is-active' : ''}`}
                onClick={() => onSpanChange(3)}
              >
                3 Months
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={span === 6}
                className={`notion-zoom-btn ${span === 6 ? 'is-active' : ''}`}
                onClick={() => onSpanChange(6)}
              >
                6 Months
              </button>
            </div>
          )}

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
                onClick={() => onMonthChange(addMonths(month, -span))}
                aria-label={span === 1 ? 'Previous month' : `Previous ${span} months`}
                title={span === 1 ? 'Previous month' : `Previous ${span} months`}
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
                onClick={() => onMonthChange(addMonths(month, span))}
                aria-label={span === 1 ? 'Next month' : `Next ${span} months`}
                title={span === 1 ? 'Next month' : `Next ${span} months`}
              >
                <Icon name="caretRight" size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Section: 1-Month full view or Multi-Month stack */}
      {span === 1 ? (
        <div className="notion-single-month-wrap">
          {/* Weekday headers: Sun Mon Tue Wed Thu Fri Sat */}
          <div className="notion-weekday-row">
            {DAY_NAMES.map((name) => (
              <div key={name} className="notion-weekday-label">
                {name}
              </div>
            ))}
          </div>

          {/* Month grid: exactly 35 or 42 cells filling available space */}
          <MonthGrid
            targetMonth={month}
            blocksByDay={byDay}
            closedDays={closedDays}
            today={today}
            preview={preview}
            previewDay={previewDay}
            highlight={highlight}
            dense={false}
            recommendMode={recommendMode}
            onPickDay={onPickDay}
            onEventClick={(block, rect) => setActiveEvent({ block, rect })}
            onExpandDay={(day) => setDayExpanded(day)}
          />
        </div>
      ) : (
        <div className={`notion-month-stack span-${span}`}>
          {months.map((m) => {
            const mStart = startOfMonth(m)
            const mEnd = addMonths(mStart, 1)
            const mBlocksCount = blocks.filter((b) => {
              const d = parseLocal(b.start)
              return d >= mStart && d < mEnd
            }).length

            return (
              <section key={m.toISOString()} className="notion-month-panel">
                <div className="notion-month-panel-header">
                  <button
                    type="button"
                    className="notion-month-panel-title-btn"
                    onClick={() => {
                      onMonthChange?.(m)
                      onSpanChange?.(1)
                    }}
                    title={`Zoom into ${formatMonth(m)}`}
                  >
                    <span className="panel-title-text">{formatMonth(m)}</span>
                    <span className="panel-zoom-pill">Zoom ↗</span>
                  </button>
                  <span className="panel-event-count">
                    {mBlocksCount} event{mBlocksCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="notion-weekday-row is-dense">
                  {DAY_NAMES.map((name) => (
                    <div key={name} className="notion-weekday-label">
                      {name}
                    </div>
                  ))}
                </div>

                <MonthGrid
                  targetMonth={m}
                  blocksByDay={byDay}
                  closedDays={closedDays}
                  today={today}
                  preview={preview}
                  previewDay={previewDay}
                  highlight={highlight}
                  dense={true}
                  recommendMode={recommendMode}
                  onPickDay={onPickDay}
                  onEventClick={(block, rect) => setActiveEvent({ block, rect })}
                  onExpandDay={(day) => setDayExpanded(day)}
                />
              </section>
            )
          })}
        </div>
      )}

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
          onUpdate={
            onUpdateEvent && typeof activeEvent.block.event_id === 'number'
              ? async (patch) => {
                  await onUpdateEvent(activeEvent.block.event_id as number, patch)
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
          onPickDay={onPickDay}
          onEventClick={(block, rect) => {
            setDayExpanded(null)
            setActiveEvent({ block, rect })
          }}
        />
      )}
    </div>
  )
}

interface MonthGridProps {
  targetMonth: Date
  blocksByDay: Map<string, Busy[]>
  closedDays: Map<string, Busy>
  today: Date
  preview: PreviewEvent | null
  previewDay: string | null
  highlight: Date | null
  dense: boolean
  recommendMode?: boolean
  onPickDay?: (day: Date, at: { x: number; y: number }) => void
  onEventClick: (block: Busy, rect: DOMRect) => void
  onExpandDay: (day: Date) => void
}

function MonthGrid({
  targetMonth,
  blocksByDay,
  closedDays,
  today,
  preview,
  previewDay,
  highlight,
  dense,
  recommendMode = false,
  onPickDay,
  onEventClick,
  onExpandDay,
}: MonthGridProps) {
  const days = useMemo(() => monthGrid(targetMonth), [targetMonth])
  const monthStart = startOfMonth(targetMonth)
  const rowCount = Math.ceil(days.length / 7)
  const maxVisibleChips = dense ? 2 : 3

  return (
    <div className={`notion-month-grid-wrapper ${dense ? 'is-dense' : ''}`}>
      <div
        className={`notion-month-grid ${dense ? 'is-dense' : ''}`}
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const key = day.toDateString()
          const isOutside = day.getMonth() !== monthStart.getMonth()
          const isToday = isSameDay(day, today)
          const showsPreview = !isOutside && key === previewDay
          const closed = !isOutside ? closedDays.get(key) : undefined
          const isHighlighted = !isOutside && highlight ? isSameDay(day, highlight) : false

          // Days outside the target month do not show events to prevent overlap across months
          const dayBlocks = isOutside ? [] : (blocksByDay.get(key) ?? [])
          const regularBlocks = dayBlocks.filter((b) => b.kind !== 'closed')
          const overflowCount = isOutside ? 0 : regularBlocks.length - maxVisibleChips
          const { text: dateText } = formatCellDateLabel(day)

          // Check if this day is recommended for hosting events (weekdays, 7:00 PM+)
          const recommendation = !isOutside && recommendMode
            ? evaluateDayRecommendation(day, dayBlocks, closedDays)
            : null
          const isRecommended = Boolean(recommendMode && recommendation?.isRecommended)

          const cellClasses = [
            'notion-cell',
            dense && 'is-dense',
            isOutside && 'is-outside',
            isToday && !isOutside && 'is-today',
            isRecommended && 'is-recommended',
            showsPreview && 'has-preview',
            isHighlighted && 'is-highlighted',
            closed && 'is-closed',
            !isOutside && 'is-clickable',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div
              key={key}
              className={cellClasses}
              onClick={(e) => {
                if (isOutside) return
                // If dense, clicking cell opens DayEventsModal to easily view all events
                if (dense) {
                  onExpandDay(day)
                } else if (onPickDay) {
                  onPickDay(day, { x: e.clientX, y: e.clientY })
                }
              }}
              title={
                !isOutside && dense && regularBlocks.length > 0
                  ? `${formatDay(day)}: ${regularBlocks.length} event(s). Click to view details.`
                  : undefined
              }
            >
              <div className="notion-cell-header">
                {closed && (
                  <span className="notion-holiday-tag" title={closed.detail || closed.label}>
                    {closed.label}
                  </span>
                )}
                {isRecommended && !closed && (
                  <span
                    className="notion-recommended-tag"
                    title={recommendation?.reason || 'Recommended: Weekday evening is clear (7:00 PM+)'}
                  >
                    <span className="rec-star">✦</span>
                    <span>{dense ? '7p+' : 'Best Day (7p+)'}</span>
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
                {isRecommended && !dense && (
                  <div
                    className="notion-event-chip is-recommended-slot"
                    title="Recommended Host Window: 7:00 PM and beyond is clear. Click to schedule."
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onPickDay) {
                        onPickDay(day, { x: e.clientX, y: e.clientY })
                      }
                    }}
                  >
                    <span className="chip-dot kind-recommended" />
                    <span className="chip-time">7:00 PM+</span>
                    <span className="chip-label">Host Window</span>
                  </div>
                )}

                {showsPreview && preview && (
                  <div className="notion-event-chip is-preview" title="Proposed event slot">
                    <span className="chip-badge">★</span>
                    {!dense && <span className="chip-time">{formatTime(parseLocal(preview.start))}</span>}
                    <span className="chip-label">{preview.label}</span>
                  </div>
                )}

                {regularBlocks.slice(0, maxVisibleChips).map((block) => (
                  <div
                    key={blockKey(block)}
                    className={`notion-event-chip kind-${block.kind} ${dense ? 'is-dense' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(block, e.currentTarget.getBoundingClientRect())
                    }}
                    title={`${block.label} (${formatTime(parseLocal(block.start))} - ${formatTime(parseLocal(block.end))})`}
                  >
                    <span className={`chip-dot kind-${block.kind}`} />
                    {!dense && block.kind !== 'academic' && (
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
                      onExpandDay(day)
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
  )
}

function EventDetailsPopover({
  block,
  anchorRect,
  onClose,
  onDelete,
  onMove,
  onUpdate,
}: {
  block: Busy
  anchorRect: DOMRect
  onClose: () => void
  onDelete?: () => void
  onMove?: (day: Date) => void
  onUpdate?: (
    patch: Partial<Pick<ClubEvent, 'title' | 'organization' | 'location' | 'starts_at' | 'ends_at'>>,
  ) => Promise<void> | void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [showReschedule, setShowReschedule] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const start = parseLocal(block.start)
  const end = parseLocal(block.end)
  const isWholeDay = block.kind === 'closed' || block.kind === 'academic'

  const [editTitle, setEditTitle] = useState(block.label)
  const [editDate, setEditDate] = useState(() => toDateInput(start))
  const [editStart, setEditStart] = useState(() => {
    return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  })
  const [editEnd, setEditEnd] = useState(() => {
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  })
  const [editOrg, setEditOrg] = useState(block.detail ?? '')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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
    const estimatedHeight = isEditing ? 340 : showReschedule ? 220 : 200
    if (top + estimatedHeight > window.innerHeight) {
      top = Math.max(16, anchorRect.top - estimatedHeight - margin)
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${popWidth}px`,
    }
  }, [anchorRect, isEditing, showReschedule])

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!onUpdate) return
    if (!editTitle.trim()) {
      setEditError('Title is required')
      return
    }
    setSavingEdit(true)
    setEditError(null)
    try {
      await onUpdate({
        title: editTitle.trim(),
        organization: editOrg.trim(),
        starts_at: `${editDate}T${editStart}:00`,
        ends_at: `${editDate}T${editEnd}:00`,
      })
      onClose()
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSavingEdit(false)
    }
  }

  const canMutate = Boolean(onDelete || onMove || onUpdate)

  return (
    <div className="notion-popover-backdrop" onClick={onClose}>
      <div
        ref={popoverRef}
        className="notion-popover"
        style={style}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Event Details"
      >
        <div className="notion-popover-header">
          <div className="notion-popover-badges">
            <span className={`notion-kind-tag kind-${block.kind}`}>
              <span className={`chip-dot kind-${block.kind}`} />
              <span>{KIND_NAMES[block.kind]}</span>
            </span>
            {block.event_id && <span className="notion-editable-tag">Custom</span>}
          </div>
          <button
            type="button"
            className="notion-btn-icon"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="notion-popover-edit-form">
            <div className="notion-popover-field">
              <label htmlFor="edit-title">Title</label>
              <input
                id="edit-title"
                className="notion-input-sm"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                disabled={savingEdit}
              />
            </div>

            <div className="notion-popover-field">
              <label htmlFor="edit-date">Date</label>
              <input
                id="edit-date"
                type="date"
                className="notion-input-sm"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
                disabled={savingEdit}
              />
            </div>

            <div className="notion-form-row">
              <div className="notion-popover-field flex-1">
                <label htmlFor="edit-start">Start</label>
                <input
                  id="edit-start"
                  type="time"
                  className="notion-input-sm"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  required
                  disabled={savingEdit}
                />
              </div>
              <div className="notion-popover-field flex-1">
                <label htmlFor="edit-end">End</label>
                <input
                  id="edit-end"
                  type="time"
                  className="notion-input-sm"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  required
                  disabled={savingEdit}
                />
              </div>
            </div>

            <div className="notion-popover-field">
              <label htmlFor="edit-org">Host / Organization</label>
              <input
                id="edit-org"
                className="notion-input-sm"
                value={editOrg}
                placeholder="e.g. Purdue Hackers, ACM"
                onChange={(e) => setEditOrg(e.target.value)}
                disabled={savingEdit}
              />
            </div>

            {editError && <div className="notion-form-error">{editError}</div>}

            <div className="notion-popover-actions">
              <button
                type="button"
                className="notion-btn-subtle-sm"
                onClick={() => setIsEditing(false)}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="notion-btn-primary-sm"
                disabled={savingEdit || !editTitle.trim()}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : showReschedule && onMove ? (
          <div className="notion-reschedule-box">
            <label htmlFor="reschedule-input">Move to new date:</label>
            <input
              id="reschedule-input"
              type="date"
              className="notion-input-sm"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
            <div className="confirm-btn-row">
              <button
                type="button"
                className="notion-btn-subtle-sm"
                onClick={() => setShowReschedule(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="notion-btn-primary-sm"
                disabled={!rescheduleDate}
                onClick={() => {
                  const parsed = parseLocal(`${rescheduleDate}T00:00:00`)
                  onMove(parsed)
                }}
              >
                Move Event
              </button>
            </div>
          </div>
        ) : (
          <div className="notion-popover-body">
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

              {block.detail && (
                <div className="meta-row">
                  <Icon name="info" size={14} />
                  <span>{block.detail}</span>
                </div>
              )}

              {block.weight !== undefined && (
                <div className="meta-row faint">
                  <Icon name="users" size={14} />
                  <span>Audience Weight: {block.weight}</span>
                </div>
              )}
            </div>

            {canMutate && (
              <div className="notion-popover-actions">
                <div className="notion-popover-left-actions">
                  {onUpdate && (
                    <button
                      type="button"
                      className="notion-btn-subtle-sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Icon name="pencilSimple" size={13} />
                      <span>Edit</span>
                    </button>
                  )}
                  {onMove && (
                    <button
                      type="button"
                      className="notion-btn-subtle-sm"
                      onClick={() => {
                        setRescheduleDate(toDateInput(start))
                        setShowReschedule(true)
                      }}
                    >
                      <Icon name="calendar" size={13} />
                      <span>Move</span>
                    </button>
                  )}
                </div>

                {onDelete && !confirmDelete && (
                  <button
                    type="button"
                    className="notion-btn-danger-sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" size={13} />
                    <span>Delete</span>
                  </button>
                )}

                {confirmDelete && onDelete && (
                  <div className="notion-delete-confirm-box">
                    <span>Sure?</span>
                    <button
                      type="button"
                      className="notion-btn-danger-xs"
                      onClick={onDelete}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="notion-btn-subtle-xs"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
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
  onPickDay,
  onEventClick,
}: {
  day: Date
  blocks: Busy[]
  onClose: () => void
  onPickDay?: (day: Date, at: { x: number; y: number }) => void
  onEventClick: (block: Busy, rect: DOMRect) => void
}) {
  return (
    <div className="notion-modal-backdrop" onClick={onClose}>
      <div
        className="notion-modal-card day-events-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Events for ${formatDay(day)}`}
      >
        <div className="notion-modal-header">
          <div className="modal-title-group">
            <Icon name="calendar" size={18} />
            <div>
              <h3>{formatDay(day)}</h3>
              <p className="modal-subtitle">{blocks.length} scheduled item(s)</p>
            </div>
          </div>
          <button
            type="button"
            className="notion-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="notion-modal-body">
          {blocks.length === 0 ? (
            <div className="empty-day-state">
              <span className="empty-sparkle">✷</span>
              <p>No events or exams scheduled on this day.</p>
              {onPickDay && (
                <button
                  type="button"
                  className="notion-btn-primary"
                  onClick={(e) => {
                    onClose()
                    onPickDay(day, { x: e.clientX, y: e.clientY })
                  }}
                >
                  + Add Event on {formatDay(day)}
                </button>
              )}
            </div>
          ) : (
            <div className="modal-events-list">
              {blocks.map((block) => {
                const isWholeDay = block.kind === 'closed' || block.kind === 'academic'
                return (
                  <div
                    key={blockKey(block)}
                    className={`modal-event-item kind-${block.kind}`}
                    onClick={(e) =>
                      onEventClick(block, e.currentTarget.getBoundingClientRect())
                    }
                  >
                    <div className="item-header">
                      <span className={`chip-dot kind-${block.kind}`} />
                      <span className="item-title">{block.label}</span>
                      <span className="item-kind-pill">{KIND_NAMES[block.kind]}</span>
                    </div>
                    {!isWholeDay && (
                      <div className="item-time">
                        {formatTime(parseLocal(block.start))} - {formatTime(parseLocal(block.end))}
                      </div>
                    )}
                    {block.detail && <div className="item-detail">{block.detail}</div>}
                  </div>
                )
              })}

              {onPickDay && (
                <button
                  type="button"
                  className="notion-btn-subtle add-day-btn"
                  onClick={(e) => {
                    onClose()
                    onPickDay(day, { x: e.clientX, y: e.clientY })
                  }}
                >
                  + Add Event on {formatDay(day)}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
