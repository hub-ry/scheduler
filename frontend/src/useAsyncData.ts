import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

/**
 * Fetch-on-mount with a manual reload, plus loading and error state.
 *
 * Data fetching is the one legitimate reason to set state from an effect: the
 * server is exactly the "external system" effects exist to synchronize with.
 * `react-hooks/set-state-in-effect` cannot distinguish that from an accidental
 * render cascade, so the suppression lives here - once, explained - rather than
 * being sprinkled across every component that loads something.
 *
 * Refetching is driven by a caller-supplied `key` string rather than a
 * dependency array, so the effect's dependencies stay statically checkable.
 * The fetcher itself is held in a ref, which keeps a fresh closure without
 * making every render a new dependency.
 *
 * A stale-response guard is included because week navigation can easily put two
 * requests in flight, and the slower one must not overwrite the newer result.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  key: string,
  initial: T,
): { data: T; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const latestFetcher = useRef(fetcher)
  // Declared before the fetching effect so it has already refreshed by the time
  // that one runs. Refs must not be written during render.
  useEffect(() => {
    latestFetcher.current = fetcher
  })

  useEffect(() => {
    let current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the note above
    setLoading(true)
    setError(null)
    latestFetcher
      .current()
      .then((result) => {
        if (current) setData(result)
      })
      .catch((caught) => {
        if (current) setError(caught instanceof ApiError ? caught.message : String(caught))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [key, nonce])

  return { data, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) }
}
