/**
 * Typed client for the scheduler API.
 *
 * The types mirror `backend/app/api/schemas.py`. They are hand-written rather
 * than generated because the surface is small and the duplication is cheaper
 * than a codegen step in the dev loop.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Course {
  id: number
  code: string
  title: string
  enrollment: number | null
  audience_fraction: number
  weight: number
  has_measured_enrollment: boolean
  exam_count: number
}

export interface Exam {
  id: number
  course_code: string
  course_title: string
  kind: string
  starts_at: string
  ends_at: string
  rooms: string
  weight: number
}

export interface ClubEvent {
  id: number
  title: string
  organization: string
  location: string
  starts_at: string
  ends_at: string
  expected_attendance: number
  audience_fraction: number
  source: string
  is_ours: boolean
  weight: number
}

export interface Busy {
  start: string
  end: string
  label: string
  kind: 'course' | 'exam' | 'event'
  weight: number
}

export interface Conflict {
  label: string
  kind: 'course' | 'exam' | 'event'
  weight: number
  overlap_minutes: number
  overlap_fraction: number
}

export interface Slot {
  start: string
  end: string
  blocked: number
  lost_attendance: number
  is_clear: boolean
  conflicts: Conflict[]
}

export interface RankResponse {
  slots: Slot[]
  considered: number
  uses_placeholder_weights: boolean
  courses_missing_enrollment: string[]
}

export interface RankRequest {
  window_start: string
  window_end: string
  duration_minutes: number
  earliest: string
  latest: string
  weekdays: Weekday[]
  step_minutes: number
  limit: number
}

export interface ImportResponse {
  parsed: number
  imported: number
  skipped_non_target: string[]
  unknown_courses: string[]
}

/** Thrown for any non-2xx response, carrying the API's own message when it sends one. */
export class ApiError extends Error {
  // Declared as a plain field rather than a constructor parameter property,
  // because the latter is not erasable type syntax.
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    throw new ApiError(await describeFailure(response), response.status)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/**
 * FastAPI reports validation failures as a list of per-field errors and other
 * failures as a plain string. Flatten both into one readable sentence so the
 * UI never has to render "[object Object]".
 */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          const field = (item.loc ?? []).filter((p: unknown) => p !== 'body').join('.')
          return field ? `${field}: ${item.msg}` : item.msg
        })
        .join('; ')
    }
  } catch {
    // Fall through to the status text below.
  }
  return `${response.status} ${response.statusText}`
}

export const api = {
  courses: () => request<Course[]>('/api/courses'),

  updateCourse: (id: number, patch: Partial<Pick<Course, 'enrollment' | 'audience_fraction'>>) =>
    request<Course>(`/api/courses/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  exams: () => request<Exam[]>('/api/exams'),

  events: () => request<ClubEvent[]>('/api/events'),

  createEvent: (event: Omit<ClubEvent, 'id' | 'weight'>) =>
    request<ClubEvent>('/api/events', { method: 'POST', body: JSON.stringify(event) }),

  deleteEvent: (id: number) => request<void>(`/api/events/${id}`, { method: 'DELETE' }),

  busy: (start: string, end: string) =>
    request<Busy[]>(`/api/busy?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),

  rank: (body: RankRequest) =>
    request<RankResponse>('/api/schedule/rank', { method: 'POST', body: JSON.stringify(body) }),

  importExams: (text: string) =>
    request<ImportResponse>('/api/import/exams', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
}
