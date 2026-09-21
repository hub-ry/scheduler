import React, { useMemo, useState } from 'react'
import {
  api,
  ApiError,
  type Idea,
  type Package,
  type RankRequest,
  type Slot,
} from '../api'
import {
  addDays,
  addMonths,
  formatDay,
  formatTime,
  monthGrid,
  parseLocal,
  startOfMonth,
  toDateInput,
} from '../dates'
import { describeError, moveEventToDay } from '../eventEdits'
import { useAsyncData } from '../useAsyncData'
import { useToast } from '../toastContext'
import { CoffeeRingArt } from './CoffeeRingArt'
import { Icon } from './Icons'
import { ManageCalendarModal } from './ManageCalendarModal'
import { MonthCalendar, type CalendarSpan, type PreviewEvent } from './MonthCalendar'
import { QuickAddEvent } from './QuickAddEvent'
import { SlotList } from './SlotList'
import { SlotSearchForm } from './SlotSearchForm'

interface Props {
  refreshKey: number
  onChanged: () => void
  finderOpen?: boolean
  onToggleFinder?: () => void
  initialIdea?: Idea | null
}

type EventFilter = 'all' | 'exam' | 'event' | 'ours'

const LOCKED_AUDIENCE = 'Underclassmen (recruitment pool)'

function defaultWindow(): { start: string; end: string } {
  const now = new Date()
  return {
    start: toDateInput(now),
    end: toDateInput(addDays(now, 21)),
  }
}

