import { describe, expect, it } from 'vitest'
import type { Busy } from './api'
import { evaluateDayRecommendation } from './recommend'

describe('evaluateDayRecommendation', () => {
  const emptyClosed = new Map<string, Busy>()

  it('recommends a clear weekday evening', () => {
    // Wednesday Sep 23, 2026
    const wednesday = new Date('2026-09-23T12:00:00')
    const result = evaluateDayRecommendation(wednesday, [], emptyClosed)
    expect(result.isRecommended).toBe(true)
    expect(result.slotLabel).toBe('7:00 PM+ Host Window')
  })

  it('rejects weekends (Saturday and Sunday)', () => {
    const saturday = new Date('2026-09-26T12:00:00')
    const sunday = new Date('2026-09-27T12:00:00')
    expect(evaluateDayRecommendation(saturday, [], emptyClosed).isRecommended).toBe(false)
    expect(evaluateDayRecommendation(sunday, [], emptyClosed).isRecommended).toBe(false)
  })

  it('rejects days when campus is closed', () => {
    const monday = new Date('2026-09-07T12:00:00') // Labor Day
    const closedMap = new Map<string, Busy>([
      [monday.toDateString(), { start: '2026-09-07T00:00:00', end: '2026-09-07T23:59:59', label: 'Labor Day', kind: 'closed', weight: 1 }],
    ])
    const result = evaluateDayRecommendation(monday, [], closedMap)
    expect(result.isRecommended).toBe(false)
    expect(result.reason).toBe('Labor Day')
  })

  it('rejects days during academic breaks', () => {
    const breakDay = new Date('2026-10-12T12:00:00') // Fall Break
    const blocks: Busy[] = [
      { start: '2026-10-12T00:00:00', end: '2026-10-12T23:59:59', label: 'Fall Break', kind: 'academic', weight: 0 },
    ]
    const result = evaluateDayRecommendation(breakDay, blocks, emptyClosed)
    expect(result.isRecommended).toBe(false)
    expect(result.reason).toBe('Fall Break')
  })

  it('rejects evening with an 8:00 PM midterm exam', () => {
    const wednesday = new Date('2026-09-09T12:00:00')
    const blocks: Busy[] = [
      { start: '2026-09-09T20:00:00', end: '2026-09-09T21:00:00', label: 'CS 25100 midterm', kind: 'exam', weight: 450 },
    ]
    const result = evaluateDayRecommendation(wednesday, blocks, emptyClosed)
    expect(result.isRecommended).toBe(false)
    expect(result.reason).toContain('CS 25100 midterm')
  })

  it('rejects evening with a 6:30 PM exam', () => {
    const tuesday = new Date('2026-09-22T12:00:00')
    const blocks: Busy[] = [
      { start: '2026-09-22T18:30:00', end: '2026-09-22T19:30:00', label: 'MA 26100 midterm', kind: 'exam', weight: 600 },
    ]
    const result = evaluateDayRecommendation(tuesday, blocks, emptyClosed)
    expect(result.isRecommended).toBe(false)
  })

  it('recommends a weekday if exams are only in the morning or early afternoon', () => {
    const thursday = new Date('2026-09-17T12:00:00')
    const blocks: Busy[] = [
      { start: '2026-09-17T10:30:00', end: '2026-09-17T11:30:00', label: 'CS 18000 quiz', kind: 'exam', weight: 200 },
    ]
    const result = evaluateDayRecommendation(thursday, blocks, emptyClosed)
    expect(result.isRecommended).toBe(true)
  })

  it('rejects evening with competing club event', () => {
    const thursday = new Date('2026-09-17T12:00:00')
    const blocks: Busy[] = [
      { start: '2026-09-17T19:30:00', end: '2026-09-17T21:00:00', label: 'Hack Night', kind: 'event', weight: 80 },
    ]
    const result = evaluateDayRecommendation(thursday, blocks, emptyClosed)
    expect(result.isRecommended).toBe(false)
    expect(result.reason).toContain('Hack Night')
  })
})
