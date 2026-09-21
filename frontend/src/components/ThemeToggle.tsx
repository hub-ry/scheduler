import type { Theme } from '../theme'
import { Icon, type IconName } from './Icons'

const OPTIONS: { id: Theme; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Light theme', icon: 'sun' },
  { id: 'system', label: 'Match system theme', icon: 'desktop' },
  { id: 'dark', label: 'Dark theme', icon: 'moon' },
]

export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={theme === option.id}
          onClick={() => onChange(option.id)}
          className={theme === option.id ? 'is-active' : ''}
        >
          <Icon name={option.icon} size={15} />
        </button>
      ))}
    </div>
  )
}
