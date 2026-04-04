import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { ProviderSnapshot } from '@kitsuyui/browser-extensions-scraping-platform'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { createScrapingServer } from './index'

const servers: Array<Awaited<ReturnType<typeof createServerForTest>>> = []

async function createServerForTest() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'scraping-server-'))
  const server = createScrapingServer({
    host: '127.0.0.1',
    port: 0,
    storeFile: path.join(tempDir, 'deterministic.json'),
  })
  const listening = await server.listen()

  const resource = {
    tempDir,
    server,
    listening,
  }
  servers.push(resource)
  return resource
}

afterEach(async () => {
  while (servers.length > 0) {
    const resource = servers.pop()

    if (!resource) {
      continue
    }

    await resource.server.close()
    await rm(resource.tempDir, { recursive: true, force: true })
  }
})

describe('createScrapingServer', () => {
  it('ingests deterministic snapshots and exposes status', async () => {
    const { listening } = await createServerForTest()
    const snapshot: ProviderSnapshot = {
      provider: 'openai',
      capturedAt: new Date().toISOString(),
      source: 'dom',
      confidence: 'medium',
      rawVersion: 'test',
      metrics: [],
    }

    const ingestResponse = await fetch(
      `${listening.url}/api/deterministic/ingest`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snapshot }),
      }
    )

    expect(ingestResponse.status).toBe(201)

    const latestResponse = await fetch(
      `${listening.url}/api/deterministic/latest?provider=openai`
    )
    expect(await latestResponse.json()).toMatchObject({
      provider: 'openai',
      rawVersion: 'test',
    })

    const statusResponse = await fetch(`${listening.url}/api/status`)
    expect(await statusResponse.json()).toMatchObject({
      riskLevel: 'normal',
      deterministicProviders: ['openai'],
    })

    const providersResponse = await fetch(`${listening.url}/api/providers`)
    expect(await providersResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'openai',
          capabilities: ['usage'],
        }),
      ])
    )

    const providerDescriptionResponse = await fetch(
      `${listening.url}/api/providers/openai`
    )
    expect(await providerDescriptionResponse.json()).toEqual(
      expect.objectContaining({
        id: 'openai',
        snapshotSchema: expect.objectContaining({
          rawVersions: expect.arrayContaining([
            expect.objectContaining({
              rawVersion: 'openai-wham-usage-v1',
            }),
          ]),
          metrics: expect.arrayContaining([
            expect.objectContaining({
              key: 'codex_5h',
            }),
          ]),
        }),
      })
    )
  })

  it('surfaces dev websocket clients and command results', async () => {
    const { listening } = await createServerForTest()
    const client = new WebSocket(
      `${listening.url.replace('http://', 'ws://')}/ws/dev`
    )

    await new Promise<void>((resolvePromise) => {
      client.once('open', () => {
        client.send(
          JSON.stringify({
            type: 'hello',
            extensionName: 'Scraping Devtools',
            extensionVersion: '0.0.0',
          })
        )
        resolvePromise()
      })
    })

    client.on('message', (buffer) => {
      const message = JSON.parse(buffer.toString()) as {
        readonly type?: string
        readonly commandId?: string
      }

      if (message.type === 'run-command' && message.commandId) {
        client.send(
          JSON.stringify({
            type: 'command-result',
            commandId: message.commandId,
            ok: true,
            result: {
              title: 'captured',
            },
          })
        )
      }
    })

    const statusResponse = await fetch(`${listening.url}/api/status`)
    expect(await statusResponse.json()).toMatchObject({
      riskLevel: 'elevated',
    })

    const commandResponse = await fetch(`${listening.url}/api/dev/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        command: {
          type: 'capture-page',
        },
      }),
    })

    expect(await commandResponse.json()).toMatchObject({
      ok: true,
      result: {
        title: 'captured',
      },
    })

    client.close()
  })

  it('returns 400 for invalid JSON bodies without crashing the server', async () => {
    const { listening } = await createServerForTest()
    const response = await fetch(`${listening.url}/api/deterministic/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{"snapshot":',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Request body must be valid JSON.',
    })

    const healthResponse = await fetch(`${listening.url}/health`)
    expect(healthResponse.status).toBe(200)
  })

  it('ignores malformed websocket frames and keeps the server available', async () => {
    const { listening } = await createServerForTest()
    const client = new WebSocket(
      `${listening.url.replace('http://', 'ws://')}/ws/dev`
    )

    await new Promise<void>((resolvePromise) => {
      client.once('open', () => {
        client.send('not-json')
        resolvePromise()
      })
    })

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))

    const healthResponse = await fetch(`${listening.url}/health`)
    expect(healthResponse.status).toBe(200)

    client.close()
  })
})
