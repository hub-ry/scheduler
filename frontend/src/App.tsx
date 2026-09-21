import { useState } from 'react'
import type { Idea } from './api'
import { CalendarTab } from './components/CalendarTab'
import { Icon, type IconName } from './components/Icons'
import { Ideas } from './components/Ideas'
import { QuickAddEvent } from './components/QuickAddEvent'
import { Setup } from './components/Setup'
import { ToastProvider } from './components/Toast'
import { useToast } from './toastContext'

type Tab = 'calendar' | 'ideas' | 'setup'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'ideas', label: 'Ideas', icon: 'lightbulb' },
  { id: 'setup', label: 'Settings', icon: 'desktop' },
]

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

function AppContent() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('calendar')
  const [refreshKey, setRefreshKey] = useState(0)
  const [finderOpen, setFinderOpen] = useState(false)
  const [activeIdea, setActiveIdea] = useState<Idea | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const invalidate = () => setRefreshKey((key) => key + 1)

  function handleScheduleIdea(idea: Idea) {
    setActiveIdea(idea)
    setFinderOpen(true)
    setTab('calendar')
  }

  return (
    <div className="notion-app-shell">
      <div className="grain-overlay" aria-hidden="true" />
      <header className="notion-topbar">
        <div className="notion-topbar-left">
          <div className="notion-brand">
            <div className="brand-logo-wrap">
              <Icon name="coffee" size={15} />
            </div>
            <div className="brand-text-block">
              <span className="brand-name">Scheduler</span>
              <span className="brand-divider">/</span>
              <span className="brand-tag">Purdue CS</span>
            </div>
          </div>

          <nav className="notion-nav-tabs" role="tablist">
            {TABS.map(({ id, label, icon }) => {
              const isActive = tab === id
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={isActive}
                  className={`notion-tab-link ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setTab(id)
                    if (id !== 'calendar') {
                      setFinderOpen(false)
                      setActiveIdea(null)
                    }
                  }}
                >
                  <Icon name={icon} size={14} />
                  <span>{label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="notion-topbar-right">
          {tab === 'calendar' && (
            <>
              <button
                type="button"
                className={`notion-btn-secondary ${finderOpen ? 'is-active' : ''}`}
                onClick={() => setFinderOpen(!finderOpen)}
                title="Find best conflict-free time slots"
              >
                <Icon name="sparkle" size={13} />
                <span>Find Best Time</span>
              </button>

              <button
                type="button"
                className="notion-btn-secondary"
                onClick={() => setQuickAddOpen(true)}
                title="Add new event"
              >
                <Icon name="plus" size={13} />
                <span>Add Event</span>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="notion-body">
        {tab === 'calendar' && (
          <CalendarTab
            key={`cal-${activeIdea ? activeIdea.id : 'default'}`}
            refreshKey={refreshKey}
            onChanged={invalidate}
            finderOpen={finderOpen}
            onToggleFinder={() => setFinderOpen(!finderOpen)}
            initialIdea={activeIdea}
          />
        )}
        {tab === 'ideas' && (
          <Ideas
            refreshKey={refreshKey}
            onChanged={invalidate}
            onFindTime={handleScheduleIdea}
          />
        )}
        {tab === 'setup' && (
          <Setup refreshKey={refreshKey} onChanged={invalidate} />
        )}
      </main>

      {quickAddOpen && (
        <QuickAddEvent
          onClose={() => setQuickAddOpen(false)}
          onAdded={() => {
            invalidate()
            showToast('Event added successfully', 'success')
          }}
        />
      )}
    </div>
  )
}
