import { describe, expect, it } from 'vitest'

import {
  createBrowserExtensionInfo,
  createExtensionManifest,
  createHelloWorldMessage,
  createPopupHtml,
} from '.'

describe('createBrowserExtensionInfo', () => {
  it('returns extension metadata', () => {
    expect(createBrowserExtensionInfo()).toEqual({
      name: 'Browser Extension Hello',
      version: '0.0.0',
      versionName: undefined,
    })
  })
})

describe('createHelloWorldMessage', () => {
  it('returns a string', () => {
    expect(createHelloWorldMessage()).toBe('Hello, World!')
  })
})

describe('createExtensionManifest', () => {
  it('returns a Manifest V3 definition', () => {
    expect(createExtensionManifest()).toEqual({
      manifest_version: 3,
      name: 'Browser Extension Hello',
      version: '0.0.0',
      description: 'A minimal browser extension that shows Hello, World!.',
      action: {
        default_title: 'Hello, World!',
        default_popup: 'popup.html',
      },
      browser_specific_settings: {
        gecko: {
          id: 'browser-extensions-hello@kitsuyui.com',
        },
      },
    })
  })

  it('accepts a browser-safe version plus a prerelease display name', () => {
    expect(
      createExtensionManifest({
        version: '1.2.3',
        version_name: '1.2.3-rc.7',
      })
    ).toEqual({
      manifest_version: 3,
      name: 'Browser Extension Hello',
      version: '1.2.3',
      version_name: '1.2.3-rc.7',
      description: 'A minimal browser extension that shows Hello, World!.',
      action: {
        default_title: 'Hello, World!',
        default_popup: 'popup.html',
      },
      browser_specific_settings: {
        gecko: {
          id: 'browser-extensions-hello@kitsuyui.com',
        },
      },
    })
  })
})

describe('createPopupHtml', () => {
  it('includes the popup script', () => {
    expect(createPopupHtml()).toContain('./popup.js')
  })
})
