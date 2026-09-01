import { describe, expect, it } from 'vitest'
import type { ClubEvent, Exam } from './api'
import {
  clubEventToEvent,
  digestId,
  examToEvent,
  ID_PREFIX,
  LEGAL_ID,
  planSync,
  type GcalEvent,
} from './gcal'

/**
 * These tests exist for one reason: a wrong event id means the next sync
 * appends instead of updating, and nothing in the UI would reveal it until
 * someone opens Google Calendar and finds every exam listed twice.
 */

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 1,
    course_code: 'MA 16200',
    course_title: 'Plane Analytic Geometry And Calculus II',
    kind: 'midterm',
    starts_at: '2026-09-23T20:00:00',
    ends_at: '2026-09-23T21:00:00',
    rooms: 'CL50 224, BHEE 129',
    weight: 100,
    ...overrides,
  }
}

function clubEvent(overrides: Partial<ClubEvent> = {}): ClubEvent {
  return {
    id: 1,
    title: 'Callout',
    organization: 'Robotics',
    location: 'STEW 214',
    starts_at: '2026-09-24T19:00:00',
    ends_at: '2026-09-24T20:00:00',
    expected_attendance: 40,
    audience_fraction: 1,
    source: 'manual',
    is_ours: false,
    weight: 40,
    ...overrides,
  }
}

describe('digestId', () => {
  // base32hex stops at `v`, so the obvious "ex" abbreviation for exam is not a
  // legal prefix. Every prefix we ship has to survive this.
  it.each(Object.entries(ID_PREFIX))('ships a legal prefix for %s', (_kind, prefix) => {
    expect(prefix).toMatch(/^[a-v0-9]+$/)
  })

  it('only emits characters Google accepts in an event id', async () => {
    const id = await digestId(ID_PREFIX.exam, 'MA 16200', 'midterm', '2026-09-23T20:00:00')
    expect(id).toMatch(LEGAL_ID)
  })

  it('refuses a prefix outside the alphabet instead of letting Google 400', async () => {
    await expect(digestId('ex', 'MA 16200')).rejects.toThrow(/legal Google Calendar event id/)
  })

  it('is stable across calls', async () => {
    expect(await digestId('sitting', 'a', 'b')).toBe(await digestId('sitting', 'a', 'b'))
  })

  it('separates parts so regrouping them changes the id', async () => {
    expect(await digestId('sitting', 'ab', 'c')).not.toBe(await digestId('sitting', 'a', 'bc'))
  })
})

describe('examToEvent', () => {
  it('gives the same sitting the same id even after a reseed changes the row id', async () => {
    const before = await examToEvent(exam({ id: 1 }))
    const after = await examToEvent(exam({ id: 998 }))
    expect(after.id).toBe(before.id)
  })

  it('gives a different id to a sitting at a different time', async () => {
    const original = await examToEvent(exam())
    const moved = await examToEvent(exam({ starts_at: '2026-09-24T20:00:00' }))
    expect(moved.id).not.toBe(original.id)
  })

  it('gives a different id to a different course at the same time', async () => {
    const ma = await examToEvent(exam({ course_code: 'MA 16200' }))
    const cs = await examToEvent(exam({ course_code: 'CS 25100' }))
    expect(cs.id).not.toBe(ma.id)
  })

  it('changes the content hash but not the id when only the room moves', async () => {
    const original = await examToEvent(exam())
    const relocated = await examToEvent(exam({ rooms: 'WTHR 200' }))
    expect(relocated.id).toBe(original.id)
    expect(relocated.extendedProperties.private.schedulerHash).not.toBe(
      original.extendedProperties.private.schedulerHash,
    )
  })

  it('sends wall-clock time with a named zone rather than a computed offset', async () => {
    const event = await examToEvent(exam())
    expect(event.start.dateTime).toBe('2026-09-23T20:00:00')
    expect(event.start.timeZone).toBe('America/Indiana/Indianapolis')
  })
})

describe('clubEventToEvent', () => {
  it('does not collide with a hand-entered row from another source', async () => {
    const scraped = await clubEventToEvent(clubEvent({ source: 'email:2026-08-24' }))
    const manual = await clubEventToEvent(clubEvent({ source: 'manual' }))
    expect(scraped.id).not.toBe(manual.id)
  })

  it('does not collide with an exam that shares a start time', async () => {
    const event = await clubEventToEvent(clubEvent({ starts_at: '2026-09-23T20:00:00' }))
    const sitting = await examToEvent(exam())
    expect(event.id).not.toBe(sitting.id)
  })
})

describe('planSync', () => {
  const a: GcalEvent = {
    id: 'sitting01',
    summary: 'A',
    description: '',
    location: '',
    start: { dateTime: '2026-09-23T20:00:00', timeZone: 'America/Indiana/Indianapolis' },
    end: { dateTime: '2026-09-23T21:00:00', timeZone: 'America/Indiana/Indianapolis' },
    extendedProperties: { private: { schedulerHash: 'h1' } },
  }

  it('creates what the calendar has never seen', () => {
    const plan = planSync([a], new Map())
    expect(plan.create).toEqual([a])
    expect(plan.update).toEqual([])
    expect(plan.remove).toEqual([])
  })

  it('skips a row whose content has not moved', () => {
    const plan = planSync([a], new Map([['sitting01', 'h1']]))
    expect(plan.unchanged).toBe(1)
    expect(plan.create).toEqual([])
    expect(plan.update).toEqual([])
  })

  it('updates in place rather than duplicating when the content changed', () => {
    const plan = planSync([a], new Map([['sitting01', 'stale']]))
    expect(plan.update).toEqual([a])
    expect(plan.create).toEqual([])
    expect(plan.remove).toEqual([])
  })

  it('removes an event no current row claims', () => {
    const plan = planSync([a], new Map([['sitting01', 'h1'], ['sitting99', 'h2']]))
    expect(plan.remove).toEqual(['sitting99'])
  })

  it('treats an event with no hash as changed rather than unchanged', () => {
    const plan = planSync([a], new Map([['sitting01', undefined]]))
    expect(plan.update).toEqual([a])
    expect(plan.unchanged).toBe(0)
  })

  it('is a no-op the second time through', () => {
    const first = planSync([a], new Map())
    const settled = new Map(
      first.create.map((e) => [e.id, e.extendedProperties.private.schedulerHash] as const),
    )
    const second = planSync([a], settled)
    expect(second).toEqual({ create: [], update: [], remove: [], unchanged: 1 })
  })
})
