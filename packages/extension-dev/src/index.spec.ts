import { describe, expect, it } from 'vitest'

import { createExtensionManifest } from './index'
import { createPopupHtml } from './runtime'

describe('createExtensionManifest', () => {
  it('includes localhost and websocket permissions for server integration', () => {
    expect(createExtensionManifest().host_permissions).toContain(
      'http://127.0.0.1/*'
    )
    expect(createExtensionManifest().host_permissions).toContain(
      'https://example.com/*'
    )
    expect(createExtensionManifest().permissions).toContain('tabs')
  })
})

describe('createPopupHtml', () => {
  it('includes remote-control warning text', () => {
    const html = createPopupHtml()

    expect(html).toContain(
      'Enable this when you want to inspect or control an open provider tab.'
    )
    expect(html).toContain('Debug')
    expect(html).toContain('Last command result')
    expect(html).toContain('Copy JSON')
    expect(html).toContain('Remote control enabled')
    expect(html).toContain('type="checkbox"')
  })
})
