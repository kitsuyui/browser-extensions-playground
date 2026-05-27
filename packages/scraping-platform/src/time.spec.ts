import { describe, expect, it } from 'vitest'

import {
  type IsoTimestampClock,
  isoTimestampClockGlobalKey,
  normalizeResetTimestamp,
  resolveIsoTimestampClock,
} from './time'

describe('ISO timestamp clocks', () => {
  it('resolves an injected clock from a scope', () => {
    const clock: IsoTimestampClock = {
      nowIso: () => '2026-01-02T03:04:05.000Z',
    }

    expect(
      resolveIsoTimestampClock({
        [isoTimestampClockGlobalKey]: clock,
      }).nowIso()
    ).toBe('2026-01-02T03:04:05.000Z')
  })
})

describe('normalizeResetTimestamp', () => {
  it('normalizes explicit timezone timestamps to UTC ISO strings', () => {
    expect(normalizeResetTimestamp('2026-04-04T12:00:00.000Z')).toBe(
      '2026-04-04T12:00:00.000Z'
    )
    expect(normalizeResetTimestamp('2026-04-04T21:00:00+09:00')).toBe(
      '2026-04-04T12:00:00.000Z'
    )
    expect(normalizeResetTimestamp('May 1, 2026 12:00 AM UTC')).toBe(
      '2026-05-01T00:00:00.000Z'
    )
  })

  it('rejects ambiguous local reset labels', () => {
    expect(normalizeResetTimestamp('21:04')).toBeUndefined()
    expect(normalizeResetTimestamp('2026/04/08 22:42')).toBeUndefined()
    expect(normalizeResetTimestamp('Apr 8, 10:42 PM')).toBeUndefined()
    expect(normalizeResetTimestamp('2026-04-04T12:00:00')).toBeUndefined()
  })
})