export function CalendarTab({
  refreshKey,
  onChanged,
  finderOpen = false,
  onToggleFinder,
  initialIdea = null,
}: Props) {
  const { showToast } = useToast()
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()))
  const [filter, setFilter] = useState<EventFilter>('all')
  const [manageModalOpen, setManageModalOpen] = useState(false)
  const [adding, setAdding] = useState<{ day: Date; at: { x: number; y: number } } | true | null>(
    null,
  )
  const [recommendMode, setRecommendMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('scheduler.recommend_days') === 'true'
    } catch {
      return false
    }
  })

  function toggleRecommend() {
    setRecommendMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem('scheduler.recommend_days', String(next))
      } catch {
        // Ignore private browsing storage errors
      }
      return next
    })
  }

  const initialWindow = defaultWindow()
  const [request, setRequest] = useState<RankRequest>({
    window_start: initialWindow.start,
    window_end: initialWindow.end,
    earliest: '19:00',
    latest: '21:30',
    duration_minutes: 60,
    step_minutes: 15,
    limit: 15,
    weekdays: [0, 1, 2, 3], // Mon-Thu
    course_ids: null,
  })

  const [result, setResult] = useState<Awaited<ReturnType<typeof api.rank>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [proposed, setProposed] = useState<Slot | null>(null)
  const [hovered, setHovered] = useState<Slot | null>(null)
  const [title, setTitle] = useState(initialIdea?.title ?? '')
  const [ideaId, setIdeaId] = useState<number | ''>(initialIdea?.id ?? '')
  const [pushing, setPushing] = useState(false)

  const { data: packages } = useAsyncData<Package[]>(api.packages, `packages:${refreshKey}`, [])
  const audience = packages.find((option) => option.name === LOCKED_AUDIENCE)
  const scoped: RankRequest = { ...request, course_ids: audience?.course_ids ?? null }

  const { data: ideas } = useAsyncData<Idea[]>(api.ideas, `ideas:${refreshKey}`, [])
  const chosenIdea = ideas.find((idea) => idea.id === ideaId)
  const eventName = chosenIdea?.title ?? title.trim()

  const [span, setSpan] = useState<CalendarSpan>(1)

  // Calculate calendar date range covering all months in the selected span
  const months = useMemo(
    () => Array.from({ length: span }, (_, index) => addMonths(anchor, index)),
    [anchor, span],
  )
  const firstGrid = useMemo(() => monthGrid(months[0]), [months])
  const lastGrid = useMemo(() => monthGrid(months[months.length - 1]), [months])
  const windowStart = toDateInput(firstGrid[0])
  const windowEnd = toDateInput(addDays(lastGrid[lastGrid.length - 1], 1))

  const { data: rawBlocks } = useAsyncData(
    () => api.busy(`${windowStart}T00:00:00`, `${windowEnd}T00:00:00`),
    `${windowStart}:${windowEnd}:${refreshKey}`,
    [],
  )

  const blocks = useMemo(() => {
    if (filter === 'all') return rawBlocks
    return rawBlocks.filter(
      (b) => b.kind === 'closed' || b.kind === 'academic' || b.kind === filter,
    )
  }, [rawBlocks, filter])

  const activeSlot = hovered ?? proposed
  const preview: PreviewEvent | null = activeSlot
    ? {
        start: activeSlot.start,
        end: activeSlot.end,
        label: eventName || 'Proposed Slot',
      }
    : null

  async function handleEdit(change: Promise<unknown>, successMessage?: string) {
    try {
      await change
      onChanged()
      if (successMessage) showToast(successMessage, 'success')
    } catch (caught) {
      showToast(describeError(caught), 'error')
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSearchError(null)
    setProposed(null)
    try {
      const res = await api.rank(scoped)
      setResult(res)
      if (res.slots.length > 0) {
        showToast(`Found ${res.slots.length} available slots`, 'info')
      }
    } catch (caught) {
      const msg = caught instanceof ApiError ? caught.message : String(caught)
      setSearchError(msg)
      showToast(msg, 'error')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  function handleProposeSlot(slot: Slot | null) {
    setProposed(slot)
    if (slot) {
      setAnchor(startOfMonth(parseLocal(slot.start)))
    }
  }

  async function commitBooking() {
    if (!proposed) return
    const finalTitle = eventName || 'BoilerMake Event'
    setPushing(true)

    try {
      const created = await api.createEvent({
        title: finalTitle,
        organization: 'BoilerMake',
        location: '',
        starts_at: proposed.start,
        ends_at: proposed.end,
        expected_attendance: 0,
        audience_fraction: 1,
        source: 'manual',
        is_ours: true,
      })

      if (ideaId) {
        await api.updateIdea(ideaId, { event_id: created.id })
      }

      onChanged()
      showToast(`Booked "${finalTitle}" for ${formatDay(parseLocal(proposed.start))}`, 'success')
      setProposed(null)
      setTitle('')
      setIdeaId('')
    } catch (caught) {
      const msg = caught instanceof ApiError ? caught.message : String(caught)
      showToast(msg, 'error')
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="notion-calendar-layout">
      {finderOpen && (
        <aside className="notion-finder-sidebar">
          <div className="notion-finder-header">
            <div className="finder-header-title">
              <Icon name="sparkle" size={15} />
              <span>Find Best Time</span>
            </div>
            <button
              type="button"
              className="notion-btn-icon"
              onClick={onToggleFinder}
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          <div className="notion-finder-content">
            <SlotSearchForm
              request={request}
              onChange={setRequest}
              onSubmit={search}
              loading={loading}
              packages={packages}
              title="Filter Constraints"
              hint="Set duration, target audience, and days"
            />

            <SlotList
              result={result}
              error={searchError}
              proposed={proposed}
              onProposeSlot={handleProposeSlot}
              onHoverSlot={setHovered}
              title="Ranked Suggestions"
            />

            {proposed && (
              <div className="notion-booking-card">
                <div className="booking-card-head">
                  <span className="notion-label-xs">Selected Slot</span>
                  <button
                    type="button"
                    className="notion-btn-icon"
                    onClick={() => setProposed(null)}
                    aria-label="Deselect slot"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>

                <div className="booking-slot-info">
                  <strong>{formatDay(parseLocal(proposed.start))}</strong>
                  <span>
                    {formatTime(parseLocal(proposed.start))} - {formatTime(parseLocal(proposed.end))}
                  </span>
                </div>

                <div className="booking-inputs">
                  <input
                    type="text"
                    placeholder="Event title..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />

                  {ideas.length > 0 && (
                    <select
                      value={ideaId}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value)
                        setIdeaId(val)
                        const matching = ideas.find((i) => i.id === val)
                        if (matching) setTitle(matching.title)
                      }}
                    >
                      <option value="">Link to backlog idea (optional)</option>
                      {ideas.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.title}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    className="notion-btn-primary"
                    onClick={commitBooking}
                    disabled={pushing}
                  >
                    {pushing ? 'Booking...' : 'Book This Slot'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="notion-calendar-content">
        <CoffeeRingArt className="spill-ambient-ring" />
        <MonthCalendar
          month={anchor}
          span={span}
          onSpanChange={setSpan}
          blocks={blocks}
          preview={preview}
          highlight={proposed ? parseLocal(proposed.start) : null}
          recommendMode={recommendMode}
          onMonthChange={setAnchor}
          onManageInCalendar={() => setManageModalOpen(true)}
          onPickDay={(day, at) => setAdding({ day, at })}
          onDeleteEvent={(id) => handleEdit(api.deleteEvent(id), 'Event deleted')}
          onMoveEvent={(block, day) =>
            handleEdit(moveEventToDay(block, day), `Rescheduled to ${toDateInput(day)}`)
          }
          onUpdateEvent={(id, patch) => handleEdit(api.updateEvent(id, patch), 'Event updated')}
          headerActions={
            <div className="notion-toolbar-actions">
              <button
                type="button"
                role="switch"
                aria-checked={recommendMode}
                className={`notion-switch-btn ${recommendMode ? 'is-active' : ''}`}
                onClick={toggleRecommend}
                title="Highlight conflict-free days to host events (weekdays, 7:00 PM and beyond)"
              >
                <span className="switch-track">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-sparkle">✦</span>
                <span className="switch-label">Recommend Days</span>
              </button>

              <div className="notion-filter-pills">
                <button
                  type="button"
                  className={`notion-filter-pill ${filter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`notion-filter-pill ${filter === 'ours' ? 'is-active' : ''}`}
                  onClick={() => setFilter('ours')}
                >
                  Our Events
                </button>
                <button
                  type="button"
                  className={`notion-filter-pill ${filter === 'exam' ? 'is-active' : ''}`}
                  onClick={() => setFilter('exam')}
                >
                  Exams
                </button>
                <button
                  type="button"
                  className={`notion-filter-pill ${filter === 'event' ? 'is-active' : ''}`}
                  onClick={() => setFilter('event')}
                >
                  Competing
                </button>
              </div>
            </div>
          }
        />
      </div>

      {manageModalOpen && (
        <ManageCalendarModal
          onClose={() => setManageModalOpen(false)}
          onRefresh={onChanged}
        />
      )}

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
