import { api, ApiError, type Busy } from './api'
import { parseLocal, toDateInput } from './dates'

/**
 * The two edits the calendar itself can make to a club event.
 *
 * Shared by both screens that draw a month grid so that dragging a chip means
 * the same thing wherever you happen to be standing when you drag it.
 */

/** Naive local datetime, the only format the API speaks. Never toISOString. */
function stamp(date: Date): string {
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
  return `${toDateInput(date)}T${time}`
}

/**
 * Put an event on another day at the same time, for the same length.
 *
 * The length is carried rather than the end date being moved by the same number
 * of days, so an event dragged across a daylight-saving boundary stays the hour
 * it was booked for rather than becoming fifty-nine or sixty-one minutes.
 */
export async function moveEventToDay(block: Busy, day: Date): Promise<void> {
  if (typeof block.event_id !== 'number') return
  const start = parseLocal(block.start)
  const end = parseLocal(block.end)
  const moved = new Date(day)
  moved.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0)
  const movedEnd = new Date(moved.getTime() + (end.getTime() - start.getTime()))
  await api.updateEvent(block.event_id, { starts_at: stamp(moved), ends_at: stamp(movedEnd) })
}

export function describeError(caught: unknown): string {
  return caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)
}
