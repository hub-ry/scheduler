import { useState } from 'react'
import { api, ApiError, type ClubEvent, type Exam } from '../api'
import { CALENDARS, clubEventToEvent, examToEvent, type GcalEvent, type Target } from '../gcal'
import { applyPlan, CLIENT_ID, planTarget, requestAccessToken, type TargetPlan } from '../gcalClient'

/**
 * Push the busy landscape out to Google Calendar.
 *
 * The point of this tab is that we do not rebuild Google Calendar. Everything in
 * this app decides *what* the events are; Calendar remains the thing that shows
 * them, notifies about them, and lives on everyone's phone already.
 *
 * Two steps rather than one button. A first sync of a full term is several
 * hundred writes, and the preview is what makes that reversible in the mind of
 * whoever pressed it.
 */

const TARGETS: { id: Target; label: string; description: string }[] = [
  {
    id: 'exams',
    label: 'Exams',
    description: 'Every evening sitting for a target course, straight from the registrar tables.',
  },
  {
    id: 'competing',
    label: 'Competing events',
    description: 'Other orgs’ events - what your audience is choosing between.',
  },
  {
    id: 'ours',
    label: 'Our events',
    description: 'Events you marked as yours on the Events tab.',
  },
]

/** Turn the rows a target covers into Google event bodies. */
async function collect(target: Target): Promise<GcalEvent[]> {
  if (target === 'exams') {
    const exams: Exam[] = await api.exams()
    return Promise.all(exams.map(examToEvent))
  }
  const events: ClubEvent[] = await api.events()
  const mine = target === 'ours'
  return Promise.all(events.filter((event) => event.is_ours === mine).map(clubEventToEvent))
}

function summarise(plan: TargetPlan): string {
  if (plan.writes === 0) return `Already up to date (${plan.unchanged} events).`
  const parts = [
    plan.create.length && `create ${plan.create.length}`,
    plan.update.length && `update ${plan.update.length}`,
    plan.remove.length && `remove ${plan.remove.length}`,
  ].filter(Boolean)
  return `Will ${parts.join(', ')}. ${plan.unchanged} unchanged.`
}

export function GoogleSync() {
  const [selected, setSelected] = useState<Set<Target>>(new Set<Target>(['exams']))
  const [plans, setPlans] = useState<TargetPlan[] | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggle(target: Target) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(target)) next.delete(target)
      else next.add(target)
      return next
    })
    // Any change to the selection invalidates a preview computed for the old one.
    setPlans(null)
    setDone(null)
  }

  function describe(caught: unknown): string {
    return caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)
  }

  async function preview() {
    setBusy(true)
    setError(null)
    setDone(null)
    setPlans(null)
    try {
      const token = await requestAccessToken()
      const chosen = TARGETS.filter((target) => selected.has(target.id))
      const computed: TargetPlan[] = []
      for (const target of chosen) {
        setProgress(`Checking ${target.label.toLowerCase()}…`)
        computed.push(await planTarget(token, target.id, await collect(target.id)))
      }
      setPlans(computed)
    } catch (caught) {
      setError(describe(caught))
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  async function apply() {
    if (!plans) return
    setBusy(true)
    setError(null)
    try {
      // A fresh token: the preview may have been sitting on screen a while, and
      // an expired token would otherwise fail on the first write.
      const token = await requestAccessToken()
      for (const plan of plans) {
        await applyPlan(token, plan, (count, total) =>
          setProgress(`Writing ${plan.target} - ${count} of ${total}…`),
        )
      }
      const written = plans.reduce((total, plan) => total + plan.writes, 0)
      setDone(
        written === 0
          ? 'Nothing to do - Google Calendar already matched.'
          : `Synced ${written} event${written === 1 ? '' : 's'}. Open Google Calendar to see them.`,
      )
      setPlans(null)
    } catch (caught) {
      // Every write is an upsert on a stable id, so re-running always finishes
      // the job rather than duplicating what already landed. Say so.
      setError(`${describe(caught)} - nothing is duplicated; press Preview again to resume.`)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  if (!CLIENT_ID) {
    return (
      <div className="card">
        <h2>Google Calendar</h2>
        <div className="notice warn">
          No OAuth client id configured. Copy <code>frontend/.env.example</code> to{' '}
          <code>frontend/.env</code>, put your client id in it, and restart <code>./dev</code>. The
          README has the Google Cloud console steps.
        </div>
      </div>
    )
  }

  return (
    <div className="card gsync">
      <h2>Push to Google Calendar</h2>
      <p className="hint">
        Writes into calendars this app owns - one per kind of data, so a bad sync is undone by
        deleting a calendar rather than by un-picking events. Nothing else on your account is
        touched, and re-running only ever updates what moved.
      </p>

      {error && <div className="notice error">{error}</div>}
      {done && <div className="notice ok">{done}</div>}

      <fieldset className="field">
        <legend>What to push</legend>
        {TARGETS.map((target) => (
          <label key={target.id} className="checkbox">
            <input
              type="checkbox"
              checked={selected.has(target.id)}
              disabled={busy}
              onChange={() => toggle(target.id)}
            />
            <span>
              <strong>{target.label}</strong> <code>{CALENDARS[target.id]}</code>
              <br />
              <span className="hint">{target.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {plans && (
        <div className="notice warn">
          <strong>Preview</strong>
          <ul>
            {plans.map((plan) => (
              <li key={plan.target}>
                <code>{CALENDARS[plan.target]}</code> - {summarise(plan)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress && <p className="hint">{progress}</p>}

      <div className="actions">
        <button type="button" onClick={preview} disabled={busy || selected.size === 0}>
          {busy && !plans ? 'Checking…' : 'Preview changes'}
        </button>
        <button
          className="primary"
          type="button"
          onClick={apply}
          disabled={busy || !plans || plans.every((plan) => plan.writes === 0)}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
