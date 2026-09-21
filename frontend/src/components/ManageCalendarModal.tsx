import { useState } from 'react'
import { api, type ClubEvent } from '../api'
import { clubEventToEvent } from '../gcal'
import { applyPlan, GoogleError, planTarget, requestAccessToken } from '../gcalClient'
import { useToast } from '../toastContext'
import { Icon } from './Icons'

interface Props {
  onClose: () => void
  onRefresh: () => void
}

export function ManageCalendarModal({ onClose, onRefresh }: Props) {
  const { showToast } = useToast()
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function handleGoogleSync() {
    setSyncing(true)
    setStatus('Requesting Google Calendar access...')
    try {
      const token = await requestAccessToken()
      setStatus('Fetching club events...')
      const events: ClubEvent[] = await api.events()
      const desired = await Promise.all(
        events.filter((event) => event.is_ours).map(clubEventToEvent),
      )
      const plan = await planTarget(token, 'ours', desired)
      setStatus(`Syncing ${plan.writes} changes to Google Calendar...`)
      await applyPlan(token, plan)
      onRefresh()
      const summary = `Synced: ${plan.create.length} created, ${plan.update.length} updated, ${plan.remove.length} deleted`
      showToast(summary, 'success')
      setStatus(summary)
    } catch (caught) {
      const msg = caught instanceof GoogleError ? caught.message : String(caught)
      showToast(msg, 'error')
      setStatus(`Sync failed: ${msg}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="notion-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="notion-modal-card" role="dialog" aria-label="Manage in Calendar">
        <div className="notion-modal-header">
          <div className="modal-title-group">
            <Icon name="calendar21" size={20} className="modal-title-icon" />
            <h3>Manage in Calendar</h3>
          </div>
          <button type="button" className="notion-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="notion-modal-body">
          <div className="notion-modal-section">
            <div className="section-label">Google Calendar Integration</div>
            <p className="section-description">
              Sync scheduled club events and Purdue academic calendar dates directly to your Google Calendar.
            </p>
            <div className="sync-action-box">
              <button
                type="button"
                className="notion-btn-primary"
                onClick={handleGoogleSync}
                disabled={syncing}
              >
                <Icon name="sync" size={15} className={syncing ? 'is-spinning' : ''} />
                <span>{syncing ? 'Syncing...' : 'Sync to Google Calendar Now'}</span>
              </button>
              {status && <div className="sync-status-msg">{status}</div>}
            </div>
          </div>

          <div className="notion-modal-section">
            <div className="section-label">Calendar Layers & Legend</div>
            <div className="legend-grid">
              <div className="legend-item">
                <span className="chip-dot kind-ours" />
                <span className="legend-title">Our Club Events</span>
                <span className="legend-desc">Events organized by your club</span>
              </div>
              <div className="legend-item">
                <span className="chip-dot kind-event" />
                <span className="legend-title">Competing Events</span>
                <span className="legend-desc">Other clubs and company talks</span>
              </div>
              <div className="legend-item">
                <span className="chip-dot kind-exam" />
                <span className="legend-title">Exams</span>
                <span className="legend-desc">Scheduled midterm & final sittings</span>
              </div>
              <div className="legend-item">
                <span className="chip-dot kind-closed" />
                <span className="legend-title">Breaks & Holidays</span>
                <span className="legend-desc">Campus holidays and instructional breaks</span>
              </div>
            </div>
          </div>
        </div>

        <div className="notion-modal-footer">
          <button type="button" className="notion-btn-subtle" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
