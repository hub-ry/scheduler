import type { Theme } from '../theme'
import { Icon, type IconName } from './Icons'

interface ThemeOption {
  id: Theme
  label: string
  symbol?: string
  icon?: IconName
  desc: string
}

const THEMES: ThemeOption[] = [
  { id: 'burst', label: 'Burst', symbol: '✷', desc: 'Purdue Hackers Burst - Electric Red & Starburst' },
  { id: 'spill', label: 'Spill', icon: 'coffee', desc: 'Purdue Hackers Spill - Warm Coffee & Grain' },
  { id: 'midnight', label: 'Notion', icon: 'moon', desc: 'Notion Midnight - Pure Charcoal' },
  { id: 'light', label: 'Light', icon: 'sun', desc: 'Gallery Studio Light' },
]

export function ThemeToggle({
  theme,
  onChange,
}: {
  theme: Theme
  onChange: (theme: Theme) => void
}) {
  return (
    <div className="theme-toggle-group" role="group" aria-label="Color Theme">
      {THEMES.map((opt) => {
        const isActive = theme === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            className={`theme-pill-btn ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(opt.id)}
            title={opt.desc}
            aria-pressed={isActive}
          >
            {opt.symbol ? (
              <span className="theme-symbol">{opt.symbol}</span>
            ) : opt.icon ? (
              <Icon name={opt.icon} size={13} />
            ) : null}
            <span className="theme-name">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
