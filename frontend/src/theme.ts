import { useEffect, useState } from 'react'

/**
 * Light, dark, or whatever the OS says.
 *
 * "system" is the default and is stored as an absence: with no `data-theme` on
 * the root, the stylesheet's `prefers-color-scheme` block decides, so a laptop
 * that switches at sunset switches the app too without the page reloading.
 * Choosing explicitly stamps the attribute, which the stylesheet gives higher
 * precedence than the media query in both directions.
 */

export type Theme = 'burst' | 'spill' | 'midnight' | 'light'

const KEY = 'scheduler.theme'

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'burst' || value === 'spill' || value === 'midnight' || value === 'light') {
      return value
    }
    if (value === 'dark') return 'burst'
    // Default to creative Burst theme
    return 'burst'
  } catch {
    // Private-mode browsers throw on access rather than returning null.
    return 'burst'
  }
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(stored)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Not worth failing the render over; the theme just will not persist.
    }
  }, [theme])

  return [theme, setTheme]
}
