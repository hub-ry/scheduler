import type { Busy } from './api'
import { parseLocal } from './dates'

export interface DayRecommendation {
  isRecommended: boolean
  reason: string
  slotLabel?: string
}

/**
 * Determines whether a day is recommended to host a club event:
 * - Must be a weekday (Monday through Friday).
 * - Campus must be open (not closed or university holiday).
 * - Must not be an academic break (e.g. Fall Break, Thanksgiving).
 * - Evening window (7:00 PM / 19:00 and beyond) must have no conflicting exams,
 *   competing events, or existing bookings.
 */
export function evaluateDayRecommendation(
  day: Date,
  dayBlocks: Busy[],
  closedDays: Map<string, Busy>,
): DayRecommendation {
  const dayOfWeek = day.getDay() // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isRecommended: false, reason: 'Weekend' }
  }

  const key = day.toDateString()
  const closed = closedDays.get(key)
  if (closed) {
    return { isRecommended: false, reason: closed.label || 'Campus Closed' }
  }

  // Academic break check
  const breakBlock = dayBlocks.find(
    (b) => b.kind === 'closed' || (b.kind === 'academic' && /break|recess|holiday|vacation/i.test(b.label)),
  )
  if (breakBlock) {
    return { isRecommended: false, reason: breakBlock.label }
  }

  // Evening window check: 7:00 PM (19:00) onwards
  // 19:00 is 1140 minutes into the day.
  // Purdue evening exams commonly start at 6:30 PM (1110 min) or 8:00 PM (1200 min).
  // Any exam starting >= 18:30 or running past 19:00 conflicts with hosting.
  const eveningConflict = dayBlocks.find((b) => {
    if (b.kind === 'academic') return false
    const start = parseLocal(b.start)
    const end = parseLocal(b.end)
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()

    // Exam starting at or after 18:30 (6:30 PM)
    if (b.kind === 'exam' && startMinutes >= 1110) return true

    // Any event or exam running into or during 19:00 - 22:30 (1140 - 1350)
    const overlapsEvening = startMinutes < 1350 && endMinutes > 1140
    return overlapsEvening
  })

  if (eveningConflict) {
    const timeLabel = parseLocal(eveningConflict.start).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
    return {
      isRecommended: false,
      reason: `${eveningConflict.label} (${timeLabel})`,
    }
  }

  return {
    isRecommended: true,
    reason: 'Clear evening - 7:00 PM+ open to host',
    slotLabel: '7:00 PM+ Host Window',
  }
}
