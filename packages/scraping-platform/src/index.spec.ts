import { providerExtractor as openAiProvider } from '@kitsuyui/browser-extensions-quota-openai'
import { describe, expect, it } from 'vitest'

import {
  collectDomProbeMatches,
  createExtensionCaptureFromDocument,
  createProviderSnapshot,
  describeProvider,
  extractSnapshotFromPage,
  findProviderForUrl,
  isProviderSnapshot,
  listProviderHostPermissions,
  listProviders,
} from './index'

describe('providerRegistry', () => {
  it('lists registered providers', () => {
    expect(listProviders().map((provider) => provider.id)).toEqual([
      'example-com',
      'openai',
      'anthropic',
    ])
  })

  it('lists provider host permissions', () => {
    expect(listProviderHostPermissions()).toContain('https://chatgpt.com/*')
  })

  it('describes providers via the registry without provider-specific logic', () => {
    expect(describeProvider('openai')).toEqual(
      expect.objectContaining({
        id: 'openai',
        snapshotSchema: expect.objectContaining({
          metrics: expect.arrayContaining([
            expect.objectContaining({
              key: 'codex_5h',
            }),
          ]),
        }),
      })
    )
  })
})

describe('findProviderForUrl', () => {
  it('finds the matching provider', () => {
    expect(findProviderForUrl('https://claude.ai/chats/123')?.manifest.id).toBe(
      'anthropic'
    )
  })
})

describe('provider snapshot helpers', () => {
  it('fills capturedAt when omitted', () => {
    const snapshot = createProviderSnapshot({
      provider: 'openai',
      source: 'dom',
      confidence: 'high',
      rawVersion: 'test',
      metrics: [],
    })

    expect(snapshot.capturedAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
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

describe('extractSnapshotFromPage', () => {
  it('uses the provider registry to extract a snapshot', () => {
    const snapshot = extractSnapshotFromPage({
      url: 'https://chatgpt.com/codex/settings/usage',
      pageText: '5時間の使用制限 10% 残り リセット：21:04',
    })

    expect(snapshot?.provider).toBe('openai')
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
