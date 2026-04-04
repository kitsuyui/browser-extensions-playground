import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQuotaAnthropicTools } from './data'

const originalFetch = globalThis.fetch

describe('createQuotaAnthropicTools', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          provider: 'anthropic',
          capturedAt: new Date().toISOString(),
          source: 'dom',
          confidence: 'medium',
          rawVersion: 'test',
          metrics: [],
        })
      )
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('reads the latest provider snapshot from the scraping server', async () => {
    const tools = createQuotaAnthropicTools('http://127.0.0.1:3929')

    await expect(tools.getLatestSnapshot()).resolves.toMatchObject({
      provider: 'anthropic',
    })
  })
})
