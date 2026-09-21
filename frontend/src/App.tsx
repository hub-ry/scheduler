import { useState } from 'react'
import { CalendarTab } from './components/CalendarTab'
import { Icon, type IconName } from './components/Icons'
import { Schedule } from './components/Schedule'
import { Setup } from './components/Setup'
import { ThemeToggle } from './components/ThemeToggle'
import { ToastProvider } from './components/Toast'
import { useTheme } from './theme'

type Tab = 'schedule' | 'calendar' | 'setup'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'schedule', label: 'Schedule', icon: 'sparkle' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'setup', label: 'Setup', icon: 'lightbulb' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('schedule')
  const [refreshKey, setRefreshKey] = useState(0)
  const [theme, setTheme] = useTheme()

  const invalidate = () => setRefreshKey((key) => key + 1)

  return (
    <ToastProvider>
      <div className="app-layout">
        <header className="navbar">
          <div className="navbar-brand">
            <div className="brand-logo">
              <Icon name="calendar" size={18} />
            </div>
            <div className="brand-text">
              <span className="brand-name">Scheduler</span>
              <span className="brand-tag">Purdue CS</span>
            </div>
          </div>

          <nav className="nav-segmented-control" role="tablist">
            {TABS.map(({ id, label, icon }) => {
              const isActive = tab === id
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={isActive}
                  className={`nav-segment-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  <Icon name={icon} size={15} />
                  <span>{label}</span>
                </button>
              )
            })}
          </nav>

          <div className="navbar-actions">
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
        </header>

        <main className="app-body">
          {tab === 'schedule' && (
            <Schedule onChanged={invalidate} refreshKey={refreshKey} />
          )}
          {tab === 'calendar' && (
            <CalendarTab refreshKey={refreshKey} onChanged={invalidate} />
          )}
          {tab === 'setup' && (
            <Setup onChanged={invalidate} refreshKey={refreshKey} />
          )}
        </main>
      </div>
    </ToastProvider>
  )
}
