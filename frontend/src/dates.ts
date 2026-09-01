/**
 * Date helpers.
 *
 * Everything the API exchanges is a naive local datetime string
 * (`2026-09-23T20:00:00`) - the campus has one timezone and introducing UTC
 * offsets would only create off-by-one-day bugs in the week grid. These helpers
 * keep that convention in one place.
 */

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** `2026-09-23` for a Date, in local time (not `toISOString`, which shifts to UTC). */
export function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseLocal(value: string): Date {
  return new Date(value)
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const offset = (result.getDay() + 6) % 7 // JS weeks start Sunday; ours start Monday.
  result.setDate(result.getDate() - offset)
  result.setHours(0, 0, 0, 0)
  return result
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** `8:00 PM`. */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** `Wed, Sep 23`. */
export function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Minutes since midnight, used to position blocks on the week grid. */
export function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/** First of the month containing `date`, at midnight. */
export function startOfMonth(date: Date): Date {
  const result = new Date(date)
  result.setDate(1)
  result.setHours(0, 0, 0, 0)
  return result
}

export function addMonths(date: Date, months: number): Date {
  const result = startOfMonth(date)
  result.setMonth(result.getMonth() + months)
  return result
}

/**
 * The days a month grid draws: whole weeks, Monday-first, covering the month
 * and the days either side that share its first and last weeks.
 *
 * Always six rows. A month can genuinely need six, and a grid that changed
 * height between May and June would make the whole page jump when paging
 * through - worse than one trailing row of greyed-out dates.
 */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month))
  return Array.from({ length: 42 }, (_, index) => addDays(first, index))
}

/** `September 2026`. */
export function formatMonth(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}
