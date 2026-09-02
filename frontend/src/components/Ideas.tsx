import { useEffect, useState } from 'react'
import { api, ApiError, type Idea } from '../api'
import { formatDay, formatTime, parseLocal } from '../dates'

/**
 * The brainstorm board: what we want to run this semester, in priority order.
 *
 * A single column of cards you drag to reorder, because the order *is* the
 * content - it is the club's answer to "what matters most", and a grid or a
 * table would say nothing a list does not.
 *
 * Reordering is optimistic. Dragging a card and watching it snap back while a
 * request lands would make the board feel broken; the list is restored and the
 * error shown only if the write actually fails.
 *
 * Uses the HTML drag-and-drop API rather than a library. One vertical list with
 * no nesting and no cross-container moves is the case it handles well, and it
 * keeps the dependency list at react and react-dom.
 */

interface Props {
  onChanged: () => void
  refreshKey: number
}

export function Ideas({ onChanged, refreshKey }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Index being dragged, and the index it would land at. */
  const [from, setFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  function describe(caught: unknown): string {
    return caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)
  }

  useEffect(() => {
    api
      .ideas()
      .then(setIdeas)
      .catch((caught) => setError(describe(caught)))
  }, [refreshKey])

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (title.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createIdea({ title })
      setIdeas((previous) => [...previous, created])
      setTitle('')
    } catch (caught) {
      setError(describe(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove(idea: Idea) {
    const before = ideas
    setIdeas((previous) => previous.filter((i) => i.id !== idea.id))
    try {
      await api.deleteIdea(idea.id)
    } catch (caught) {
      setIdeas(before)
      setError(describe(caught))
    }
  }

  async function rename(idea: Idea, next: string) {
    const trimmed = next.trim()
    if (trimmed === '' || trimmed === idea.title) return
    const before = ideas
    setIdeas((previous) => previous.map((i) => (i.id === idea.id ? { ...i, title: trimmed } : i)))
    try {
      await api.updateIdea(idea.id, { title: trimmed })
    } catch (caught) {
      setIdeas(before)
      setError(describe(caught))
    }
  }

  async function drop() {
    if (from === null || over === null || from === over) {
      setFrom(null)
      setOver(null)
      return
    }
    const before = ideas
    const next = [...ideas]
    const [moved] = next.splice(from, 1)
    next.splice(over, 0, moved)
    setIdeas(next)
    setFrom(null)
    setOver(null)

    try {
      await api.reorderIdeas(next.map((i) => i.id))
      onChanged()
    } catch (caught) {
      setIdeas(before)
      setError(describe(caught))
    }
  }

  return (
    <div className="card">
      <h2>Event ideas</h2>
      <p className="hint">
        What you want to run, most important first. Drag to reorder. Book one from the Schedule tab
        and it gets a date here.
      </p>

      {error && <div className="notice error">{error}</div>}

      <form className="idea-add" onSubmit={add}>
        <input
          value={title}
          placeholder="Callout #2"
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="New idea"
        />
        <button className="ghost" type="submit" disabled={busy || title.trim() === ''}>
          Add
        </button>
      </form>

      <ol className="ideas">
        {ideas.map((idea, index) => (
          <li
            key={idea.id}
            className={[
              'idea',
              idea.event_id !== null && 'is-scheduled',
              from === index && 'is-dragging',
              over === index && from !== index && 'is-over',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable
            onDragStart={() => setFrom(index)}
            onDragEnter={() => setOver(index)}
            onDragOver={(event) => event.preventDefault()}
            onDragEnd={drop}
            onDrop={drop}
          >
            <span className="idea-grip" aria-hidden="true">
              ⠿
            </span>

            <input
              className="idea-title"
              defaultValue={idea.title}
              onBlur={(event) => rename(idea, event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
              aria-label={`Rename ${idea.title}`}
            />

            <span className={`idea-status${idea.event_id !== null ? ' is-booked' : ''}`}>
              {idea.scheduled_for
                ? `${formatDay(parseLocal(idea.scheduled_for))} · ${formatTime(
                    parseLocal(idea.scheduled_for),
                  )}`
                : 'Not scheduled'}
            </span>

            <button
              type="button"
              className="idea-remove"
              aria-label={`Delete ${idea.title}`}
              onClick={() => remove(idea)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>

      {ideas.length === 0 && <p className="empty">Nothing yet. Add the first idea above.</p>}
    </div>
  )
}
