import { useEffect, useState } from 'react'

export type Theme = 'default' | 'coffee'

const KEY = 'scheduler.theme'

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'default' || value === 'coffee') {
      return value
    }
    if (value === 'spill') return 'coffee'
    return 'default'
  } catch {
    return 'default'
  }
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(stored)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Ignore private browsing storage errors
    }
  }, [theme])

  return [theme, setTheme]
}
