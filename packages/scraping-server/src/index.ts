import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { dirname, resolve } from 'node:path'
import type {
  ProviderId,
  ProviderManifest,
  ProviderSnapshot,
} from '@kitsuyui/browser-extensions-scraping-platform'
import { PrismaClient } from '@prisma/client'
import { type RawData, type WebSocket, WebSocketServer } from 'ws'
import { ZodError } from 'zod'
import {
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  type DeterministicHistoryQuery,
  type DeterministicIngestRequest,
  type DeterministicSnapshotRecord,
  type DevClientInfo,
  type DevCommandEnvelope,
  type DevCommandRequest,
  type DevCommandResult,
  type ProviderDescription,
  type RegisteredProviderInfo,
  type RiskLevel,
  type ScrapingServerStatus,
} from './protocol'
import {
  parseDeterministicHistoryQuery,
  parseDeterministicIngestRequest,
  parseDevCommandRequest,
  parseDevtoolsInboundMessage,
} from './validation'

export * from './protocol'

type ScrapingServerLogger = Pick<Console, 'info' | 'warn' | 'error'>

type DevClientConnection = DevClientInfo & {
  readonly socket: WebSocket
}

type PendingCommand = {
  readonly resolve: (value: DevCommandResult) => void
  readonly reject: (error: Error) => void
  readonly timeoutId: ReturnType<typeof setTimeout>
}

class InvalidJsonBodyError extends Error {
  constructor() {
    super('Request body must be valid JSON.')
    this.name = 'InvalidJsonBodyError'
  }
}

class InvalidDeterministicIngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDeterministicIngestError'
  }
}

class InvalidDevCommandRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDevCommandRequestError'
  }
}

class InvalidDeterministicHistoryQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDeterministicHistoryQueryError'
  }
}

export class PrismaScrapedDataStore {
  private readonly prisma: PrismaClient

  constructor(private readonly databaseFile: string) {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${this.databaseFile}`,
        },
      },
    })
  }

  async load(): Promise<void> {
    await mkdir(dirname(this.databaseFile), { recursive: true })
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeterministicSnapshotRecord" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "provider" TEXT NOT NULL,
        "snapshotJson" TEXT NOT NULL,
        "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DeterministicSnapshotRecord_provider_receivedAt_idx"
      ON "DeterministicSnapshotRecord" ("provider", "receivedAt")
    `)
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProviderManifestRecord" (
        "provider" TEXT NOT NULL PRIMARY KEY,
        "manifestJson" TEXT NOT NULL,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  async submitDeterministicSnapshot(
    providerManifest: ProviderManifest,
    snapshot: ProviderSnapshot
  ): Promise<DeterministicSnapshotRecord> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.providerManifestRecord.upsert({
        where: {
          provider: providerManifest.id,
        },
        update: {
          manifestJson: JSON.stringify(providerManifest),
        },
        create: {
          provider: providerManifest.id,
          manifestJson: JSON.stringify(providerManifest),
        },
      })

