import { useEffect, useState } from 'react'
import { api, ApiError, type Idea } from '../api'
import { Icon } from './Icons'
import { useToast } from '../toastContext'

interface Props {
  onChanged: () => void
  refreshKey: number
}

export function Ideas({ onChanged, refreshKey }: Props) {
  const { showToast } = useToast()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')

  function describe(caught: unknown): string {
    return caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)
  }

  useEffect(() => {
    api
      .ideas()
      .then(setIdeas)
      .catch((caught) => setError(describe(caught)))
  }, [refreshKey])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createIdea({ title: title.trim() })
      setIdeas((prev) => [...prev, created])
      setTitle('')
      onChanged()
      showToast('Idea added to backlog', 'success')
    } catch (caught) {
      setError(describe(caught))
      showToast(describe(caught), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(idea: Idea) {
    const before = ideas
    setIdeas((prev) => prev.filter((i) => i.id !== idea.id))
    try {
      await api.deleteIdea(idea.id)
      onChanged()
      showToast(`Removed "${idea.title}"`, 'info')
    } catch (caught) {
      setIdeas(before)
      setError(describe(caught))
      showToast(describe(caught), 'error')
    }
  }

  async function handleSaveRename(idea: Idea) {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === idea.title) {
      setEditingId(null)
      return
    }
    const before = ideas
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, title: trimmed } : i)))
    setEditingId(null)
    try {
      await api.updateIdea(idea.id, { title: trimmed })
      onChanged()
      showToast('Idea updated', 'success')
    } catch (caught) {
      setIdeas(before)
      setError(describe(caught))
      showToast(describe(caught), 'error')
    }
  }

  async function moveIdea(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= ideas.length) return

    const next = [...ideas]
    const [moved] = next.splice(index, 1)
    next.splice(targetIndex, 0, moved)
    setIdeas(next)

    try {
      await api.reorderIdeas(next.map((i) => i.id))
      onChanged()
    } catch (caught) {
      setIdeas(ideas)
      setError(describe(caught))
      showToast(describe(caught), 'error')
    }
  }

  return (
    <div className="ideas-container">
      <div className="card ideas-card">
        <div className="ideas-header">
          <div>
            <h3>Event Ideas Backlog</h3>
            <p className="hint">
              Brainstorm what you want to run this term in priority order. Pick any idea when booking a slot on the Schedule tab.
            </p>
          </div>
        </div>

        {error && <div className="notice error">{error}</div>}

        <form className="add-idea-form" onSubmit={handleAdd}>
          <input
            value={title}
            placeholder="e.g. Intro to Web Dev Workshop, Sponsor Tech Talk #1..."
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={busy || !title.trim()}>
            <Icon name="plus" size={14} />
            <span>Add Idea</span>
          </button>
        </form>

        <div className="ideas-list">
          {ideas.map((idea, index) => (
            <div key={idea.id} className="idea-row">
              <div className="idea-order-col">
                <button
                  type="button"
                  className="btn-arrow"
                  disabled={index === 0}
                  onClick={() => moveIdea(index, 'up')}
                  aria-label="Move up"
                >
                  <Icon name="caretUp" size={12} />
                </button>
                <span className="idea-rank font-mono">#{index + 1}</span>
                <button
                  type="button"
                  className="btn-arrow"
                  disabled={index === ideas.length - 1}
                  onClick={() => moveIdea(index, 'down')}
                  aria-label="Move down"
                >
                  <Icon name="caretDown" size={12} />
                </button>
              </div>

              <div className="idea-content">
                {editingId === idea.id ? (
                  <form
                    className="inline-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSaveRename(idea)
                    }}
                  >
                    <input
                      value={editTitle}
                      autoFocus
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveRename(idea)}
                      onKeyDown={(e) => e.key === 'Escape' && setEditingId(null)}
                    />
                    <button type="submit" className="btn-icon">
                      <Icon name="check" size={14} />
                    </button>
                  </form>
                ) : (
                  <div className="idea-title-wrap">
                    <span className="idea-title">{idea.title}</span>
                    <button
                      type="button"
                      className="btn-icon-dim"
                      onClick={() => {
                        setEditingId(idea.id)
                        setEditTitle(idea.title)
                      }}
                      title="Rename idea"
                    >
                      <Icon name="pencilSimple" size={13} />
                    </button>
                  </div>
                )}
              </div>

              <div className="idea-status">
                {idea.event_id ? (
                  <span className="status-badge status-scheduled">
                    <Icon name="checkCircle" size={13} />
                    Scheduled
                  </span>
                ) : (
                  <span className="status-badge status-ready">Ready to Plan</span>
                )}

                <button
                  type="button"
                  className="btn-icon-danger"
                  onClick={() => handleRemove(idea)}
                  title="Delete idea"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}

          {ideas.length === 0 && !error && (
            <div className="empty-ideas">
              <Icon name="lightbulb" size={32} className="text-muted" />
              <p>No event ideas yet. Add your first brainstormed event idea above!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
