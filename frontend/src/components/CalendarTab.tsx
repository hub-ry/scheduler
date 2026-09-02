import { useState } from 'react'
import type { Slot } from '../api'
import { MonthView } from './MonthView'
import { WeekCalendar } from './WeekCalendar'

/**
 * Looking at the schedule, month or week.
 *
 * Two tabs before this, which is one tab per zoom level - a distinction that
 * belongs inside a view rather than in the app's top-level navigation.
 */

type Scale = 'month' | 'week'

interface Props {
  proposed: Slot | null
  refreshKey: number
}

export function CalendarTab({ proposed, refreshKey }: Props) {
  const [scale, setScale] = useState<Scale>('month')

  return (
    <div className="calendar-tab">
      <div className="scale-toggle" role="tablist" aria-label="Calendar scale">
        {(['month', 'week'] as Scale[]).map((option) => (
          <button
            key={option}
            role="tab"
            type="button"
            aria-selected={scale === option}
            onClick={() => setScale(option)}
          >
            {option === 'month' ? 'Month' : 'Week'}
          </button>
        ))}
      </div>

      {scale === 'month' ? (
        <MonthView refreshKey={refreshKey} />
      ) : (
        <WeekCalendar proposed={proposed} refreshKey={refreshKey} />
      )}
    </div>
  )
}
