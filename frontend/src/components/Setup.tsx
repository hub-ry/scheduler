import { useState } from 'react'
import { Courses } from './Courses'
import { Events } from './Events'
import { GoogleSync } from './GoogleSync'
import { Import } from './Import'

/**
 * Everything you touch a few times a semester, behind one tab.
 *
 * These were four tabs of their own, which put the rarely-used work at the same
 * level as the daily work and made the nav long enough to have to read. They
 * are grouped here as sections: one open at a time, because they are separate
 * jobs rather than a form to work down.
 */

type Section = 'courses' | 'events' | 'import' | 'google'

const SECTIONS: { id: Section; label: string; blurb: string }[] = [
  {
    id: 'courses',
    label: 'Courses & packages',
    blurb: 'Who you are recruiting, and how much each class weighs.',
  },
  {
    id: 'events',
    label: 'Events',
    blurb: 'Competing events, and the ones you have booked.',
  },
  {
    id: 'import',
    label: 'Import exams',
    blurb: 'Paste a registrar table.',
  },
  {
    id: 'google',
    label: 'Google Calendar',
    blurb: 'Push the whole picture out, or re-sync after an import.',
  },
]

interface Props {
  onChanged: () => void
}

export function Setup({ onChanged }: Props) {
  const [section, setSection] = useState<Section>('courses')

  return (
    <div className="setup">
      <nav className="setup-nav" aria-label="Setup sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'is-active' : ''}
            aria-current={section === item.id}
            onClick={() => setSection(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.blurb}</span>
          </button>
        ))}
      </nav>

      <div className="setup-body">
        {section === 'courses' && <Courses onChanged={onChanged} />}
        {section === 'events' && <Events onChanged={onChanged} prefill={null} />}
        {section === 'import' && <Import onChanged={onChanged} />}
        {section === 'google' && <GoogleSync />}
      </div>
    </div>
  )
}
