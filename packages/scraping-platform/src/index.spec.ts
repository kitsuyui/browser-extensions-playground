import { providerExtractor as openAiProvider } from '@kitsuyui/browser-extensions-quota-openai'
import { describe, expect, it } from 'vitest'

import {
  collectDomProbeMatches,
  createExtensionCaptureFromDocument,
  createProviderSnapshot,
  isProviderSnapshot,
} from './index'

describe('provider snapshot helpers', () => {
  it('preserves capturedAt when provided', () => {
    const snapshot = createProviderSnapshot({
      provider: 'openai',
      source: 'dom',
      confidence: 'high',
      rawVersion: 'test',
      metrics: [],
      capturedAt: '2025-01-01T00:00:00.000Z',
    })

    expect(snapshot.capturedAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('accepts a valid snapshot shape', () => {
    expect(
      isProviderSnapshot({
        provider: 'anthropic',
        capturedAt: new Date().toISOString(),
        source: 'dom',
        confidence: 'medium',
        rawVersion: 'fixture',
        metrics: [],
      })
    ).toBe(true)
  })
})

describe('collectDomProbeMatches', () => {
  it('captures text for matching selectors', () => {
    const fakeDocument = {
      querySelector(selector: string) {
        if (selector === '[data-testid="quota"]') {
          return {
            innerText: '5-hour window 4 / 20',
            outerHTML:
              '<section data-testid="quota">5-hour window 4 / 20</section>',
          }
        }

        return null
      },
    } as unknown as Document

    expect(
      collectDomProbeMatches(fakeDocument, [
        {
          key: 'quota',
          label: 'Quota',
          selector: '[data-testid="quota"]',
        },
      ])
    ).toMatchObject([
      {
        key: 'quota',
        text: '5-hour window 4 / 20',
      },
    ])
  })

  it('trims whitespace from both text and htmlSnippet', () => {
    const fakeDocument = {
      querySelector(selector: string) {
        if (selector === '[data-testid="padded"]') {
          return {
            innerText: '  padded text  ',
            outerHTML: '  <span data-testid="padded">padded text</span>  ',
          }
        }

        return null
      },
    } as unknown as Document

    const matches = collectDomProbeMatches(fakeDocument, [
      { key: 'padded', label: 'Padded', selector: '[data-testid="padded"]' },
    ])

    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('padded text')
    expect(matches[0].htmlSnippet).toBe(
      '<span data-testid="padded">padded text</span>'
    )
  })
})

describe('createExtensionCaptureFromDocument', () => {
  it('builds dom capture and provider snapshot together', () => {
    const fakeDocument = {
      title: 'Quota page',
      location: {
        href: 'https://chatgpt.com/codex/settings/usage',
      },
      body: {
        innerText:
          '5時間の使用制限 4% 残り リセット：21:04 週あたりの使用制限 10% 残り リセット：2026/04/08 22:42',
      },
      querySelector() {
        return null
      },
    } as unknown as Document

    expect(
      createExtensionCaptureFromDocument(openAiProvider, fakeDocument)
    ).toMatchObject({
      domCapture: {
        provider: 'openai',
        title: 'Quota page',
      },
      snapshot: {
        provider: 'openai',
      },
    })
  })
})
