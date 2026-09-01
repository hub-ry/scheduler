/**
 * Google Calendar access, straight from the browser.
 *
 * There is no server side to this. Google Identity Services hands the page an
 * access token after the user consents, and we call the Calendar REST API with
 * it directly. That means no refresh token on disk, no client secret anywhere in
 * the repo, and no stored credential that could write to a calendar long after
 * whoever authorised it stopped being involved. The token lives in memory and
 * dies with the tab.
 *
 * The cost of that trade is that tokens expire after about an hour and cannot be
 * refreshed silently here, so a long session will occasionally re-prompt. For a
 * button someone presses a few times a semester that is the right side to be on.
 */

import { CALENDARS, planSync, type GcalEvent, type SyncPlan, type Target } from './gcal'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

/**
 * Read/write access to calendars. Google classes this as a sensitive scope, so
 * an unverified project can only be used by accounts listed as test users on the
 * OAuth consent screen - which is fine while this is a handful of officers.
 */
const SCOPE = 'https://www.googleapis.com/auth/calendar'

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

/** Raised for anything Google rejected, carrying its own message where it sends one. */
export class GoogleError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Minimal shape of the global Google Identity Services injects. Typing only what
// we touch beats pulling in the full @types/google.accounts for two calls.
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
            error_callback?: (error: { type?: string }) => void
          }) => TokenClient
        }
      }
    }
  }
}

let gisLoading: Promise<void> | null = null

/** Inject the Google Identity Services script once, no matter how often we ask. */
function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  if (gisLoading) return gisLoading

  gisLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      gisLoading = null
      reject(new Error('Could not load Google sign-in. Check your network connection.'))
    }
    document.head.appendChild(script)
  })
  return gisLoading
}

/**
 * Prompt for consent and return an access token.
 *
 * Not cached across calls on purpose: the token client already reuses a live
 * grant without re-prompting, and caching it here would just mean holding an
 * expired string and failing the first write of the next sync.
 */
export async function requestAccessToken(): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID is not set. Copy frontend/.env.example to frontend/.env and put your OAuth client id in it.',
    )
  }
  await loadGis()

  const oauth2 = window.google?.accounts.oauth2
  if (!oauth2) throw new Error('Google sign-in loaded but did not initialise.')

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token)
        else reject(new Error(response.error ?? 'Authorisation was declined.'))
      },
      // Fires when the popup is blocked or closed, which the callback never sees.
      error_callback: (error) =>
        reject(
          new Error(
            error.type === 'popup_closed'
              ? 'Sign-in window was closed before authorising.'
              : 'Sign-in window could not open. Check that popups are allowed for this site.',
          ),
        ),
    })
    client.requestAccessToken()
  })
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (body?.error?.message) message = body.error.message
    } catch {
      // Keep the status line.
    }
    throw new GoogleError(message, response.status)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/**
 * Retry the calls Google asks us to retry.
 *
 * Calendar rate-limits with 403 and 429, and both are advisory rather than
 * fatal. Everything else - a bad id, a revoked token - is a real failure and is
 * rethrown immediately rather than being hammered four more times.
 */
async function withRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (caught) {
      const retryable =
        caught instanceof GoogleError && (caught.status === 403 || caught.status === 429)
      if (!retryable || attempt >= attempts - 1) throw caught
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500 + Math.random() * 250))
    }
  }
}

interface CalendarListEntry {
  id: string
  summary: string
}

/**
 * Find our calendar by name, or make it.
 *
 * Looked up every sync rather than remembered, so deleting the calendar in the
 * Google UI is a valid way to start over: the next sync simply recreates it and
 * repopulates it, because our event ids do not depend on which calendar they
 * landed in.
 */
export async function findOrCreateCalendar(token: string, summary: string): Promise<string> {
  let pageToken: string | undefined
  do {
    const query = new URLSearchParams({ maxResults: '250', minAccessRole: 'writer' })
    if (pageToken) query.set('pageToken', pageToken)
    const page = await withRetry(() =>
      call<{ items?: CalendarListEntry[]; nextPageToken?: string }>(
        token,
        `/users/me/calendarList?${query}`,
      ),
    )
    const match = page.items?.find((entry) => entry.summary === summary)
    if (match) return match.id
    pageToken = page.nextPageToken
  } while (pageToken)

  const created = await withRetry(() =>
    call<{ id: string }>(token, '/calendars', {
      method: 'POST',
      body: JSON.stringify({ summary, timeZone: 'America/Indiana/Indianapolis' }),
    }),
  )
  return created.id
}

