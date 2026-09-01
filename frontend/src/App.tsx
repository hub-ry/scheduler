import { useState } from 'react'
import type { Slot } from './api'
import { Courses } from './components/Courses'
import { Events } from './components/Events'
import { GoogleSync } from './components/GoogleSync'
import { MonthView } from './components/MonthView'
import { Plan } from './components/Plan'
import { Import } from './components/Import'
import { WeekCalendar } from './components/WeekCalendar'

type Tab = 'plan' | 'month' | 'week' | 'events' | 'courses' | 'import' | 'google'

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'month', label: 'Calendar' },
  { id: 'week', label: 'Week' },
  { id: 'events', label: 'Events' },
  { id: 'courses', label: 'Courses' },
  { id: 'import', label: 'Import' },
  { id: 'google', label: 'Google Calendar' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('plan')
  const [proposed, setProposed] = useState<Slot | null>(null)
  // Anything that writes bumps this, so views holding fetched data refetch
  // rather than showing a stale calendar after an import or an edit.
  const [refreshKey, setRefreshKey] = useState(0)

  const invalidate = () => setRefreshKey((key) => key + 1)

  // Just records the choice. It used to switch tabs as well, back when the
  // suggestions and the calendar were separate views; on the Plan tab the
  // calendar is already on screen, so jumping would take it away.
  function proposeSlot(slot: Slot | null) {
    setProposed(slot)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Scheduler</h1>
          <p>Find a time your people are actually free.</p>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'plan' && (
        <Plan
          onChanged={invalidate}
          refreshKey={refreshKey}
          proposed={proposed}
          onProposeSlot={proposeSlot}
        />
      )}
      {tab === 'month' && <MonthView refreshKey={refreshKey} />}
      {tab === 'week' && <WeekCalendar proposed={proposed} refreshKey={refreshKey} />}
      {tab === 'events' && (
        <Events
          onChanged={invalidate}
          prefill={proposed ? { starts_at: proposed.start, ends_at: proposed.end } : null}
        />
      )}
      {tab === 'courses' && <Courses onChanged={invalidate} />}
      {tab === 'import' && <Import onChanged={invalidate} />}
      {tab === 'google' && <GoogleSync />}
    </div>
  )
}
