import { useState } from 'react'
import type { RankResponse, Slot } from '../api'
import { formatDay, formatTime, parseLocal } from '../dates'
import { Icon } from './Icons'

function tierOf(slot: Slot, worst: number): 'clear' | 'light' | 'heavy' {
  if (slot.is_clear) return 'clear'
  return slot.lost_attendance > worst / 2 ? 'heavy' : 'light'
}

interface Props {
  result: RankResponse | null
  error: string | null
  proposed: Slot | null
  onProposeSlot: (slot: Slot | null) => void
  onHoverSlot?: (slot: Slot | null) => void
  title?: string
}

export function SlotList({
  result,
  error,
  proposed,
  onProposeSlot,
  onHoverSlot,
  title = 'Ranked Suggestions',
}: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const worst = result ? Math.max(...result.slots.map((s) => s.lost_attendance), 1) : 1

  return (
    <div className="slot-list-card">
      <div className="slot-list-header">
        <div className="slot-list-title-wrap">
          <Icon name="clock" size={17} className="text-accent" />
          <h4>{title}</h4>
        </div>
        {result && (
          <span className="slot-count-badge">
            {result.slots.length} available
          </span>
        )}
      </div>

      {error && <div className="notice error">{error}</div>}

      {!result && !error && (
        <div className="slot-empty-state">
          <Icon name="calendar" size={32} className="text-muted" />
          <p>Choose your search window and click Rank to evaluate slots against course exams.</p>
        </div>
      )}

      {result && result.slots.length === 0 && (
        <div className="slot-empty-state">
          <Icon name="warningCircle" size={28} className="text-warn" />
          <p>No available slots fit those exact constraints. Try widening your hours or window.</p>
        </div>
      )}

      {result && result.slots.length > 0 && (
        <div className="slot-items">
          {result.slots.map((slot, index) => {
            const start = parseLocal(slot.start)
            const end = parseLocal(slot.end)
            const isProposed = proposed?.start === slot.start
            const tier = tierOf(slot, worst)
            const isExpanded = expandedIndex === index

            return (
              <div
                key={slot.start}
                className={`slot-card tier-${tier} ${isProposed ? 'is-selected' : ''}`}
                onClick={() => onProposeSlot(isProposed ? null : slot)}
                onMouseEnter={() => onHoverSlot?.(slot)}
                onMouseLeave={() => onHoverSlot?.(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onProposeSlot(isProposed ? null : slot)
                  }
                }}
              >
                <div className="slot-card-main">
                  <div className="slot-card-left">
                    <span className={`slot-rank-badge rank-${index + 1}`}>
                      #{index + 1}
                    </span>
                    <div className="slot-time-info">
                      <strong className="slot-day">{formatDay(start)}</strong>
                      <span className="slot-hours">
                        {formatTime(start)} - {formatTime(end)}
                      </span>
                    </div>
                  </div>

                  <div className="slot-card-right">
                    {slot.is_clear ? (
                      <span className="slot-verdict-badge status-clear">
                        <Icon name="checkCircle" size={13} />
                        Free Evening
                      </span>
                    ) : tier === 'light' ? (
                      <span className="slot-verdict-badge status-light">
                        ~{Math.round(slot.lost_attendance)} busy
                      </span>
                    ) : (
                      <span className="slot-verdict-badge status-heavy">
                        ~{Math.round(slot.lost_attendance)} busy
                      </span>
                    )}

                    {isProposed && (
                      <span className="selected-indicator">
                        <Icon name="check" size={14} />
                      </span>
                    )}
                  </div>
                </div>

                {slot.conflicts.length > 0 && (
                  <div className="slot-conflicts-wrap">
                    <button
                      type="button"
                      className="btn-toggle-conflicts"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedIndex(isExpanded ? null : index)
                      }}
                    >
                      <span>{slot.conflicts.length} conflict{slot.conflicts.length > 1 ? 's' : ''}</span>
                      <Icon name={isExpanded ? 'caretUp' : 'caretDown'} size={12} />
                    </button>

                    {isExpanded && (
                      <div className="conflicts-detail-list">
                        {slot.conflicts.map((conflict) => (
                          <div
                            key={`${conflict.label}-${conflict.overlap_minutes}`}
                            className={`conflict-pill kind-${conflict.kind}`}
                          >
                            <span className="conflict-name">{conflict.label}</span>
                            <span className="conflict-overlap">
                              {Math.round(conflict.overlap_fraction * 100)}% overlap
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
