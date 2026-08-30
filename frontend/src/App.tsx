import { useState } from 'react'
import type { Slot } from './api'
import { Courses } from './components/Courses'
import { Events } from './components/Events'
import { FindTime } from './components/FindTime'
import { Import } from './components/Import'
import { WeekCalendar } from './components/WeekCalendar'

type Tab = 'find' | 'calendar' | 'events' | 'courses' | 'import'

const TABS: { id: Tab; label: string }[] = [
  { id: 'find', label: 'Find a time' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'events', label: 'Events' },
  { id: 'courses', label: 'Courses' },
  { id: 'import', label: 'Import' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('find')
  const [proposed, setProposed] = useState<Slot | null>(null)
  // Anything that writes bumps this, so views holding fetched data refetch
  // rather than showing a stale calendar after an import or an edit.
  const [refreshKey, setRefreshKey] = useState(0)

  const invalidate = () => setRefreshKey((key) => key + 1)

  function proposeSlot(slot: Slot | null) {
    setProposed(slot)
    if (slot) setTab('calendar')
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

      {tab === 'find' && <FindTime onProposeSlot={proposeSlot} proposed={proposed} />}
      {tab === 'calendar' && <WeekCalendar proposed={proposed} refreshKey={refreshKey} />}
      {tab === 'events' && (
        <Events
          onChanged={invalidate}
          prefill={proposed ? { starts_at: proposed.start, ends_at: proposed.end } : null}
        />
      )}
      {tab === 'courses' && <Courses onChanged={invalidate} />}
      {tab === 'import' && <Import onChanged={invalidate} />}
    </div>
  )
}
