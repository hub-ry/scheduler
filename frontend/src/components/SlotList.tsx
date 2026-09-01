import type { RankResponse, Slot } from '../api'
import { formatDay, formatTime, parseLocal } from '../dates'

/**
 * The ranked results half of the search.
 *
 * Hovering a row is a preview gesture, not a commitment: it reports the slot up
 * so a calendar beside this list can draw it in place. Clicking is what
 * actually proposes it. Focus mirrors hover so the same preview is reachable
 * from the keyboard.
 */

/**
 * Bucket a slot for colour. The thresholds are relative to the worst slot in
 * the result set rather than absolute, because the weights may be placeholders
 * whose absolute magnitude means nothing.
 */
function tierOf(slot: Slot, worst: number): string {
  if (slot.is_clear) return 'tier-clear'
  return slot.lost_attendance > worst / 2 ? 'tier-heavy' : 'tier-light'
}

interface Props {
  result: RankResponse | null
  error: string | null
  proposed: Slot | null
  onProposeSlot: (slot: Slot | null) => void
  onHoverSlot?: (slot: Slot | null) => void
  title?: string
}

export function SlotList({ result, error, proposed, onProposeSlot, onHoverSlot, title }: Props) {
  const worst = result ? Math.max(...result.slots.map((s) => s.lost_attendance), 1) : 1

  return (
      <div className="card">
        <h2>{title ?? 'Best times'}</h2>
        <p className="hint">
          {result
            ? `${result.slots.length} shown of ${result.considered} candidate slots.`
            : 'Set your constraints and run a search.'}
        </p>

        {error && <div className="notice error">{error}</div>}

        {result?.uses_placeholder_weights && (
          <div className="notice warn">
            Ranking uses placeholder enrollment for{' '}
            {result.courses_missing_enrollment.join(', ')}. The order of clear slots is
            reliable; the size of each conflict is not. Fill enrollment in on the Courses
            tab to sharpen it.
          </div>
        )}

        {result && result.slots.length === 0 && (
          <p className="empty">
            No slot fits those constraints. Try a wider window or a shorter event.
          </p>
        )}

        <div className="slots">
          {result?.slots.map((slot, index) => {
            const start = parseLocal(slot.start)
            const isProposed = proposed?.start === slot.start
            return (
              <div
                key={slot.start}
                className={`slot ${tierOf(slot, worst)}`}
                onClick={() => onProposeSlot(isProposed ? null : slot)}
                onMouseEnter={() => onHoverSlot?.(slot)}
                onMouseLeave={() => onHoverSlot?.(null)}
                onFocus={() => onHoverSlot?.(slot)}
                onBlur={() => onHoverSlot?.(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onProposeSlot(isProposed ? null : slot)}
                title="Show this slot on the calendar"
              >
                <div className="slot-head">
                  <div className="slot-when">
                    <span className="rank">{index + 1}</span>
                    {formatDay(start)} · {formatTime(start)} – {formatTime(parseLocal(slot.end))}
                  </div>
                  <div className="slot-verdict">
                    {slot.is_clear
                      ? 'Nothing in the way'
                      : `~${Math.round(slot.lost_attendance)} unavailable`}
                  </div>
                </div>
                {slot.conflicts.length > 0 && (
                  <ul className="slot-conflicts">
                    {slot.conflicts.map((conflict) => (
                      <li
                        key={`${conflict.label}-${conflict.overlap_minutes}`}
                        className={`chip kind-${conflict.kind}`}
                      >
                        {conflict.label} · {Math.round(conflict.overlap_fraction * 100)}% overlap
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
  )
}
