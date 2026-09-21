import { useState } from 'react'
import { Courses } from './Courses'
import { Events } from './Events'
import { GoogleSync } from './GoogleSync'
import { type IconName, Icon } from './Icons'
import { Ideas } from './Ideas'
import { Import } from './Import'

type Section = 'ideas' | 'courses' | 'events' | 'import' | 'google'

const SECTIONS: { id: Section; label: string; blurb: string; icon: IconName }[] = [
  {
    id: 'ideas',
    label: 'Event Ideas',
    blurb: 'Brainstorm backlog and priority order.',
    icon: 'lightbulb',
  },
  {
    id: 'courses',
    label: 'Tracked Courses',
    blurb: 'Courses whose exams a slot is evaluated against.',
    icon: 'graduationCap',
  },
  {
    id: 'events',
    label: 'Manage Events',
    blurb: 'Competing club events and our scheduled bookings.',
    icon: 'calendar',
  },
  {
    id: 'import',
    label: 'Import Exams',
    blurb: 'Parse and load registrar exam schedule tables.',
    icon: 'upload',
  },
  {
    id: 'google',
    label: 'Google Calendar',
    blurb: 'Sync events landscape directly to Google Calendar.',
    icon: 'sync',
  },
]

interface Props {
  onChanged: () => void
  refreshKey: number
}

export function Setup({ onChanged, refreshKey }: Props) {
  const [section, setSection] = useState<Section>('ideas')

  return (
    <div className="setup-container">
      <aside className="setup-sidebar">
        <div className="setup-sidebar-head">
          <h3>Configuration</h3>
          <span className="text-muted text-xs">Setup & Data Management</span>
        </div>

        <nav className="setup-nav" aria-label="Configuration sections">
          {SECTIONS.map((item) => {
            const isActive = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`setup-nav-item ${isActive ? 'is-active' : ''}`}
                aria-current={isActive}
                onClick={() => setSection(item.id)}
              >
                <div className="setup-nav-icon">
                  <Icon name={item.icon} size={18} />
                </div>
                <div className="setup-nav-text">
                  <span className="setup-nav-label">{item.label}</span>
                  <span className="setup-nav-blurb">{item.blurb}</span>
                </div>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="setup-main-content">
        {section === 'ideas' && <Ideas onChanged={onChanged} refreshKey={refreshKey} />}
        {section === 'courses' && <Courses />}
        {section === 'events' && <Events onChanged={onChanged} prefill={null} />}
        {section === 'import' && <Import onChanged={onChanged} />}
        {section === 'google' && <GoogleSync />}
      </main>
    </div>
  )
}
