import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createExampleComTools } from './data'

const originalFetch = globalThis.fetch

describe('createExampleComTools', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          provider: 'example-com',
          capturedAt: new Date().toISOString(),
          source: 'dom',
          confidence: 'high',
          rawVersion: 'example-com-dom-v1',
          metrics: [
            {
              key: 'example_domain_present',
              label: 'Example Domain present',
              remaining: 1,
              unit: 'unknown',
            },
          ],
        })
      )
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('reads the latest provider snapshot from the scraping server', async () => {
    const tools = createExampleComTools('http://127.0.0.1:3929')

    await expect(tools.getLatestSnapshot()).resolves.toMatchObject({
      provider: 'example-com',
    })
  })
})
