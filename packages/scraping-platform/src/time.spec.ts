import { describe, expect, it } from 'vitest'

import {
  type IsoTimestampClock,
  isoTimestampClockGlobalKey,
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
