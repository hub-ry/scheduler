import { useEffect, useState } from 'react'
import { api, ApiError, type Course } from '../api'

/**
 * Enrollment entry.
 *
 * This is the one screen that turns the ranking from directional into
 * quantitative, so the placeholder state is made obvious rather than hidden
 * behind a plausible-looking default.
 */

interface Props {
  onChanged: () => void
}

export function Courses({ onChanged }: Props) {
  const [courses, setCourses] = useState<Course[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  useEffect(() => {
    api
      .courses()
      .then(setCourses)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : String(caught)))
  }, [])

  async function commit(course: Course) {
    const draft = drafts[course.id]
    if (draft === undefined) return
    const trimmed = draft.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError(`${course.code}: enrollment must be a non-negative number.`)
      return
    }
    // Nothing to send if they tabbed through without changing anything.
    if (value === course.enrollment) return

    setSavingId(course.id)
    setError(null)
    try {
      const updated = await api.updateCourse(course.id, { enrollment: value })
      setCourses((previous) => previous.map((c) => (c.id === updated.id ? updated : c)))
      onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught))
    } finally {
      setSavingId(null)
    }
  }

  const missing = courses.filter((c) => !c.has_measured_enrollment).length

  return (
    <div className="card">
      <h2>Target courses</h2>
      <p className="hint">
        The gateway classes your club recruits from. A course's enrollment is how much
        weight its exams carry when ranking slots.
      </p>

      {error && <div className="notice error">{error}</div>}

      {missing > 0 && (
        <div className="notice warn">
          {missing} of {courses.length} courses have no enrollment figure. They rank with a
          flat placeholder of 100 rather than an invented number, so conflicts are detected
          correctly but their relative sizes are not meaningful yet.
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Course</th>
            <th>Title</th>
            <th className="num">Exams</th>
            <th className="num">Enrollment</th>
            <th className="num">Weight</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id}>
              <td className="code">{course.code}</td>
              <td className="muted">{course.title}</td>
              <td className="num muted">{course.exam_count}</td>
              <td className="num">
                <input
                  type="number"
                  min={0}
                  placeholder="unknown"
                  disabled={savingId === course.id}
                  value={drafts[course.id] ?? course.enrollment ?? ''}
                  onChange={(e) =>
                    setDrafts((previous) => ({ ...previous, [course.id]: e.target.value }))
                  }
                  onBlur={() => commit(course)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  aria-label={`Enrollment for ${course.code}`}
                />
              </td>
              <td className="num">
                {course.has_measured_enrollment ? (
                  Math.round(course.weight)
                ) : (
                  <span className="placeholder-weight" title="Placeholder - no enrollment entered">
                    {Math.round(course.weight)}*
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {courses.length === 0 && !error && <p className="empty">No courses loaded.</p>}
    </div>
  )
}
