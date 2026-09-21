import { useState } from 'react'
import { api, ApiError, type Busy, type Idea, type Package, type RankRequest, type Slot } from '../api'
import {
  addDays,
  addMonths,
  endOfMonth,
  formatDay,
  formatTime,
  parseLocal,
  startOfMonth,
  toDateInput,
} from '../dates'
import { describeError, moveEventToDay } from '../eventEdits'
import { applyPlan, GoogleError, planTarget, requestAccessToken } from '../gcalClient'
import { clubEventToEvent } from '../gcal'
import { useAsyncData } from '../useAsyncData'
import { Icon } from './Icons'
import { type DayRange, MonthCalendar, MonthToolbar, type PreviewEvent } from './MonthCalendar'
import { QuickAddEvent } from './QuickAddEvent'
import { SlotList } from './SlotList'
import { SlotSearchForm } from './SlotSearchForm'
import { useToast } from '../toastContext'

interface Props {
  onChanged: () => void
  refreshKey: number
}

const LOCKED_AUDIENCE = 'Underclassmen (recruitment pool)'

function defaultWindow(): { start: string; end: string } {
  const now = new Date()
  return {
    start: toDateInput(now),
    end: toDateInput(addDays(now, 21)),
  }
}

export function Schedule({ onChanged, refreshKey }: Props) {
  const { showToast } = useToast()
  const initialWindow = defaultWindow()

  const [request, setRequest] = useState<RankRequest>({
    window_start: initialWindow.start,
    window_end: initialWindow.end,
    earliest: '19:00',
    latest: '21:30',
    duration_minutes: 60,
    step_minutes: 15,
    limit: 15,
    weekdays: [1, 2, 3, 4],
    course_ids: null,
  })

  const [result, setResult] = useState<Awaited<ReturnType<typeof api.rank>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))

  const [proposed, setProposed] = useState<Slot | null>(null)
  const [hovered, setHovered] = useState<Slot | null>(null)
  const [title, setTitle] = useState('')
  const [ideaId, setIdeaId] = useState<number | ''>('')
  const [pushing, setPushing] = useState(false)
  const [addingEvent, setAddingEvent] = useState<{ day?: Date; at?: { x: number; y: number } } | null>(null)

  const { data: packages } = useAsyncData<Package[]>(api.packages, `packages:${refreshKey}`, [])
  const audience = packages.find((option) => option.name === LOCKED_AUDIENCE)
  const scoped: RankRequest = { ...request, course_ids: audience?.course_ids ?? null }

  const { data: ideas } = useAsyncData<Idea[]>(api.ideas, `ideas:${refreshKey}`, [])
  const unscheduled = ideas.filter((idea) => idea.event_id === null)
  const chosenIdea = ideas.find((idea) => idea.id === ideaId)
  const eventName = chosenIdea?.title ?? title.trim()

  const from = toDateInput(startOfMonth(month))
  const to = toDateInput(endOfMonth(addMonths(month, 1)))
  const { data: blocks } = useAsyncData(
    () => api.busy(`${from}T00:00:00`, `${to}T00:00:00`),
    `${from}:${refreshKey}`,
    [],
  )

  const showing = hovered ?? proposed

  async function search(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setProposed(null)
    try {
      const res = await api.rank(scoped)
      setResult(res)
      if (res.slots.length > 0) {
        showToast(`Found ${res.slots.length} available slots`, 'info')
      }
    } catch (caught) {
      const msg = caught instanceof ApiError ? caught.message : String(caught)
      setError(msg)
      showToast(msg, 'error')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  function handleProposeSlot(slot: Slot | null) {
    setProposed(slot)
    if (slot) {
      setMonth(startOfMonth(parseLocal(slot.start)))
    }
  }

  async function handleEdit(change: Promise<unknown>, successMessage?: string) {
    setError(null)
    try {
      await change
      onChanged()
      if (successMessage) showToast(successMessage, 'success')
    } catch (caught) {
      const msg = describeError(caught)
      setError(msg)
      showToast(msg, 'error')
    }
  }

  async function commitBooking() {
    if (!proposed) return
    const finalTitle = eventName || 'BoilerMake Event'
    setPushing(true)
    setError(null)

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

      if (chosenIdea) {
        await api.updateIdea(chosenIdea.id, { event_id: created.id })
      }
      onChanged()

      try {
        const ours = (await api.events()).filter((event) => event.is_ours)
        const token = await requestAccessToken()
        const plan = await planTarget(token, 'ours', await Promise.all(ours.map(clubEventToEvent)))
        await applyPlan(token, plan)
        showToast(`Booked "${finalTitle}" and synced to Google Calendar!`, 'success')
      } catch (gcalErr) {
        const msg = gcalErr instanceof GoogleError || gcalErr instanceof Error ? gcalErr.message : String(gcalErr)
        showToast(`Booked locally. Google sync note: ${msg}`, 'info')
      }

      setProposed(null)
      setTitle('')
      setIdeaId('')
    } catch (caught) {
      const msg = caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setPushing(false)
    }
  }

  const previewEvent: PreviewEvent | null = showing
    ? { start: showing.start, end: showing.end, label: eventName || 'Proposed Slot' }
    : null

  return (
    <div className="schedule-workstation">
      <aside className="schedule-sidebar">
        <SlotSearchForm
          request={request}
          onChange={setRequest}
          onSubmit={search}
          loading={loading}
          packages={packages}
          title="Find Best Times"
          hint={audience ? `Ranked against ${audience.course_codes.length} core courses.` : undefined}
        />

        {proposed && (
          <div className="booking-commit-card">
            <div className="booking-card-head">
              <div className="booking-title-wrap">
                <Icon name="checkCircle" size={18} className="text-clear" />
                <h4>Confirm & Book Slot</h4>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setProposed(null)}
                aria-label="Deselect slot"
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="booking-slot-summary">
              <strong>{formatDay(parseLocal(proposed.start))}</strong>
              <span>
                {formatTime(parseLocal(proposed.start))} - {formatTime(parseLocal(proposed.end))}
              </span>
            </div>

            <div className="booking-form-fields">
              {unscheduled.length > 0 && (
                <div className="form-group">
                  <label htmlFor="select-idea">From Event Ideas</label>
                  <select
                    id="select-idea"
                    value={ideaId}
                    disabled={pushing}
                    onChange={(e) => setIdeaId(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">Custom Event Name...</option>
                    {unscheduled.map((idea) => (
                      <option key={idea.id} value={idea.id}>
                        {idea.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {ideaId === '' && (
                <div className="form-group">
                  <label htmlFor="custom-event-title">Event Title</label>
                  <input
                    id="custom-event-title"
                    value={title}
                    placeholder="e.g. Callout #2"
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={pushing}
                  />
                </div>
              )}

              <button
                type="button"
                className="btn-book-primary"
                onClick={commitBooking}
                disabled={pushing}
              >
                {pushing ? (
                  <span className="flex-center gap-2">
                    <Icon name="sync" size={16} className="animate-spin" />
                    Booking & Syncing...
                  </span>
                ) : (
                  <span className="flex-center gap-2">
                    <Icon name="calendar" size={16} />
                    Book It & Push to Google
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        <SlotList
          result={result}
          error={error}
          proposed={proposed}
          onProposeSlot={handleProposeSlot}
          onHoverSlot={setHovered}
          title="Ranked Suggestions"
        />
      </aside>

      <main className="schedule-calendar-pane">
        <MonthToolbar month={month} onChange={setMonth}>
          <div className="legend-strip">
            <span className="legend-item"><span className="legend-dot dot-ours" />Our Event</span>
            <span className="legend-item"><span className="legend-dot dot-exam" />Exam</span>
            <span className="legend-item"><span className="legend-dot dot-event" />Competing</span>
            <span className="legend-item"><span className="legend-dot dot-closed" />Closed</span>
          </div>

          <button
            className="btn-add-event"
            type="button"
            onClick={() => setAddingEvent({ day: new Date() })}
          >
            <Icon name="plus" size={14} />
            <span>Add Event</span>
          </button>
        </MonthToolbar>

        <div className="calendar-card">
          <MonthCalendar
            month={month}
            blocks={blocks}
            preview={previewEvent}
            highlight={addingEvent?.day ?? (proposed ? parseLocal(proposed.start) : null)}
            onPickDay={(day, at) => setAddingEvent({ day, at })}
            onSelectRange={(selected: DayRange) => {
              setRequest((prev) => ({
                ...prev,
                window_start: toDateInput(selected.start),
                window_end: toDateInput(selected.end),
              }))
              showToast(`Window set: ${toDateInput(selected.start)} to ${toDateInput(selected.end)}`, 'info')
            }}
            onDeleteEvent={(id) => handleEdit(api.deleteEvent(id), 'Event removed')}
            onMoveEvent={(block: Busy, day: Date) =>
              handleEdit(moveEventToDay(block, day), `Rescheduled to ${formatDay(day)}`)
            }
          />
        </div>

        <div className="calendar-quick-tips">
          <Icon name="info" size={15} />
          <span>
            Tip: Drag across the calendar to adjust the search window. Click any day to log an event, or click an event chip for details and removal.
          </span>
        </div>
      </main>

      {addingEvent && (
        <QuickAddEvent
          day={addingEvent.day}
          at={addingEvent.at}
          onClose={() => setAddingEvent(null)}
          onAdded={() => {
            onChanged()
            showToast('Event created successfully', 'success')
          }}
        />
      )}
    </div>
  )
}
