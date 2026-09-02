import { useState } from 'react'
import type { Slot } from './api'
import { CalendarTab } from './components/CalendarTab'
import { Schedule } from './components/Schedule'
import { Setup } from './components/Setup'

/**
 * Three tabs, in the order you use them.
 *
 * Schedule is the daily work; Calendar is for looking; Setup holds everything
 * touched a few times a semester. It was seven tabs, which put pasting a
 * registrar table at the same level as the one screen that answers the
 * question the app exists for.
 */

type Tab = 'schedule' | 'calendar' | 'setup'

const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'setup', label: 'Setup' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('schedule')
  const [proposed, setProposed] = useState<Slot | null>(null)
  // Anything that writes bumps this, so views holding fetched data refetch
  // rather than showing a stale calendar after an import or an edit.
  const [refreshKey, setRefreshKey] = useState(0)

  const invalidate = () => setRefreshKey((key) => key + 1)

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

      {tab === 'schedule' && (
        <Schedule
          onChanged={invalidate}
          refreshKey={refreshKey}
          proposed={proposed}
          onProposeSlot={setProposed}
        />
      )}
      {tab === 'calendar' && <CalendarTab proposed={proposed} refreshKey={refreshKey} />}
      {tab === 'setup' && <Setup onChanged={invalidate} />}
    </div>
  )
}
