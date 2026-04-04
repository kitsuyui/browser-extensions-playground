import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createOpenAIStableUsageSnapshot, createQuotaOpenAITools } from './data'

const originalFetch = globalThis.fetch

describe('createOpenAIStableUsageSnapshot', () => {
  it('normalizes expected OpenAI usage keys and fills missing metrics with null', () => {
    expect(
      createOpenAIStableUsageSnapshot({
        provider: 'openai',
        capturedAt: new Date().toISOString(),
        source: 'dom',
        confidence: 'medium',
        rawVersion: 'test',
        metrics: [
          {
            key: 'codex_5h',
            label: '5時間の使用制限',
            remaining: 98,
            limit: 100,
            unit: 'percent',
          },
        ],
      })
    ).toMatchObject({
      provider: 'openai',
      metrics: {
        codex_5h: {
          key: 'codex_5h',
          remaining: 98,
        },
        spark_5h: null,
      },
    })
  })
})

describe('createQuotaOpenAITools', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          provider: 'openai',
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
    const tools = createQuotaOpenAITools('http://127.0.0.1:3929')

    await expect(tools.getLatestSnapshot()).resolves.toMatchObject({
      provider: 'openai',
    })

    await expect(tools.getStableUsageSnapshot()).resolves.toMatchObject({
      provider: 'openai',
      metrics: {
        codex_5h: null,
      },
    })
  })
})
