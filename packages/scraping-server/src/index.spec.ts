import { mkdtemp, rm } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import type {
  ProviderManifest,
  ProviderSnapshot,
} from '@kitsuyui/browser-extensions-scraping-platform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'

import { createScrapingServer, PrismaScrapedDataStore } from './index'

const openAiProviderManifest: ProviderManifest = {
  id: 'openai',
  displayName: 'OpenAI',
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  capabilities: ['usage'],
  debugSelectors: [],
  snapshotSchema: {
    description: 'Usage and quota metrics for OpenAI (test fixture).',
    rawVersions: [
      {
        rawVersion: 'openai-wham-usage-v1',
        source: 'network',
        description: 'Network usage response.',
      },
      {
        rawVersion: 'openai-dom-v2',
        source: 'dom',
        description: 'DOM fallback.',
      },
    ],
    metrics: [
      {
        key: 'codex_5h',
        label: 'Codex 5h',
        unit: 'percent',
        description: 'Percent used in the 5-hour Codex window.',
      },
    ],
  },
}

const servers: Array<Awaited<ReturnType<typeof createServerForTest>>> = []

function createLoggerSpy() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

async function createServerForTest(logger = createLoggerSpy()) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'scraping-server-'))
  const server = createScrapingServer({
    host: '127.0.0.1',
    port: 0,
    storeFile: path.join(tempDir, 'deterministic.sqlite'),
    logger,
  })
  const listening = await server.listen()

  const resource = {
    tempDir,
    server,
    listening,
    logger,
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
  it('ingests snapshots and exposes status', async () => {
    const { listening, logger } = await createServerForTest()
    const snapshot: ProviderSnapshot = {
      provider: 'openai',
      capturedAt: new Date().toISOString(),
      source: 'dom',
      confidence: 'medium',
      rawVersion: 'test',
      metrics: [],
    }

    const ingestResponse = await fetch(
      `${listening.url}/api/snapshots/ingest`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          providerManifest: openAiProviderManifest,
          snapshot,
        }),
      }
    )

    expect(ingestResponse.status).toBe(201)
    expect(logger.info).toHaveBeenCalledWith(
      '[scraping-server] snapshot ingested',
      expect.objectContaining({
        provider: 'openai',
        rawVersion: 'test',
        metricCount: 0,
        source: 'dom',
      })
    )
    expect(logger.info).toHaveBeenCalledWith(
      '[scraping-server] request completed',
      expect.objectContaining({
        method: 'POST',
        pathname: '/api/snapshots/ingest',
        statusCode: 201,
      })
    )

    const latestResponse = await fetch(
      `${listening.url}/api/snapshots/latest?provider=openai`
    )
    expect(await latestResponse.json()).toMatchObject({
      provider: 'openai',
      rawVersion: 'test',
    })

    const statusResponse = await fetch(`${listening.url}/api/status`)
    expect(await statusResponse.json()).toMatchObject({
      riskLevel: 'normal',
      snapshotProviders: ['openai'],
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

  it('filters latest snapshots by stable snapshot discriminants', async () => {
    const { listening } = await createServerForTest()
    const baseCapturedAt = new Date('2026-04-04T12:00:00.000Z')
    const snapshots: readonly ProviderSnapshot[] = [
      {
        provider: 'openai',
        accountLabel: 'team-a',
        capturedAt: baseCapturedAt.toISOString(),
        source: 'dom',
        confidence: 'medium',
        rawVersion: 'dom-v1',
        metrics: [],
      },
      {
        provider: 'openai',
        accountLabel: 'team-b',
        capturedAt: new Date(baseCapturedAt.getTime() + 60_000).toISOString(),
        source: 'network',
        confidence: 'medium',
        rawVersion: 'network-v1',
        metrics: [],
      },
      {
        provider: 'openai',
        accountLabel: 'team-a',
        capturedAt: new Date(baseCapturedAt.getTime() + 120_000).toISOString(),
        source: 'inference',
        confidence: 'low',
        rawVersion: 'inference-v1',
        metrics: [],
      },
    ]

    for (const snapshot of snapshots) {
      const ingestResponse = await fetch(
        `${listening.url}/api/snapshots/ingest`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            providerManifest: openAiProviderManifest,
            snapshot,
          }),
        }
      )

      expect(ingestResponse.status).toBe(201)
    }

    const latestResponse = await fetch(
      `${listening.url}/api/snapshots/latest?provider=openai`
    )
    expect(await latestResponse.json()).toMatchObject({
      provider: 'openai',
      rawVersion: 'inference-v1',
    })

    const domLatestResponse = await fetch(
      `${listening.url}/api/snapshots/latest?provider=openai&source=dom`
    )
    expect(await domLatestResponse.json()).toMatchObject({
      provider: 'openai',
      source: 'dom',
      rawVersion: 'dom-v1',
    })

    const versionLatestResponse = await fetch(
      `${listening.url}/api/snapshots/latest?provider=openai&rawVersion=network-v1`
    )
    expect(await versionLatestResponse.json()).toMatchObject({
      provider: 'openai',
      rawVersion: 'network-v1',
    })

    const accountLatestResponse = await fetch(
      `${listening.url}/api/snapshots/latest?provider=openai&accountLabel=team-b`
    )
    expect(await accountLatestResponse.json()).toMatchObject({
      provider: 'openai',
      accountLabel: 'team-b',
      rawVersion: 'network-v1',
    })

    const missingResponse = await fetch(
      `${listening.url}/api/snapshots/latest?provider=openai&source=dom&accountLabel=team-b`
    )
    expect(await missingResponse.json()).toBeNull()

    const latestAllResponse = await fetch(
      `${listening.url}/api/snapshots/latest?source=dom`
    )
    expect(await latestAllResponse.json()).toEqual({
      openai: expect.objectContaining({
        source: 'dom',
        rawVersion: 'dom-v1',
      }),
    })
  })

  it('returns snapshot history rows with provider and limit filters', async () => {
    const { listening } = await createServerForTest()
    const baseCapturedAt = new Date('2026-04-04T12:00:00.000Z')

    for (let index = 0; index < 3; index += 1) {
      const snapshot: ProviderSnapshot = {
        provider: 'openai',
        capturedAt: new Date(
          baseCapturedAt.getTime() + index * 60_000
        ).toISOString(),
        source: 'dom',
        confidence: 'medium',
        rawVersion: `test-${index}`,
        metrics: [],
      }

      const ingestResponse = await fetch(
        `${listening.url}/api/snapshots/ingest`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            providerManifest: openAiProviderManifest,
            snapshot,
          }),
        }
      )

      expect(ingestResponse.status).toBe(201)
    }

    const response = await fetch(
      `${listening.url}/api/snapshots/history?provider=openai&limit=2`
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject([
      {
        snapshot: {
          provider: 'openai',
          rawVersion: 'test-0',
        },
      },
      {
        snapshot: {
          provider: 'openai',
          rawVersion: 'test-1',
        },
      },
    ])
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
            protocolVersion: '1',
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

  it('logs malformed devtools messages with error details', async () => {
    const logger = createLoggerSpy()
    const { listening } = await createServerForTest(logger)
    const client = new WebSocket(
      `${listening.url.replace('http://', 'ws://')}/ws/dev`
    )

    await new Promise<void>((resolvePromise) => {
      client.once('open', () => {
        client.send('{')
        resolvePromise()
      })
    })
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))

    const warnCall = logger.warn.mock.calls.find(
      ([message]) =>
        message === '[scraping-server] ignored malformed devtools message'
    )
    const payload = warnCall?.[1] as { readonly error?: unknown } | undefined

    expect(payload).toEqual(
      expect.objectContaining({
        reason: 'json-parse-error',
        error: expect.any(Error),
      })
    )
    expect((payload?.error as Error).stack).toContain(
      (payload?.error as Error).message
    )

    client.close()
  })

  it('logs request failures with error details', async () => {
    const logger = createLoggerSpy()
    const { listening } = await createServerForTest(logger)

    const response = await fetch(`${listening.url}/api/snapshots/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Request body must be valid JSON.',
    })

    const errorCall = logger.error.mock.calls.find(
      ([message]) => message === '[scraping-server] request failed'
    )
    const payload = errorCall?.[1] as { readonly error?: unknown } | undefined

    expect(payload).toEqual(
      expect.objectContaining({
        pathname: '/api/snapshots/ingest',
        statusCode: 400,
        error: expect.any(Error),
      })
    )
    expect((payload?.error as Error).stack).toContain(
      'Request body must be valid JSON.'
    )
  })

  it('returns 404 when targetClientId is provided but the client is not connected', async () => {
    const { listening } = await createServerForTest()

    const response = await fetch(`${listening.url}/api/dev/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetClientId: 'nonexistent-client-id',
        command: { type: 'capture-page' },
      }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: "Dev client 'nonexistent-client-id' is not connected.",
    })
  })

  it('returns 409 when no targetClientId is given and no clients are connected', async () => {
    const { listening } = await createServerForTest()

    const response = await fetch(`${listening.url}/api/dev/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: { type: 'capture-page' },
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: 'No devtool websocket clients are connected.',
    })
  })

  it('rejects cross-site browser origins for /api/dev/commands', async () => {
    const { listening } = await createServerForTest()

    const response = await fetch(`${listening.url}/api/dev/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify({
        command: { type: 'capture-page' },
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: 'Cross-origin browser requests are not allowed for this endpoint.',
    })
  })

  it('accepts localhost browser origins for /api/dev/commands', async () => {
    const { listening } = await createServerForTest()

    const response = await fetch(`${listening.url}/api/dev/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: listening.url,
      },
      body: JSON.stringify({
        command: { type: 'capture-page' },
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: 'No devtool websocket clients are connected.',
    })
  })

  it('returns 415 when /api/dev/commands does not use application/json', async () => {
    const { listening } = await createServerForTest()

    const response = await fetch(`${listening.url}/api/dev/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
      },
      body: JSON.stringify({
        command: { type: 'capture-page' },
      }),
    })

    expect(response.status).toBe(415)
    expect(await response.json()).toMatchObject({
      error: 'Request body must use Content-Type: application/json.',
    })
  })

  it('rejects pending dev commands when the websocket client disconnects', async () => {
    const logger = createLoggerSpy()
    const { listening } = await createServerForTest(logger)
    const client = new WebSocket(
      `${listening.url.replace('http://', 'ws://')}/ws/dev`
    )
    let clientId = ''

    const welcomed = new Promise<void>((resolvePromise) => {
      client.on('message', (buffer) => {
        const message = JSON.parse(buffer.toString()) as {
          readonly type?: string
          readonly clientId?: string
        }

        if (message.type === 'welcome' && message.clientId) {
          clientId = message.clientId
          resolvePromise()
          return
        }

        if (message.type === 'run-command') {
          client.close()
        }
      })
    })

    await new Promise<void>((resolvePromise) => {
      client.once('open', () => {
        client.send(
          JSON.stringify({
            type: 'hello',
            protocolVersion: '1',
            extensionName: 'Scraping Devtools',
            extensionVersion: '0.0.0',
          })
        )
        resolvePromise()
      })
    })
    await welcomed

    const commandResponse = await Promise.race([
      fetch(`${listening.url}/api/dev/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          command: {
            type: 'capture-page',
          },
        }),
      }),
      new Promise<never>((_, rejectPromise) => {
        setTimeout(() => {
          rejectPromise(new Error('Timed out waiting for command rejection.'))
        }, 1_000)
      }),
    ])

    expect(commandResponse.status).toBe(500)
    expect(await commandResponse.json()).toMatchObject({
      ok: false,
      error: `Dev client '${clientId}' disconnected before command completed.`,
    })
    expect(logger.warn).toHaveBeenCalledWith(
      '[scraping-server] rejected pending dev commands for disconnected client',
      {
        clientId,
        rejectedCommandCount: 1,
      }
    )
  })

  it('closes promptly when a devtools WebSocket client is still connected', async () => {
    const resource = await createServerForTest()
    const { server, listening } = resource
    const client = new WebSocket(
      `${listening.url.replace('http://', 'ws://')}/ws/dev`
    )

    await new Promise<void>((resolvePromise) => {
      client.on('message', (buffer) => {
        const message = JSON.parse(buffer.toString()) as { type?: string }
        if (message.type === 'welcome') {
          expect(message).toMatchObject({
            protocolVersion: '1',
          })
          resolvePromise()
        }
      })
      client.once('open', () => {
        client.send(
          JSON.stringify({
            type: 'hello',
            protocolVersion: '1',
            extensionName: 'Scraping Devtools',
            extensionVersion: '0.0.0',
          })
        )
      })
    })

    const idx = servers.indexOf(resource)
    if (idx !== -1) {
      servers.splice(idx, 1)
    }

    try {
      await expect(
        Promise.race([
          server.close(),
          new Promise<never>((_, rejectPromise) => {
            setTimeout(() => {
              rejectPromise(
                new Error('server.close() timed out with connected client')
              )
            }, 1_000)
          }),
        ])
      ).resolves.toBeUndefined()
    } finally {
      await rm(resource.tempDir, { recursive: true, force: true })
    }
  })

  it('rejects devtools clients with a missing protocol version', async () => {
    const logger = createLoggerSpy()
    const { listening } = await createServerForTest(logger)
    const client = new WebSocket(
      `${listening.url.replace('http://', 'ws://')}/ws/dev`
    )

    const protocolError = new Promise<{
      readonly type?: string
      readonly code?: string
      readonly expectedProtocolVersion?: string
      readonly receivedProtocolVersion?: string
    }>((resolvePromise) => {
      client.on('message', (buffer) => {
        resolvePromise(
          JSON.parse(buffer.toString()) as {
            readonly type?: string
            readonly code?: string
            readonly expectedProtocolVersion?: string
            readonly receivedProtocolVersion?: string
          }
        )
      })
    })

    const closed = new Promise<{ readonly code: number }>((resolvePromise) => {
      client.on('close', (code) => {
        resolvePromise({ code })
      })
    })

    await new Promise<void>((resolvePromise) => {
      client.once('open', () => {
        client.send(
          JSON.stringify({
            type: 'hello',
            extensionName: 'Old Devtools',
            extensionVersion: '0.0.0',
          })
        )
        resolvePromise()
      })
    })

    await expect(protocolError).resolves.toMatchObject({
      type: 'protocol-error',
      code: 'protocol-version-mismatch',
      expectedProtocolVersion: '1',
    })
    await expect(closed).resolves.toMatchObject({
      code: 1002,
    })
    expect(logger.warn).toHaveBeenCalledWith(
      '[scraping-server] rejected devtools client protocol',
      expect.objectContaining({
        expectedProtocolVersion: '1',
        receivedProtocolVersion: undefined,
      })
    )
  })

  it('closes the store when WebSocket shutdown fails', async () => {
    const closeError = new Error('WebSocket server close failed.')
    const originalClose = WebSocketServer.prototype.close
    const webSocketCloseSpy = vi
      .spyOn(WebSocketServer.prototype, 'close')
      .mockImplementation(function closeWithError(
        this: WebSocketServer,
        callback?: (error?: Error) => void
      ) {
        originalClose.call(this, () => {
          callback?.(closeError)
        })
      })
    const storeCloseSpy = vi.spyOn(PrismaScrapedDataStore.prototype, 'close')
    const resource = await createServerForTest()

    const idx = servers.indexOf(resource)
    if (idx !== -1) {
      servers.splice(idx, 1)
    }

    try {
      await expect(resource.server.close()).rejects.toThrow(closeError)
      expect(storeCloseSpy).toHaveBeenCalledTimes(1)
    } finally {
      webSocketCloseSpy.mockRestore()
      storeCloseSpy.mockRestore()
      await rm(resource.tempDir, { recursive: true, force: true })
    }
  })

  it('returns 400 for invalid JSON bodies without crashing the server', async () => {
    const { listening } = await createServerForTest()
    const response = await fetch(`${listening.url}/api/snapshots/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{"providerManifest":',
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

  it('returns 400 when providerManifest.id and snapshot.provider do not match', async () => {
    const { listening } = await createServerForTest()
    const snapshot: ProviderSnapshot = {
      provider: 'openai',
      capturedAt: new Date().toISOString(),
      source: 'dom',
      confidence: 'medium',
      rawVersion: 'test',
      metrics: [],
    }

    const response = await fetch(`${listening.url}/api/snapshots/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        providerManifest: {
          ...openAiProviderManifest,
          id: 'anthropic',
        },
        snapshot,
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'providerManifest.id must match snapshot.provider.',
    })
  })

  it('returns 400 when providerManifest is missing or malformed', async () => {
    const { listening } = await createServerForTest()
    const response = await fetch(`${listening.url}/api/snapshots/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        snapshot: {
          provider: 'openai',
        },
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    )
  })

  it('returns 400 when providerManifest shape is incomplete', async () => {
    const { listening } = await createServerForTest()
    const response = await fetch(`${listening.url}/api/snapshots/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        providerManifest: {
          id: 'openai',
          displayName: 'OpenAI',
          matches: ['https://chatgpt.com/*'],
          capabilities: ['usage'],
          debugSelectors: ['.not-a-probe'],
        },
        snapshot: {
          provider: 'openai',
        },
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    )
  })

  it('returns 400 when /api/dev/commands receives an invalid command shape', async () => {
    const { listening } = await createServerForTest()
    const response = await fetch(`${listening.url}/api/dev/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        command: {
          type: 'fetch-json',
          url: 42,
        },
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    )
  })

  it('returns 400 when snapshot history query is malformed', async () => {
    const { listening } = await createServerForTest()
    const response = await fetch(
      `${listening.url}/api/snapshots/history?limit=0`
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    )
  })

  it('returns 400 when snapshot latest query is malformed', async () => {
    const { listening } = await createServerForTest()
    const response = await fetch(
      `${listening.url}/api/snapshots/latest?source=extension`
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    )
  })

  it('lists the union of manifest-backed and legacy snapshot-only providers', async () => {
    const { listening } = await createServerForTest()
    const fallbackTempDir = await mkdtemp(
      path.join(os.tmpdir(), 'scraping-server-')
    )
    const fallbackLogger = createLoggerSpy()
    const fallbackStoreServer = createScrapingServer({
      host: '127.0.0.1',
      port: 0,
      storeFile: path.join(fallbackTempDir, 'fallback.sqlite'),
      logger: fallbackLogger,
    })

    servers.push({
      tempDir: fallbackTempDir,
      server: fallbackStoreServer,
      listening: await fallbackStoreServer.listen(),
    })

    const fallbackStoreFile = path.join(fallbackTempDir, 'fallback.sqlite')
    const prisma = new (await import('@prisma/client')).PrismaClient({
      datasources: {
        db: {
          url: `file:${fallbackStoreFile}`,
        },
      },
    })

    await prisma.deterministicSnapshotRecord.create({
      data: {
        provider: 'openai',
        snapshotJson: JSON.stringify({
          provider: 'openai',
          capturedAt: new Date().toISOString(),
          source: 'dom',
          confidence: 'medium',
          rawVersion: 'legacy',
          metrics: [],
        }),
      },
    })
    await prisma.providerManifestRecord.create({
      data: {
        provider: 'github-copilot',
        manifestJson: JSON.stringify({
          id: 'github-copilot',
          displayName: 'GitHub Copilot',
          matches: ['https://github.com/settings/copilot/*'],
          capabilities: ['usage'],
          debugSelectors: [],
        }),
      },
    })
    await prisma.$disconnect()

    const statusResponse = await fetch(
      `${servers.at(-1)?.listening.url ?? listening.url}/api/status`
    )

    expect(await statusResponse.json()).toMatchObject({
      snapshotProviders: ['github-copilot', 'openai'],
    })
  })
})

describe('Host header validation', () => {
  it('rejects HTTP requests with a mismatched Host header with 421', async () => {
    const { listening } = await createServerForTest()
    const url = new URL(listening.url)

    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: url.hostname,
          port: Number(url.port),
          path: '/health',
          method: 'GET',
          headers: { Host: 'attacker.example.com:1234' },
        },
        (res) => {
          resolve(res.statusCode ?? 0)
        }
      )
      req.on('error', reject)
      req.end()
    })

    expect(statusCode).toBe(421)
  })

  it('rejects WebSocket upgrades with a mismatched Host header', async () => {
    const { listening } = await createServerForTest()

    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://${listening.host}:${listening.port}/ws/dev`,
          { headers: { Host: 'attacker.example.com:1234' } }
        )
        ws.on('open', resolve)
        ws.on('error', reject)
        ws.on('unexpected-response', (_req, res) => {
          reject(new Error(`Unexpected response: ${String(res.statusCode)}`))
        })
      })
    ).rejects.toThrow()
  })

  it('rejects WebSocket upgrades with a cross-site Origin header', async () => {
    const { listening } = await createServerForTest()

    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://${listening.host}:${listening.port}/ws/dev`,
          { headers: { Origin: 'http://evil.example.com' } }
        )
        ws.on('open', resolve)
        ws.on('error', reject)
        ws.on('unexpected-response', (_req, res) => {
          reject(new Error(`Unexpected response: ${String(res.statusCode)}`))
        })
      })
    ).rejects.toThrow()
  })

  it('accepts WebSocket upgrades with a chrome-extension:// Origin header', async () => {
    const { listening } = await createServerForTest()

    const ws = new WebSocket(
      `ws://${listening.host}:${listening.port}/ws/dev`,
      {
        headers: {
          Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        },
      }
    )

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    ws.close()
  })
})
