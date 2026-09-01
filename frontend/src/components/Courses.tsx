import { useEffect, useMemo, useState } from 'react'
import { api, ApiError, type Course, type Package } from '../api'

/**
 * Enrollment entry, and the packages that group courses into audiences.
 *
 * Two jobs on one screen because they answer the same question from opposite
 * ends: enrollment says how much a course's exam matters, a package says
 * whether it matters to *you* at all. Splitting them would mean looking at the
 * same list of courses on two tabs.
 *
 * Editing a package is staged rather than saved per click. Membership is a set
 * you are composing, and writing every tick straight through would leave a
 * half-built audience live in the ranker between clicks.
 */

interface Props {
  onChanged: () => void
}

export function Courses({ onChanged }: Props) {
  const [courses, setCourses] = useState<Course[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  /** The package being edited, or 'new' while composing one, or null. */
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftMembers, setDraftMembers] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  function describe(caught: unknown): string {
    return caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)
  }

  useEffect(() => {
    Promise.all([api.courses(), api.packages()])
      .then(([loadedCourses, loadedPackages]) => {
        setCourses(loadedCourses)
        setPackages(loadedPackages)
      })
      .catch((caught) => setError(describe(caught)))
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
      setError(describe(caught))
    } finally {
      setSavingId(null)
    }
  }

  function startEditing(target: Package | 'new') {
    setError(null)
    if (target === 'new') {
      setEditing('new')
      setDraftName('')
      setDraftMembers(new Set())
      return
    }
    setEditing(target.id)
    setDraftName(target.name)
    setDraftMembers(new Set(target.course_ids))
  }

  function stopEditing() {
    setEditing(null)
    setDraftName('')
    setDraftMembers(new Set())
  }

  function toggleMember(courseId: number) {
    setDraftMembers((current) => {
      const next = new Set(current)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      return next
    })
  }

  async function savePackage() {
    const name = draftName.trim()
    if (name === '') {
      setError('A package needs a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const course_ids = [...draftMembers]
      const saved =
        editing === 'new'
          ? await api.createPackage({ name, course_ids })
          : await api.updatePackage(editing as number, { name, course_ids })
      setPackages((previous) => {
        const without = previous.filter((p) => p.id !== saved.id)
        return [...without, saved].sort((a, b) => a.name.localeCompare(b.name))
      })
      stopEditing()
      onChanged()
    } catch (caught) {
      setError(describe(caught))
    } finally {
      setBusy(false)
    }
  }

  async function removePackage(target: Package) {
    setBusy(true)
    setError(null)
    try {
      await api.deletePackage(target.id)
      setPackages((previous) => previous.filter((p) => p.id !== target.id))
      if (editing === target.id) stopEditing()
      onChanged()
    } catch (caught) {
      setError(describe(caught))
    } finally {
      setBusy(false)
    }
  }

  const missing = courses.filter((c) => !c.has_measured_enrollment).length
  const selecting = editing !== null

  // Which packages each course belongs to, so the table can show it without
  // scanning every package for all nine rows.
  const membership = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const pkg of packages) {
      for (const id of pkg.course_ids) {
        map.set(id, [...(map.get(id) ?? []), pkg.name])
      }
    }
    return map
  }, [packages])

  return (
    <div className="card">
      <h2>Target courses</h2>
      <p className="hint">
        The gateway classes your club recruits from. A course's enrollment is how much weight its
        exams carry when ranking slots; a package is a named subset of them - the audience for one
        kind of event.
      </p>

      {error && <div className="notice error">{error}</div>}

      <div className="packages">
        <div className="packages-bar">
          <strong>Packages</strong>
          {packages.map((pkg) => (
            <span key={pkg.id} className={`pkg${editing === pkg.id ? ' is-editing' : ''}`}>
              <button type="button" disabled={busy} onClick={() => startEditing(pkg)}>
                {pkg.name} <span className="count">{pkg.course_ids.length}</span>
              </button>
              <button
                type="button"
                className="pkg-remove"
                aria-label={`Delete ${pkg.name}`}
                title={`Delete ${pkg.name}`}
                disabled={busy}
                onClick={() => removePackage(pkg)}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="ghost"
            disabled={busy || editing === 'new'}
            onClick={() => startEditing('new')}
          >
            + New package
          </button>
        </div>

        {selecting && (
          <div className="packages-editor">
            <div className="field">
              <label htmlFor="pkg-name">Package name</label>
              <input
                id="pkg-name"
                value={draftName}
                placeholder="CS club"
                disabled={busy}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </div>
            <p className="hint">
              Tick the courses whose students you are recruiting. {draftMembers.size} selected.
            </p>
            <div className="actions">
              <button className="primary" type="button" onClick={savePackage} disabled={busy}>
                {busy ? 'Saving…' : editing === 'new' ? 'Create package' : 'Save changes'}
              </button>
              <button className="ghost" type="button" onClick={stopEditing} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {missing > 0 && (
        <div className="notice warn">
          {missing} of {courses.length} courses have no enrollment figure. They rank with a flat
          placeholder of 100 rather than an invented number, so conflicts are detected correctly but
          their relative sizes are not meaningful yet.
        </div>
      )}

      <table>
        <thead>
          <tr>
            {selecting && <th className="tick" aria-label="In package" />}
            <th>Course</th>
            <th>Title</th>
            <th>Packages</th>
            <th className="num">Exams</th>
            <th className="num">Enrollment</th>
            <th className="num">Weight</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id} className={selecting && draftMembers.has(course.id) ? 'is-member' : ''}>
              {selecting && (
                <td className="tick">
                  <input
                    type="checkbox"
                    checked={draftMembers.has(course.id)}
                    disabled={busy}
                    onChange={() => toggleMember(course.id)}
                    aria-label={`Include ${course.code}`}
                  />
                </td>
              )}
              <td className="code">{course.code}</td>
              <td className="muted">{course.title}</td>
              <td className="muted small">{(membership.get(course.id) ?? []).join(', ') || '-'}</td>
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
