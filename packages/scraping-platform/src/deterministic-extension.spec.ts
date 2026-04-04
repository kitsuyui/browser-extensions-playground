import { describe, expect, it } from 'vitest'

import {
  createDeterministicExtensionManifest,
  DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES,
} from './deterministic-extension'

describe('createDeterministicExtensionManifest', () => {
  it('creates a deterministic extension manifest with limited permissions', () => {
    const manifest = createDeterministicExtensionManifest({
      name: 'Quota Example',
      description: 'Example deterministic extension',
      matches: ['https://example.com/*'],
    })

    expect(manifest.permissions).toEqual(['alarms', 'storage', 'tabs'])
    expect(manifest.host_permissions).toEqual([
      'https://example.com/*',
      'http://127.0.0.1/*',
    ])
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://example.com/*'],
        js: ['content-script.js'],
        run_at: 'document_idle',
      },
    ])
  })
})

describe('DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES', () => {
  it('uses a conservative periodic reload interval', () => {
    expect(DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES).toBe(15)
  })
})
