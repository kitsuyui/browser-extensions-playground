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
            snapshotProviders: ['openai'],
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

      if (url.includes('/api/snapshots/latest?provider=openai')) {
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

      if (url.includes('/api/snapshots/history?provider=openai&limit=2')) {
        return new Response(
          JSON.stringify([
            {
              receivedAt: '2026-04-04T12:00:00.000Z',
              snapshot: {
                provider: 'openai',
                capturedAt: '2026-04-04T11:59:59.000Z',
                source: 'network',
                confidence: 'high',
                rawVersion: 'openai-wham-usage-v1',
                metrics: [],
              },
            },
          ])
        )
      }

      return new Response(JSON.stringify(null))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('reads server status and snapshots', async () => {
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

    await expect(
      tools.getSnapshotHistory({
        provider: 'openai',
        limit: 2,
      })
    ).resolves.toMatchObject([
      {
        receivedAt: '2026-04-04T12:00:00.000Z',
        snapshot: {
          provider: 'openai',
        },
      },
    ])
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
    await expect(
      callScrapedDataTool('get_history', {
        provider: 'openai',
        limit: 2,
      })
    ).resolves.toMatchObject([
      {
        snapshot: {
          provider: 'openai',
        },
      },
    ])
  })
})
