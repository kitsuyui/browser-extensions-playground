import { describe, expect, it } from 'vitest'

import { createExtensionManifest, extractSnapshot } from '.'
import { createPopupHtml } from './runtime'

describe('extractSnapshot', () => {
  it('extracts deterministic metrics from example.com page text', () => {
    const snapshot = extractSnapshot({
      url: 'https://example.com/',
      pageText:
        'Example Domain This domain is for use in illustrative examples.',
    })

    expect(snapshot).toMatchObject({
      provider: 'example-com',
      rawVersion: 'example-com-dom-v1',
      metrics: expect.arrayContaining([
        expect.objectContaining({
          key: 'example_domain_present',
          remaining: 1,
        }),
      ]),
    })
  })
})

describe('createExtensionManifest', () => {
  it('limits host permissions to example.com and localhost ingest', () => {
    expect(createExtensionManifest().host_permissions).toEqual([
      'https://example.com/*',
      'http://127.0.0.1/*',
    ])
    expect(createExtensionManifest().permissions).toEqual([
      'alarms',
      'storage',
      'tabs',
    ])
  })
})

describe('createPopupHtml', () => {
  it('renders a read-only example.com popup', () => {
    const html = createPopupHtml()

    expect(html).toContain('Example.com Data')
    expect(html).toContain('Latest snapshot')
  })
})
