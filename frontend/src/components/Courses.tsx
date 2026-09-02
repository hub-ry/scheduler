import { useEffect, useState } from 'react'
import { api, ApiError, type Course } from '../api'

/**
 * The tracked courses.
 *
 * Deliberately just a list. Enrollment used to be editable here, weighting each
 * course's exam by roster size, but nobody filled the numbers in - every course
 * carried the same placeholder, so the column and the warnings explaining it
 * were a standing apology for a feature nobody used.
 *
 * Which courses are tracked is the decision that moves the ranking, and that
 * lives in `data/target_courses.json` alongside the audiences that group them.
 */

export function Courses() {
  const [courses, setCourses] = useState<Course[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .courses()
      .then(setCourses)
      .catch((caught) =>
        setError(caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)),
      )
  }, [])

  return (
    <div className="card">
      <h2>Target courses</h2>
      <p className="hint">
        The gateway classes your club recruits from. Their evening exams are what a slot gets
        ranked against.
      </p>

      {error && <div className="notice error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th>Title</th>
            <th className="num">Exams</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id}>
              <td className="code">{course.short || course.code}</td>
              <td className="muted">{course.title}</td>
              <td className="num muted">{course.exam_count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {courses.length === 0 && !error && <p className="empty">No courses loaded.</p>}
    </div>
  )
}
