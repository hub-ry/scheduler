import React from 'react'
import type { Package, RankRequest, Weekday } from '../api'
import { addDays, DAY_NAMES, endOfMonth, startOfMonth, toDateInput } from '../dates'
import { Icon } from './Icons'

interface Props {
  request: RankRequest
  onChange: (request: RankRequest) => void
  onSubmit: (event: React.FormEvent) => void
  loading: boolean
  packages?: Package[]
  title?: string
  hint?: string
}

const DURATION_PRESETS = [45, 60, 90, 120]

export function SlotSearchForm({
  request,
  onChange,
  onSubmit,
  loading,
  packages = [],
  title = 'Find Best Times',
  hint,
}: Props) {
  function set<K extends keyof RankRequest>(key: K, value: RankRequest[K]) {
    onChange({ ...request, [key]: value })
  }

  function toggleDay(day: Weekday) {
    const active = request.weekdays.includes(day)
    if (active && request.weekdays.length === 1) return
    set(
      'weekdays',
      active ? request.weekdays.filter((d) => d !== day) : [...request.weekdays, day].sort(),
    )
  }

  function applyPreset(preset: 'twoWeeks' | 'month' | 'nextMonth') {
    const now = new Date()
    if (preset === 'twoWeeks') {
      set('window_start', toDateInput(now))
      set('window_end', toDateInput(addDays(now, 14)))
    } else if (preset === 'month') {
      set('window_start', toDateInput(now))
      set('window_end', toDateInput(endOfMonth(now)))
    } else if (preset === 'nextMonth') {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      set('window_start', toDateInput(startOfMonth(nextMonth)))
      set('window_end', toDateInput(endOfMonth(nextMonth)))
    }
  }

  const selected = request.course_ids
  const currentPackage =
    selected == null
      ? undefined
      : packages.find(
          (option) =>
            option.course_ids.length === selected.length &&
            option.course_ids.every((id) => selected.includes(id)),
        )

  return (
    <form className="search-form-card" onSubmit={onSubmit}>
      <div className="search-form-header">
        <div className="search-form-title">
          <Icon name="search" size={18} className="text-accent" />
          <h3>{title}</h3>
        </div>
        {hint && <span className="search-form-subtitle">{hint}</span>}
      </div>

      <div className="search-form-fields">
        {packages.length > 0 && (
          <div className="form-group">
            <label htmlFor="audience-select">Target Audience</label>
            <select
              id="audience-select"
              value={currentPackage?.id ?? ''}
              onChange={(e) => {
                const chosen = packages.find((p) => String(p.id) === e.target.value)
                set('course_ids', chosen ? chosen.course_ids : null)
              }}
            >
              <option value="">All Tracked Courses (9 classes)</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} ({pkg.course_codes.length} courses)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <div className="label-with-presets">
            <label htmlFor="window-from">Search Window</label>
            <div className="preset-buttons">
              <button type="button" className="btn-preset" onClick={() => applyPreset('twoWeeks')}>
                2 Weeks
              </button>
              <button type="button" className="btn-preset" onClick={() => applyPreset('month')}>
                This Month
              </button>
              <button type="button" className="btn-preset" onClick={() => applyPreset('nextMonth')}>
                Next Month
              </button>
            </div>
          </div>
          <div className="date-range-row">
            <input
              id="window-from"
              type="date"
              value={request.window_start}
              onChange={(e) => set('window_start', e.target.value)}
              required
            />
            <span className="date-range-arrow">→</span>
            <input
              id="window-to"
              type="date"
              value={request.window_end}
              min={request.window_start}
              onChange={(e) => set('window_end', e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label htmlFor="time-earliest">Earliest</label>
            <input
              id="time-earliest"
              type="time"
              value={request.earliest}
              onChange={(e) => set('earliest', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="time-latest">Latest</label>
            <input
              id="time-latest"
              type="time"
              value={request.latest}
              onChange={(e) => set('latest', e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <div className="label-with-presets">
            <label htmlFor="event-duration">Duration: {request.duration_minutes}m</label>
            <div className="preset-buttons">
              {DURATION_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`btn-preset ${request.duration_minutes === d ? 'is-selected' : ''}`}
                  onClick={() => set('duration_minutes', d)}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Days of Week</label>
          <div className="weekday-picker">
            {DAY_NAMES.map((name, index) => {
              const active = request.weekdays.includes(index as Weekday)
              return (
                <button
                  key={name}
                  type="button"
                  className={`weekday-pill ${active ? 'is-active' : ''}`}
                  onClick={() => toggleDay(index as Weekday)}
                  aria-pressed={active}
                >
                  {name.slice(0, 1)}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <button className="btn-search-primary" type="submit" disabled={loading}>
        {loading ? (
          <span className="flex-center gap-2">
            <Icon name="sync" size={16} className="animate-spin" />
            Analyzing Exam Schedules...
          </span>
        ) : (
          <span className="flex-center gap-2">
            <Icon name="sparkle" size={16} />
            Rank Available Times
          </span>
        )}
      </button>
    </form>
  )
}
