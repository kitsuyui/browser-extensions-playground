import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createScrapedDataTools } from './index'
import { callScrapedDataTool } from './mcp'

const originalFetch = globalThis.fetch

describe('createScrapedDataTools', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/api/status')) {
        return new Response(
          JSON.stringify({
            riskLevel: 'normal',
            warnings: [],
            deterministicProviders: ['openai'],
            devClients: [],
          })
        )
      }

      if (url.endsWith('/api/providers')) {
        return new Response(
          JSON.stringify([
            {
              id: 'openai',
              displayName: 'OpenAI',
              matches: ['https://chatgpt.com/*'],
              capabilities: ['usage'],
            },
          ])
        )
      }

      if (url.endsWith('/api/providers/openai')) {
        return new Response(
          JSON.stringify({
            id: 'openai',
            displayName: 'OpenAI',
            matches: ['https://chatgpt.com/*'],
            capabilities: ['usage'],
            snapshotSchema: {
              description: 'OpenAI usage snapshot schema.',
              rawVersions: [
                {
                  rawVersion: 'openai-wham-usage-v1',
                  source: 'network',
                  description: 'WHAM usage response.',
                },
              ],
              metrics: [
                {
                  key: 'codex_5h',
                  label: 'Codex 5h',
                  unit: 'percent',
                  description: '5-hour usage percent.',
                },
              ],
            },
          })
        )
      }

      if (url.includes('/api/deterministic/latest?provider=openai')) {
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
      }

      return new Response(JSON.stringify(null))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('reads server status and deterministic snapshots', async () => {
    const tools = createScrapedDataTools('http://127.0.0.1:3929')

    await expect(tools.getServerStatus()).resolves.toMatchObject({
      riskLevel: 'normal',
    })

    await expect(tools.listProviders()).resolves.toMatchObject([
      {
        id: 'openai',
        capabilities: ['usage'],
      },
    ])

    await expect(tools.describeProvider('openai')).resolves.toMatchObject({
      id: 'openai',
      snapshotSchema: {
        metrics: [
          {
            key: 'codex_5h',
          },
        ],
      },
    })

    await expect(tools.getLatestSnapshot('openai')).resolves.toMatchObject({
      provider: 'openai',
      metrics: [],
    })
  })

  it('exposes the same operations through MCP tool handlers', async () => {
    await expect(callScrapedDataTool('get_status', {})).resolves.toMatchObject({
      riskLevel: 'normal',
    })
    await expect(
      callScrapedDataTool('list_providers', {})
    ).resolves.toMatchObject([
      {
        id: 'openai',
      },
    ])
    await expect(
      callScrapedDataTool('get_snapshot', {
        provider: 'openai',
      })
    ).resolves.toMatchObject({
      provider: 'openai',
    })
    await expect(
      callScrapedDataTool('describe_provider', {
        provider: 'openai',
      })
    ).resolves.toMatchObject({
      id: 'openai',
      snapshotSchema: {
        rawVersions: [
          {
            rawVersion: 'openai-wham-usage-v1',
          },
        ],
      },
    })
  })
})