      return tx.deterministicSnapshotRecord.create({
        data: {
          provider: snapshot.provider,
          snapshotJson: JSON.stringify(snapshot),
        },
      })
    })

    return {
      snapshot,
      receivedAt: record.receivedAt.toISOString(),
    }
  }

  async getLatest(
    provider: ProviderId
  ): Promise<DeterministicSnapshotRecord | null> {
    const record = await this.prisma.deterministicSnapshotRecord.findFirst({
      where: {
        provider,
      },
      orderBy: [
        {
          receivedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
    })

    if (!record) {
      return null
    }

    return {
      snapshot: JSON.parse(record.snapshotJson) as ProviderSnapshot,
      receivedAt: record.receivedAt.toISOString(),
    }
  }

  async getLatestAll(): Promise<Record<ProviderId, ProviderSnapshot>> {
    const records = await this.prisma.deterministicSnapshotRecord.findMany({
      orderBy: [
        {
          provider: 'asc',
        },
        {
          receivedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
    })

    const latest = new Map<ProviderId, ProviderSnapshot>()

    for (const record of records) {
      if (!latest.has(record.provider)) {
        latest.set(
          record.provider,
          JSON.parse(record.snapshotJson) as ProviderSnapshot
        )
      }
    }

    return Object.fromEntries(latest.entries())
  }

  async getHistory(
    query: DeterministicHistoryQuery
  ): Promise<readonly DeterministicSnapshotRecord[]> {
    const records = await this.prisma.deterministicSnapshotRecord.findMany({
      where: {
        provider: query.provider,
        receivedAt:
          query.from || query.to
            ? {
                gte: query.from ? new Date(query.from) : undefined,
                lte: query.to ? new Date(query.to) : undefined,
              }
            : undefined,
      },
      orderBy: [
        {
          receivedAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      take: query.limit,
    })

    return records.map((record) => ({
      snapshot: JSON.parse(record.snapshotJson) as ProviderSnapshot,
      receivedAt: record.receivedAt.toISOString(),
    }))
  }

  async listProviderIds(): Promise<readonly ProviderId[]> {
    const manifestRows = await this.prisma.providerManifestRecord.findMany({
      select: {
        provider: true,
      },
      orderBy: {
        provider: 'asc',
      },
    })

    const manifestProviders = manifestRows.map(
      (row: { provider: ProviderId }) => row.provider
    )
    const snapshotRows = await this.prisma.deterministicSnapshotRecord.findMany(
      {
        distinct: ['provider'],
        select: {
          provider: true,
        },
        orderBy: {
          provider: 'asc',
        },
      }
    )

    const snapshotProviders = snapshotRows.map(
      (row: { provider: ProviderId }) => row.provider
    )

    return [...new Set([...manifestProviders, ...snapshotProviders])].sort()
  }

  async listProviderManifests(): Promise<readonly ProviderManifest[]> {
    const rows = await this.prisma.providerManifestRecord.findMany({
      orderBy: {
        provider: 'asc',
      },
    })

    return rows.map((row) => JSON.parse(row.manifestJson) as ProviderManifest)
  }

  async getProviderManifest(
    provider: ProviderId
  ): Promise<ProviderManifest | null> {
    const row = await this.prisma.providerManifestRecord.findUnique({
      where: {
        provider,
      },
    })

    return row ? (JSON.parse(row.manifestJson) as ProviderManifest) : null
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect()
  }
}

function createStatus(
  deterministicProviders: readonly ProviderId[],
  devClients: Map<string, DevClientConnection>
): ScrapingServerStatus {
  const warnings =
    devClients.size > 0
      ? [
          'One or more devtool websocket clients are connected. Remote browser control is enabled.',
        ]
      : []
  const riskLevel: RiskLevel = devClients.size > 0 ? 'elevated' : 'normal'

  return {
    serverTime: new Date().toISOString(),
    riskLevel,
    warnings,
    snapshotProviders: deterministicProviders,
    deterministicProviders,
    devClients: [...devClients.values()].map(
      ({ socket: _socket, ...client }) => client
    ),
  }
}

function toRegisteredProviderInfo(
  provider: ProviderManifest
): RegisteredProviderInfo {
  const { id, displayName, matches, capabilities } = provider

  return { id, displayName, matches, capabilities }
}

function toProviderDescription(
  provider: ProviderManifest
): ProviderDescription {
  const { id, displayName, matches, capabilities, snapshotSchema } = provider

  return { id, displayName, matches, capabilities, snapshotSchema }
}

function validateDeterministicIngest(
  body: unknown
): DeterministicIngestRequest {
  try {
    return parseDeterministicIngestRequest(body)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InvalidDeterministicIngestError(
        error.issues.at(0)?.message ?? 'Snapshot ingest request is invalid.'
      )
    }

    throw error
  }
}

function validateDevCommandRequest(body: unknown): DevCommandRequest {
  try {
    return parseDevCommandRequest(body)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InvalidDevCommandRequestError(
        error.issues.at(0)?.message ?? 'Dev command request is invalid.'
      )
    }

    throw error
  }
}

function validateDeterministicHistoryQuery(
  query: Record<string, string | undefined>
): DeterministicHistoryQuery {
  try {
    return parseDeterministicHistoryQuery(query)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InvalidDeterministicHistoryQueryError(
        error.issues.at(0)?.message ?? 'History query is invalid.'
      )
    }

    throw error
  }
}

function parseDevtoolsMessage(buffer: RawData) {
  let rawMessage: unknown

  try {
    rawMessage = JSON.parse(buffer.toString())
  } catch {
    return null
  }

  try {
    return parseDevtoolsInboundMessage(rawMessage)
  } catch {
    return null
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw new InvalidJsonBodyError()
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
  })
  response.end(JSON.stringify(body))
}

function createLogger(logger?: ScrapingServerLogger): ScrapingServerLogger {
  return logger ?? console
}

export function createScrapingServer(options: {
  readonly host?: string
  readonly port?: number
  readonly storeFile: string
  readonly logger?: ScrapingServerLogger
}) {
  const host = options.host ?? DEFAULT_SERVER_HOST
  const port = options.port ?? DEFAULT_SERVER_PORT
  const store = new PrismaScrapedDataStore(resolve(options.storeFile))
  const devClients = new Map<string, DevClientConnection>()
  const pendingCommands = new Map<string, PendingCommand>()
  const logger = createLogger(options.logger)

  const httpServer = createServer(async (request, response) => {
    const startedAt = Date.now()
    const method = request.method ?? 'GET'
    let pathname = '/'

    try {
      const url = new URL(request.url ?? '/', `http://${host}:${port}`)
      pathname = url.pathname

      if (method === 'GET' && url.pathname === '/health') {
        writeJson(response, 200, { ok: true })
        return
      }

      if (method === 'GET' && url.pathname === '/api/status') {
        writeJson(
          response,
          200,
          createStatus(await store.listProviderIds(), devClients)
        )
        return
      }

      if (method === 'GET' && url.pathname === '/api/providers') {
        writeJson(
          response,
          200,
          (await store.listProviderManifests()).map(toRegisteredProviderInfo)
        )
        return
      }

      if (
        method === 'GET' &&
        url.pathname.startsWith('/api/providers/') &&
        url.pathname.length > '/api/providers/'.length
      ) {
        const providerId = decodeURIComponent(
          url.pathname.slice('/api/providers/'.length)
        )
        const provider = await store.getProviderManifest(providerId)

        if (!provider) {
          writeJson(response, 404, {
            error: `Unknown provider: ${providerId}`,
          })
          return
        }

        writeJson(response, 200, toProviderDescription(provider))
        return
      }

      if (
        (method === 'GET' && url.pathname === '/api/deterministic/latest') ||
        url.pathname === '/api/snapshots/latest'
      ) {
        const provider = url.searchParams.get('provider')

        if (provider) {
          writeJson(
            response,
            200,
            (await store.getLatest(provider))?.snapshot ?? null
          )
          return
        }

        writeJson(response, 200, await store.getLatestAll())
        return
      }

      if (
        (method === 'GET' && url.pathname === '/api/deterministic/history') ||
        url.pathname === '/api/snapshots/history'
      ) {
        const query = validateDeterministicHistoryQuery({
          provider: url.searchParams.get('provider') ?? undefined,
          from: url.searchParams.get('from') ?? undefined,
          to: url.searchParams.get('to') ?? undefined,
          limit: url.searchParams.get('limit') ?? undefined,
        })

        writeJson(response, 200, await store.getHistory(query))
        return
      }

      if (
        (method === 'POST' && url.pathname === '/api/deterministic/ingest') ||
        url.pathname === '/api/snapshots/ingest'
      ) {
        const body = validateDeterministicIngest(
          await readJsonBody<DeterministicIngestRequest>(request)
        )
        const record = await store.submitDeterministicSnapshot(
          body.providerManifest,
          body.snapshot
        )
        logger.info('[scraping-server] snapshot ingested', {
          provider: body.snapshot.provider,
          rawVersion: body.snapshot.rawVersion,
          metricCount: body.snapshot.metrics.length,
          source: body.snapshot.source,
        })
        writeJson(response, 201, record)
        return
      }

      if (method === 'GET' && url.pathname === '/api/dev/clients') {
        writeJson(
          response,
          200,
          [...devClients.values()].map(
            ({ socket: _socket, ...client }) => client
          )
        )
        return
      }

      if (method === 'POST' && url.pathname === '/api/dev/commands') {
        const body = validateDevCommandRequest(
          await readJsonBody<DevCommandRequest>(request)
        )
        const target =
          (body.targetClientId ? devClients.get(body.targetClientId) : null) ??
          devClients.values().next().value

        if (!target) {
          writeJson(response, 409, {
            error: 'No devtool websocket clients are connected.',
          })
          return
        }

        const commandId = randomUUID()
        const envelope: DevCommandEnvelope = {
          commandId,
          command: body.command,
        }

        logger.info('[scraping-server] dev command dispatched', {
          commandId,
          type: body.command.type,
          targetClientId: target.clientId,
        })

        const result = await new Promise<DevCommandResult>(
          (resolveResult, rejectResult) => {
            const timeoutId = setTimeout(() => {
              pendingCommands.delete(commandId)
              rejectResult(
                new Error('Timed out waiting for dev command result.')
              )
            }, 10_000)

            pendingCommands.set(commandId, {
              resolve: resolveResult,
              reject: rejectResult,
              timeoutId,
            })

            target.socket.send(
              JSON.stringify({
                type: 'run-command',
                ...envelope,
              })
            )
          }
        ).catch((error) => ({
          commandId,
          ok: false,
          error: error instanceof Error ? error.message : 'unknown error',
        }))

        logger.info('[scraping-server] dev command completed', {
          commandId,
          ok: result.ok,
          error: result.error,
        })

        writeJson(response, result.ok ? 200 : 500, result)
        return
      }

      writeJson(response, 404, {
        error: `No route for ${request.method ?? 'GET'} ${url.pathname}`,
      })
    } catch (error) {
      writeJson(
        response,
        error instanceof InvalidJsonBodyError ||
          error instanceof InvalidDeterministicIngestError ||
          error instanceof InvalidDevCommandRequestError ||
          error instanceof InvalidDeterministicHistoryQueryError
          ? 400
          : 500,
        {
          error:
            error instanceof Error ? error.message : 'Internal server error.',
        }
      )
      logger.error('[scraping-server] request failed', {
        method,
        pathname,
        statusCode: response.statusCode,
        error:
          error instanceof Error ? error.message : 'Internal server error.',
      })
      return
    } finally {
      logger.info('[scraping-server] request completed', {
        method,
        pathname,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      })
    }
  })

  const webSocketServer = new WebSocketServer({
    noServer: true,
  })

  webSocketServer.on('connection', (socket) => {
    let clientId: string | null = null

    socket.on('message', (buffer: RawData) => {
      const message = parseDevtoolsMessage(buffer)

      if (!message) {
        logger.warn('[scraping-server] ignored malformed devtools message')
        return
      }

      if (message.type === 'heartbeat') {
        return
      }

      if (message.type === 'hello') {
        clientId = randomUUID()
        const client: DevClientConnection = {
          clientId,
          connectedAt: new Date().toISOString(),
          extensionName: message.extensionName,
          extensionVersion: message.extensionVersion,
          socket,
        }
        devClients.set(clientId, client)
        logger.info('[scraping-server] devtools client connected', {
          clientId,
          extensionName: message.extensionName,
          extensionVersion: message.extensionVersion,
        })
        socket.send(
          JSON.stringify({
            type: 'welcome',
            clientId,
            warning:
              'Remote browser control is active while this devtools connection remains open.',
          })
        )
        return
      }

      if (message.type === 'command-result') {
        const result = message as DevCommandResult
        const pending = pendingCommands.get(result.commandId)

        if (!pending) {
          logger.warn(
            '[scraping-server] dropped unexpected dev command result',
            {
              commandId: result.commandId,
            }
          )
          return
        }

        clearTimeout(pending.timeoutId)
        pendingCommands.delete(result.commandId)
        pending.resolve(result)
      }
    })

    socket.on('close', () => {
      if (clientId) {
        devClients.delete(clientId)
        logger.info('[scraping-server] devtools client disconnected', {
          clientId,
        })
      }
    })
  })

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`)

    if (url.pathname !== '/ws/dev') {
      socket.destroy()
      return
    }

    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit('connection', client, request)
    })
  })

  return {
    async listen() {
      await store.load()

      await new Promise<void>((resolvePromise, rejectPromise) => {
        httpServer.once('error', rejectPromise)
        httpServer.listen(port, host, () => {
          httpServer.off('error', rejectPromise)
          resolvePromise()
        })
      })

      const address = httpServer.address()

      if (!address || typeof address === 'string') {
        throw new Error('Expected an address object after listen().')
      }

      const listening = {
        host,
        port: address.port,
        url: `http://${host}:${address.port}`,
      }

      logger.info('[scraping-server] listening', {
        host: listening.host,
        port: listening.port,
        url: listening.url,
        storeFile: resolve(options.storeFile),
      })

      return listening
    },
    async close() {
      await store.close()
      await new Promise<void>((resolvePromise, rejectPromise) => {
        webSocketServer.close((error) => {
          if (error) {
            rejectPromise(error)
            return
          }

          resolvePromise()
        })
      })

      await new Promise<void>((resolvePromise, rejectPromise) => {
        httpServer.close((error) => {
          if (error) {
            rejectPromise(error)
            return
          }

          resolvePromise()
        })
      })
    },
  }
}
