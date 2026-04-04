import { describe, expect, it } from 'vitest'

import { createExtensionManifest, extractSnapshot } from '.'
import { createPopupHtml } from './runtime'

describe('extractSnapshot', () => {
  it('extracts premium request usage from Copilot settings text', () => {
    const snapshot = extractSnapshot({
      url: 'https://github.com/settings/copilot/features',
      pageText:
        'Usage Premium requests 8.7% Please note that there may be a delay in the displayed usage percentage. The premium request entitlement for your plan will reset at the start of next month.',
    })

    expect(snapshot).toMatchObject({
      provider: 'github-copilot',
      rawVersion: 'github-copilot-dom-v1',
      metrics: expect.arrayContaining([
        expect.objectContaining({
          key: 'premium_requests_used_percent',
          remaining: 8.7,
          limit: 100,
          unit: 'percent',
        }),
      ]),
    })
  })

  it('returns null when premium request markers are absent', () => {
    expect(
      extractSnapshot({
        url: 'https://github.com/settings/copilot/features',
        pageText: 'plain GitHub account settings text without Copilot usage',
      })
    ).toBeNull()
  })
})

describe('createExtensionManifest', () => {
  it('limits host permissions to GitHub Copilot settings and localhost ingest', () => {
    expect(createExtensionManifest().host_permissions).toEqual([
      'https://github.com/settings/copilot/*',
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
  it('renders a Copilot usage popup', () => {
    const html = createPopupHtml()

    expect(html).toContain('Quota GitHub Copilot')
    expect(html).toContain('Premium used')
    expect(html).toContain('Capture enabled')
    expect(html).toContain('type="checkbox"')
  })
})
