import { useState } from 'react'
import { api, ApiError, type ImportResponse } from '../api'

/**
 * Paste-in importer for the registrar's examination schedule.
 *
 * The parser anchors on the date and time columns, so a straight copy-paste out
 * of the browser works even though the CRN and section cells are often blank.
 */

const PLACEHOLDER = `Fall 2026 (PWL) midterm examinations (MA)
MA	16200			Wed 09/23	8:00p - 9:00p	CL50 224, BHEE 129
MA	26500			Tue 10/06	8:00p - 9:00p	STEW 183, WTHR 200`

interface Props {
  onChanged: () => void
}

export function Import({ onChanged }: Props) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await api.importExams(text)
      setResult(response)
      if (response.imported > 0) onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2>Import exam schedule</h2>
      <p className="hint">
        Copy the registrar's exam table straight out of the page and paste it here. Keep
        the title line - it carries the term and year, which the rows themselves do not.
      </p>

      {error && <div className="notice error">{error}</div>}

      {result && (
        <div className={`notice ${result.imported > 0 ? 'ok' : 'warn'}`}>
          Parsed {result.parsed} sittings, imported {result.imported}.
          {result.skipped_non_target.length > 0 && (
            <>
              {' '}
              Skipped {result.skipped_non_target.length} course
              {result.skipped_non_target.length === 1 ? '' : 's'} outside your target list:{' '}
              {result.skipped_non_target.join(', ')}.
            </>
          )}
          {result.imported === 0 && result.parsed > 0 && result.skipped_non_target.length === 0 && (
            <> Everything in this table was already on the calendar.</>
          )}
        </div>
      )}

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="paste">Registrar table</label>
          <textarea
            id="paste"
            rows={14}
            value={text}
            placeholder={PLACEHOLDER}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </div>
        <button className="primary" type="submit" disabled={loading || text.trim() === ''}>
          {loading ? 'Importing…' : 'Import'}
        </button>
      </form>
    </div>
  )
}
