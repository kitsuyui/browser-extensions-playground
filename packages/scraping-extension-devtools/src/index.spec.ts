import { describe, expect, it, vi } from 'vitest'

import { createExtensionManifest } from './index'
import { inferProviderId, SUPPORTED_PROVIDER_MATCH_PATTERNS } from './providers'
import { createPopupHtml } from './runtime'
import { isCurrentOpenSocket } from './socket'

describe('createExtensionManifest', () => {
  it('includes localhost and websocket permissions for server integration', () => {
    expect(createExtensionManifest().host_permissions).toContain(
      'http://127.0.0.1/*'
    )
    expect(createExtensionManifest().host_permissions).toEqual(
      expect.arrayContaining(SUPPORTED_PROVIDER_MATCH_PATTERNS)
    )
    expect(createExtensionManifest().permissions).toContain('tabs')
  })

  it('accepts a normalized manifest version and preserves prerelease text', () => {
    expect(
      createExtensionManifest({
        version: '3.5.8',
        version_name: '3.5.8-rc.2',
      })
    ).toEqual(
      expect.objectContaining({
        version: '3.5.8',
        version_name: '3.5.8-rc.2',
      })
    )
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

describe('isCurrentOpenSocket', () => {
  it('accepts only the current open socket', () => {
    const openSocket = { readyState: 1 } as WebSocket
    const closedSocket = { readyState: 3 } as WebSocket

    expect(isCurrentOpenSocket(openSocket, openSocket)).toBe(true)
    expect(isCurrentOpenSocket(null, openSocket)).toBe(false)
    expect(isCurrentOpenSocket(openSocket, closedSocket)).toBe(false)
    expect(isCurrentOpenSocket(closedSocket, closedSocket)).toBe(false)
  })
})

describe('inferProviderId', () => {
  it('logs and falls back to unknown for invalid URLs', () => {
    const warn = console.warn
    const warnSpy = vi.fn()
    console.warn = warnSpy

    try {
      expect(inferProviderId('not a valid URL')).toBe('unknown')
    } finally {
      console.warn = warn
    }

    expect(warnSpy).toHaveBeenCalledWith(
      '[scraping-extension-devtools] failed to infer provider ID from URL',
      expect.objectContaining({
        url: 'not a valid URL',
      })
    )
  })
})
