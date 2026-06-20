import { describe, expect, it } from 'vitest'

import { createExtensionManifest } from './index'
import { SUPPORTED_PROVIDER_MATCH_PATTERNS } from './providers'
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
    const openSocket = { readyState: WebSocket.OPEN } as WebSocket
    const closedSocket = { readyState: WebSocket.CLOSED } as WebSocket

    expect(isCurrentOpenSocket(openSocket, openSocket)).toBe(true)
    expect(isCurrentOpenSocket(null, openSocket)).toBe(false)
    expect(isCurrentOpenSocket(openSocket, closedSocket)).toBe(false)
    expect(isCurrentOpenSocket(closedSocket, closedSocket)).toBe(false)
  })
})
