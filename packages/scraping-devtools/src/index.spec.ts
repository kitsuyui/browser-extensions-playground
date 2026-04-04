import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createScrapingDevtoolsTools } from './index'
import { callScrapingDevtoolsTool } from './mcp'

const originalFetch = globalThis.fetch

describe('createScrapingDevtoolsTools', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/api/status')) {
        return new Response(
          JSON.stringify({
            riskLevel: 'elevated',
            warnings: ['Remote browser control is enabled.'],
            deterministicProviders: [],
            devClients: [
              {
                clientId: 'dev-1',
                connectedAt: new Date().toISOString(),
              },
            ],
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
            {
              id: 'anthropic',
              displayName: 'Anthropic',
              matches: ['https://claude.ai/*'],
              capabilities: ['usage'],
            },
          ])
        )
      }

      if (url.endsWith('/api/dev/clients')) {
        return new Response(
          JSON.stringify([
            {
              clientId: 'dev-1',
              connectedAt: new Date().toISOString(),
            },
          ])
        )
      }

      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            provider: 'openai',
          },
        })
      )
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('lists providers and server risk status', async () => {
    const tools = createScrapingDevtoolsTools('http://127.0.0.1:3929')

    await expect(tools.listProviders()).resolves.toMatchObject([
      { id: 'openai', capabilities: ['usage'] },
      { id: 'anthropic', capabilities: ['usage'] },
    ])

    await expect(tools.getServerStatus()).resolves.toMatchObject({
      riskLevel: 'elevated',
    })

    await expect(tools.listDevClients()).resolves.toHaveLength(1)
    await expect(
      tools.runDevCommand({
        command: {
          type: 'fetch-json',
          url: 'https://claude.ai/api/example',
        },
      })
    ).resolves.toMatchObject({
      ok: true,
    })
  })

  it('exposes the same devtools operations through MCP tool handlers', async () => {
    await expect(
      callScrapingDevtoolsTool('get_status', {})
    ).resolves.toMatchObject({
      riskLevel: 'elevated',
    })
    await expect(
      callScrapingDevtoolsTool('list_clients', {})
    ).resolves.toHaveLength(1)
    await expect(
      callScrapingDevtoolsTool('capture_page', {})
    ).resolves.toMatchObject({
      ok: true,
    })
    await expect(
      callScrapingDevtoolsTool('fetch_json', {
        url: 'https://claude.ai/api/example',
      })
    ).resolves.toMatchObject({
      ok: true,
    })
  })
})
