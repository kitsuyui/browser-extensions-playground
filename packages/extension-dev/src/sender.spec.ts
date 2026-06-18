import { describe, expect, it } from 'vitest'

import { isExtensionSender } from './sender'

describe('isExtensionSender', () => {
  it('returns true when sender id matches extension id', () => {
    expect(isExtensionSender({ id: 'abc123' }, 'abc123')).toBe(true)
  })

  it('returns false when sender id does not match extension id', () => {
    expect(isExtensionSender({ id: 'other' }, 'abc123')).toBe(false)
  })

  it('returns false when sender has no id', () => {
    expect(isExtensionSender({}, 'abc123')).toBe(false)
  })

  it('returns false when sender is null', () => {
    expect(isExtensionSender(null, 'abc123')).toBe(false)
  })

  it('returns false when extensionId is undefined', () => {
    expect(isExtensionSender({ id: 'abc123' }, undefined)).toBe(false)
  })

  it('returns false when both are undefined/null', () => {
    expect(isExtensionSender(null, undefined)).toBe(false)
  })
})
