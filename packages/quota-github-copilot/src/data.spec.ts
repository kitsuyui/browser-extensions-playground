import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQuotaGithubCopilotTools } from './data'

const originalFetch = globalThis.fetch

describe('createQuotaGithubCopilotTools', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          provider: 'github-copilot',
          capturedAt: new Date().toISOString(),
          source: 'dom',
          confidence: 'medium',
          rawVersion: 'github-copilot-dom-v1',
          metrics: [
            {
              key: 'premium_requests_used_percent',
              label: 'Premium used',
              remaining: 12,
              limit: 100,
              unit: 'percent',
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
    const tools = createQuotaGithubCopilotTools('http://127.0.0.1:3929')

    await expect(tools.getLatestSnapshot()).resolves.toMatchObject({
      provider: 'github-copilot',
    })
  })
})
