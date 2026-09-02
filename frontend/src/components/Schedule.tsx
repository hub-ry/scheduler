import { useState } from 'react'
import {
  api,
  ApiError,
  type Package,
  type RankRequest,
  type RankResponse,
  type Slot,
  type Weekday,
} from '../api'
import { addDays, formatDay, formatTime, monthGrid, parseLocal, startOfMonth, toDateInput } from '../dates'
import { clubEventToEvent } from '../gcal'
import { applyPlan, GoogleError, planTarget, requestAccessToken } from '../gcalClient'
import { useAsyncData } from '../useAsyncData'
import { MonthCalendar, MonthToolbar } from './MonthCalendar'
import { SlotList } from './SlotList'
import { SlotSearchForm } from './SlotSearchForm'

/**
 * Schedule a date: suggest, see it in place, commit it.
 *
 * These three used to be separate tabs, which made the actual question - "what
 * does my month look like if I take this slot?" - something you had to hold in
 * your head while switching views. Here, hovering a suggestion draws it into
 * the month grid among everything it would compete with, so the comparison is
 * visual and costs nothing. Committing pushes it to Google Calendar.
 *
 * The audience is pinned to one package rather than offered as a control. There
 * is only one club using this, and a picker whose answer never changes is one
 * more thing to read past on the screen you use most.
 */

/** The audience every search runs against. Swap this to re-point the app. */
const LOCKED_AUDIENCE = 'CS'

const DEFAULT_WEEKDAYS: Weekday[] = [0, 1, 2, 3]

function defaultRequest(): RankRequest {
  const today = new Date()
  return {
    window_start: toDateInput(today),
    window_end: toDateInput(addDays(today, 13)),
    duration_minutes: 60,
    earliest: '17:00',
    latest: '22:00',
    weekdays: DEFAULT_WEEKDAYS,
    step_minutes: 30,
    limit: 12,
  }
}

interface Props {
  onChanged: () => void
  refreshKey: number
}

export function Schedule({ onChanged, refreshKey }: Props) {
  // Local again: the week view used to share this, and it is gone.
  const [proposed, onProposeSlot] = useState<Slot | null>(null)
  const [request, setRequest] = useState<RankRequest>(defaultRequest)
  const [result, setResult] = useState<RankResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [hovered, setHovered] = useState<Slot | null>(null)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  const [title, setTitle] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState<string | null>(null)

  // Hover wins over the committed choice: while the pointer is on a row, the
  // grid answers "what if this one instead?" rather than showing the old pick.
  const showing = hovered ?? proposed

  const days = monthGrid(month)
  const from = toDateInput(days[0])
  const to = toDateInput(addDays(days[days.length - 1], 1))
  const { data: packages } = useAsyncData<Package[]>(
    api.packages,
    `packages:${refreshKey}`,
    [],
  )

  // Derived rather than stored: the request carries whatever the pinned package
  // holds right now, so editing its membership on the Setup tab takes effect on
  // the next search without anything here having to be told about it.
  const audience = packages.find((option) => option.name === LOCKED_AUDIENCE)
  const scoped: RankRequest = { ...request, course_ids: audience?.course_ids ?? null }

  const { data: blocks } = useAsyncData(
    () => api.busy(`${from}T00:00:00`, `${to}T00:00:00`),
    `${from}:${refreshKey}`,
    [],
  )

  async function search(submit: React.FormEvent) {
    submit.preventDefault()
    setLoading(true)
    setError(null)
    onProposeSlot(null)
    setPushed(null)
    try {
      setResult(await api.rank(scoped))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  /** Follow a proposal into its month, so committing never scrolls out of view. */
  function propose(slot: Slot | null) {
    onProposeSlot(slot)
    setPushed(null)
    if (slot) setMonth(startOfMonth(parseLocal(slot.start)))
  }

  /**
   * Save the chosen slot as our event, then push that calendar to Google.
   *
   * Written to the database first so it survives the browser and shows up as a
   * conflict for the next search; Google is a mirror of that, not the record.
   */
  async function commit() {
    if (!proposed) return
    setPushing(true)
    setError(null)
    try {
      await api.createEvent({
        title: title.trim() || 'Our event',
        organization: '',
        location: '',
        starts_at: proposed.start,
        ends_at: proposed.end,
        expected_attendance: 0,
        audience_fraction: 1,
        source: 'manual',
        is_ours: true,
      })
      onChanged()

      const ours = (await api.events()).filter((event) => event.is_ours)
      const token = await requestAccessToken()
      const plan = await planTarget(token, 'ours', await Promise.all(ours.map(clubEventToEvent)))
      await applyPlan(token, plan)

      setPushed('Booked and pushed to Google Calendar.')
      onProposeSlot(null)
      setTitle('')
    } catch (caught) {
      const message =
        caught instanceof ApiError || caught instanceof GoogleError || caught instanceof Error
          ? caught.message
          : String(caught)
      // The event is saved even when the push fails, and saying so stops anyone
      // pressing this again and creating a duplicate row chasing the sync.
      setError(`${message} - the event is saved; re-push from the Google Calendar tab.`)
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="plan">
      <div className="plan-side">
        <SlotSearchForm
          request={request}
          onChange={setRequest}
          onSubmit={search}
          loading={loading}
          title="What are you scheduling?"
          hint={audience ? `Ranked against ${audience.course_codes.length} ${audience.name} courses.` : undefined}
        />
        <SlotList
          result={result}
          error={error}
          proposed={proposed}
          onProposeSlot={propose}
          onHoverSlot={setHovered}
          title="Suggestions"
        />
      </div>

      <div className="plan-main card">
        <MonthToolbar month={month} onChange={setMonth}>
          {showing ? (
            <span className={`faint${hovered ? ' is-previewing' : ''}`}>
              {hovered ? 'Previewing' : 'Chosen'} · {formatDay(parseLocal(showing.start))}{' '}
              {formatTime(parseLocal(showing.start))}
            </span>
          ) : (
            <span className="faint">Hover a suggestion to see it here</span>
          )}
        </MonthToolbar>

        <MonthCalendar
          month={month}
          blocks={blocks}
          preview={
            showing
              ? { start: showing.start, end: showing.end, label: title.trim() || 'Your event' }
              : null
          }
        />

        <div className="legend">
          <span className="proposed">Your event</span>
          <span className="exam">Exam</span>
          <span className="event">Competing event</span>
          <span className="course">Class meeting</span>
        </div>

        {pushed && <div className="notice ok">{pushed}</div>}

        <div className="plan-commit">
          <div className="field">
            <label htmlFor="event-title">Event name</label>
            <input
              id="event-title"
              value={title}
              placeholder="Callout #2"
              onChange={(event) => setTitle(event.target.value)}
              disabled={!proposed || pushing}
            />
          </div>
          <button className="primary" type="button" onClick={commit} disabled={!proposed || pushing}>
            {pushing ? 'Booking…' : 'Book it and push to Google'}
          </button>
        </div>
        {!proposed && (
          <p className="hint">
            Click a suggestion to choose it. Hovering only previews - nothing is written until you
            book.
          </p>
        )}
      </div>
    </div>
  )
}