interface RemoteEvent {
  id: string
  extendedProperties?: { private?: Record<string, string> }
}

/** Every event currently on the calendar, mapped to the hash we last wrote on it. */
async function fetchExisting(token: string, calendarId: string): Promise<Map<string, string | undefined>> {
  const existing = new Map<string, string | undefined>()
  let pageToken: string | undefined

  do {
    const query = new URLSearchParams({ maxResults: '2500', showDeleted: 'false' })
    if (pageToken) query.set('pageToken', pageToken)
    const page = await withRetry(() =>
      call<{ items?: RemoteEvent[]; nextPageToken?: string }>(
        token,
        `/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
      ),
    )
    for (const item of page.items ?? []) {
      existing.set(item.id, item.extendedProperties?.private?.schedulerHash)
    }
    pageToken = page.nextPageToken
  } while (pageToken)

  return existing
}

/**
 * Run `tasks` a few at a time.
 *
 * Sequential is too slow for a few hundred exams and unbounded parallelism just
 * trips the rate limiter, which turns into backoff and ends up slower than this.
 */
async function pooled(tasks: (() => Promise<void>)[], width = 4): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(width, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]
      await task()
    }
  })
  await Promise.all(workers)
}

export interface TargetPlan extends SyncPlan {
  target: Target
  calendarId: string
  /** Total number of writes applying this plan would make. */
  writes: number
}

/**
 * Work out what a sync would do, without doing any of it.
 *
 * Split from :func:`applyPlan` so the UI can show the damage before causing it.
 * A first sync of a full term is several hundred writes, and "you are about to
 * create 412 events" is worth reading before rather than after.
 */
export async function planTarget(
  token: string,
  target: Target,
  desired: GcalEvent[],
): Promise<TargetPlan> {
  const calendarId = await findOrCreateCalendar(token, CALENDARS[target])
  const plan = planSync(desired, await fetchExisting(token, calendarId))
  return {
    ...plan,
    target,
    calendarId,
    writes: plan.create.length + plan.update.length + plan.remove.length,
  }
}

/**
 * Carry out a previously computed plan.
 *
 * Failing part-way leaves the calendar in a state the next run reconciles rather
 * than an unknown one, because every write is an upsert keyed on a stable id -
 * re-running after an error is always safe and always finishes the job.
 */
export async function applyPlan(
  token: string,
  plan: TargetPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const events = `/calendars/${encodeURIComponent(plan.calendarId)}/events`
  let done = 0
  const step = () => onProgress?.(++done, plan.writes)

  const tasks: (() => Promise<void>)[] = [
    ...plan.create.map((event) => async () => {
      try {
        await withRetry(() => call(token, events, { method: 'POST', body: JSON.stringify(event) }))
      } catch (caught) {
        // Deleting an event in the Google UI only trashes it, and a trashed id
        // is still taken - so inserting the same stable id again is a 409 rather
        // than a success. PUT revives it, which is what the user asked for by
        // running a sync. Without this, any event deleted by hand would fail
        // every subsequent sync forever.
        if (!(caught instanceof GoogleError) || caught.status !== 409) throw caught
        await withRetry(() =>
          call(token, `${events}/${event.id}`, { method: 'PUT', body: JSON.stringify(event) }),
        )
      }
      step()
    }),
    ...plan.update.map((event) => async () => {
      await withRetry(() =>
        call(token, `${events}/${event.id}`, { method: 'PUT', body: JSON.stringify(event) }),
      )
      step()
    }),
    ...plan.remove.map((id) => async () => {
      try {
        await withRetry(() => call(token, `${events}/${id}`, { method: 'DELETE' }))
      } catch (caught) {
        // Already gone is the outcome we wanted anyway.
        if (!(caught instanceof GoogleError) || (caught.status !== 404 && caught.status !== 410)) {
          throw caught
        }
      }
      step()
    }),
  ]

  await pooled(tasks)
}
