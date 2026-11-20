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
  DEVTOOLS_PROTOCOL_VERSION,
  type DeterministicHistoryQuery,
  type DeterministicIngestRequest,
  type DeterministicLatestQuery,
  type DeterministicSnapshotRecord,
  type DevClientInfo,
  type DevCommandEnvelope,
  type DevCommandRequest,
  type DevCommandResult,
  type DevtoolsHelloMessage,
  type ProviderDescription,
  type RegisteredProviderInfo,
  type RiskLevel,
  type ScrapingServerStatus,
} from './protocol'
import {
  parseDeterministicHistoryQuery,
  parseDeterministicIngestRequest,
  parseDeterministicLatestQuery,
  parseDevCommandRequest,
  parseDevtoolsInboundMessage,
} from './validation'

export * from './mcp'
export * from './protocol'

type ScrapingServerLogger = Pick<Console, 'info' | 'warn' | 'error'>

type DevClientConnection = DevClientInfo & {
  readonly socket: WebSocket
}

type PendingCommand = {
  readonly clientId: string
  readonly resolve: (value: DevCommandResult) => void
  readonly reject: (error: Error) => void
  readonly timeoutId: ReturnType<typeof setTimeout>
}

const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10 MB
const DEVTOOLS_PROTOCOL_CLOSE_CODE = 1002

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

function getLogError(error: unknown, fallback: string): Error | string {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return error === null || error === undefined ? fallback : String(error)
}

function getUnknownErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return error === null || error === undefined ? fallback : String(error)
}

function serializeCommandError(
  error: unknown,
  fallback: string
): Pick<DevCommandResult, 'error' | 'errorName' | 'errorStack'> {
  if (error instanceof Error) {
    return {
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
    }
  }

  return {
    error: getUnknownErrorMessage(error, fallback),
  }
}

class InvalidJsonBodyError extends Error {
  constructor() {
    super('Request body must be valid JSON.')
    this.name = 'InvalidJsonBodyError'
  }
}

class BodyTooLargeError extends Error {
  constructor() {
    super(`Request body exceeds the ${MAX_BODY_BYTES}-byte limit.`)
    this.name = 'BodyTooLargeError'
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

class InvalidContentTypeError extends Error {
  constructor() {
    super('Request body must use Content-Type: application/json.')
    this.name = 'InvalidContentTypeError'
  }
}

class InvalidOriginError extends Error {
  constructor() {
    super('Cross-origin browser requests are not allowed for this endpoint.')
    this.name = 'InvalidOriginError'
  }
}

class InvalidDeterministicHistoryQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDeterministicHistoryQueryError'
  }
}

class InvalidDeterministicLatestQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDeterministicLatestQueryError'
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

  private toSnapshotRecord(record: {
    readonly snapshotJson: string
    readonly receivedAt: Date
  }): DeterministicSnapshotRecord {
    return {
      snapshot: JSON.parse(record.snapshotJson) as ProviderSnapshot,
      receivedAt: record.receivedAt.toISOString(),
    }
  }

  private matchesLatestQuery(
    snapshot: ProviderSnapshot,
    query: DeterministicLatestQuery
  ): boolean {
    return (
      (query.provider === undefined || snapshot.provider === query.provider) &&
      (query.source === undefined || snapshot.source === query.source) &&
      (query.rawVersion === undefined ||
        snapshot.rawVersion === query.rawVersion) &&
      (query.accountLabel === undefined ||
        snapshot.accountLabel === query.accountLabel)
    )
  }

  async getLatest(
    query: DeterministicLatestQuery
  ): Promise<DeterministicSnapshotRecord | null> {
    const records = await this.prisma.deterministicSnapshotRecord.findMany({
      where: {
        provider: query.provider,
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

    for (const record of records) {
      const snapshotRecord = this.toSnapshotRecord(record)

      if (this.matchesLatestQuery(snapshotRecord.snapshot, query)) {
        return snapshotRecord
      }
    }

    return null
  }

  async getLatestAll(
    query: DeterministicLatestQuery = {}
  ): Promise<Record<ProviderId, ProviderSnapshot>> {
    const records = await this.prisma.deterministicSnapshotRecord.findMany({
      where: {
        provider: query.provider,
      },
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
      if (latest.has(record.provider)) {
        continue
      }

      const snapshot = JSON.parse(record.snapshotJson) as ProviderSnapshot

      if (this.matchesLatestQuery(snapshot, query)) {
        latest.set(record.provider, snapshot)
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

    return records.map((record) => this.toSnapshotRecord(record))
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

function validateDeterministicLatestQuery(
  query: Record<string, string | undefined>
): DeterministicLatestQuery {
  try {
    return parseDeterministicLatestQuery(query)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InvalidDeterministicLatestQueryError(
        error.issues.at(0)?.message ?? 'Latest query is invalid.'
      )
    }

    throw error
  }
}

function parseDevtoolsMessage(buffer: RawData, logger: ScrapingServerLogger) {
  let rawMessage: unknown

  try {
    rawMessage = JSON.parse(buffer.toString())
  } catch (e) {
    logger.warn('[scraping-server] ignored malformed devtools message', {
      reason: 'json-parse-error',
      error: getLogError(e, 'Failed to parse devtools message.'),
    })
    return null
  }

  try {
    return parseDevtoolsInboundMessage(rawMessage)
  } catch (e) {
    logger.warn('[scraping-server] ignored malformed devtools message', {
      reason: 'schema-validation-error',
      error: getLogError(e, 'Failed to validate devtools message.'),
    })
    return null
  }
}

function isCompatibleDevtoolsProtocol(
  message: DevtoolsHelloMessage
): message is DevtoolsHelloMessage & { readonly protocolVersion: string } {
  return message.protocolVersion === DEVTOOLS_PROTOCOL_VERSION
}

function sendProtocolMismatchAndClose(
  socket: WebSocket,
  receivedProtocolVersion: string | undefined
): void {
  socket.send(
    JSON.stringify({
      type: 'protocol-error',
      code: 'protocol-version-mismatch',
      expectedProtocolVersion: DEVTOOLS_PROTOCOL_VERSION,
      receivedProtocolVersion,
      message: `Expected devtools protocol version ${DEVTOOLS_PROTOCOL_VERSION}, received ${receivedProtocolVersion ?? 'none'}.`,
    })
  )
  socket.close(
    DEVTOOLS_PROTOCOL_CLOSE_CODE,
    'Unsupported devtools protocol version.'
  )
}

function hasJsonContentType(contentTypeHeader: string | undefined): boolean {
  if (!contentTypeHeader) {
    return false
  }

  const mediaType = contentTypeHeader.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json'
}

function requireJsonContentType(request: IncomingMessage): void {
  if (!hasJsonContentType(request.headers['content-type'])) {
    throw new InvalidContentTypeError()
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    totalBytes += buf.byteLength
    if (totalBytes > MAX_BODY_BYTES) {
      request.resume()
      throw new BodyTooLargeError()
    }
    chunks.push(buf)
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

type ScrapingRoute =
  | { type: 'health' }
  | { type: 'status' }
  | { type: 'providers' }
  | { type: 'provider'; providerId: ProviderId }
  | { type: 'latest'; query: DeterministicLatestQuery }
  | { type: 'history'; query: DeterministicHistoryQuery }
  | { type: 'ingest' }
  | { type: 'devClients' }
  | { type: 'devCommands' }
  | { type: 'notFound'; method: string; pathname: string }

type ScrapingRequestContext = {
  readonly store: PrismaScrapedDataStore
  readonly devClients: Map<string, DevClientConnection>
  readonly pendingCommands: Map<string, PendingCommand>
  readonly logger: ScrapingServerLogger
  readonly requestId: string
  readonly host: string
  readonly port: number
}

function serializeDevClients(
  devClients: Map<string, DevClientConnection>
): readonly DevClientInfo[] {
  return [...devClients.values()].map(
    ({ socket: _socket, ...client }) => client
  )
}

function isLatestRoute(method: string, pathname: string): boolean {
  return method === 'GET' && pathname === '/api/snapshots/latest'
}

function isHistoryRoute(method: string, pathname: string): boolean {
  return method === 'GET' && pathname === '/api/snapshots/history'
}

function isIngestRoute(method: string, pathname: string): boolean {
  return method === 'POST' && pathname === '/api/snapshots/ingest'
}

function resolveLatestRouteQuery(url: URL): DeterministicLatestQuery {
  return validateDeterministicLatestQuery({
    provider: url.searchParams.get('provider') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    rawVersion: url.searchParams.get('rawVersion') ?? undefined,
    accountLabel: url.searchParams.get('accountLabel') ?? undefined,
  })
}

function resolveHistoryRouteQuery(url: URL): DeterministicHistoryQuery {
  return validateDeterministicHistoryQuery({
    provider: url.searchParams.get('provider') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  })
}

function resolveScrapingRoute(method: string, url: URL): ScrapingRoute {
  if (method === 'GET' && url.pathname === '/health') {
    return { type: 'health' }
  }
  if (method === 'GET' && url.pathname === '/api/status') {
    return { type: 'status' }
  }
  if (method === 'GET' && url.pathname === '/api/providers') {
    return { type: 'providers' }
  }
  if (
    method === 'GET' &&
    url.pathname.startsWith('/api/providers/') &&
    url.pathname.length > '/api/providers/'.length
  ) {
    return {
      type: 'provider',
      providerId: decodeURIComponent(
        url.pathname.slice('/api/providers/'.length)
      ) as ProviderId,
    }
  }
  if (isLatestRoute(method, url.pathname)) {
    return {
      type: 'latest',
      query: resolveLatestRouteQuery(url),
    }
  }
  if (isHistoryRoute(method, url.pathname)) {
    return {
      type: 'history',
      query: resolveHistoryRouteQuery(url),
    }
  }
  if (isIngestRoute(method, url.pathname)) {
    return { type: 'ingest' }
  }
  if (method === 'GET' && url.pathname === '/api/dev/clients') {
    return { type: 'devClients' }
  }
  if (method === 'POST' && url.pathname === '/api/dev/commands') {
    return { type: 'devCommands' }
  }

  return {
    type: 'notFound',
    method,
    pathname: url.pathname,
  }
}

type DevCommandTargetResolution =
  | { readonly found: true; readonly client: DevClientConnection }
  | {
      readonly found: false
      readonly reason: 'client-not-connected'
      readonly clientId: string
    }
  | { readonly found: false; readonly reason: 'no-clients' }

/**
 * Resolves the devtools client to receive a command.
 *
 * When `targetClientId` is provided, returns that specific client or a
 * `client-not-connected` failure. When omitted, falls back to the first connected
 * client by insertion order — callers that need deterministic targeting should
 * provide `targetClientId` explicitly, discoverable via the `list_clients` endpoint.
 * Returns `no-clients` when no clients are connected and no target was specified.
 */
function resolveDevCommandTarget(
  targetClientId: string | undefined,
  devClients: Map<string, DevClientConnection>
): DevCommandTargetResolution {
  if (targetClientId !== undefined) {
    const client = devClients.get(targetClientId)
    if (client !== undefined) {
      return { found: true, client }
    }
    return {
      found: false,
      reason: 'client-not-connected',
      clientId: targetClientId,
    }
  }
  const client = devClients.values().next().value as
    | DevClientConnection
    | undefined
  if (client !== undefined) {
    return { found: true, client }
  }
  return { found: false, reason: 'no-clients' }
}

async function executeDevCommand(
  target: DevClientConnection,
  command: DevCommandRequest['command'],
  pendingCommands: Map<string, PendingCommand>
): Promise<DevCommandResult> {
  const commandId = randomUUID()
  const envelope: DevCommandEnvelope = {
    commandId,
    command,
  }

  return new Promise<DevCommandResult>((resolveResult, rejectResult) => {
    const timeoutId = setTimeout(() => {
      pendingCommands.delete(commandId)
      rejectResult(new Error('Timed out waiting for dev command result.'))
    }, 10_000)

    pendingCommands.set(commandId, {
      clientId: target.clientId,
      resolve: resolveResult,
      reject: rejectResult,
      timeoutId,
    })

    try {
      target.socket.send(
        JSON.stringify({
          type: 'run-command',
          ...envelope,
        })
      )
    } catch (error) {
      clearTimeout(timeoutId)
      pendingCommands.delete(commandId)
      rejectResult(error)
    }
  }).catch((error) => ({
    commandId,
    ok: false,
    ...serializeCommandError(error, 'unknown error'),
  }))
}

function rejectPendingCommandsForClient(
  clientId: string,
  pendingCommands: Map<string, PendingCommand>
): number {
  let rejectedCount = 0

  for (const [commandId, pending] of pendingCommands.entries()) {
    if (pending.clientId !== clientId) {
      continue
    }

    clearTimeout(pending.timeoutId)
    pendingCommands.delete(commandId)
    pending.reject(
      new Error(
        `Dev client '${clientId}' disconnected before command completed.`
      )
    )
    rejectedCount += 1
  }

  return rejectedCount
}

function isClientRequestError(error: unknown): boolean {
  return (
    error instanceof InvalidJsonBodyError ||
    error instanceof BodyTooLargeError ||
    error instanceof InvalidDeterministicIngestError ||
    error instanceof InvalidDevCommandRequestError ||
    error instanceof InvalidContentTypeError ||
    error instanceof InvalidOriginError ||
    error instanceof InvalidDeterministicHistoryQueryError ||
    error instanceof InvalidDeterministicLatestQueryError ||
    error instanceof URIError
  )
}

function getClientRequestStatusCode(error: unknown): number {
  if (error instanceof InvalidOriginError) {
    return 403
  }

  if (error instanceof InvalidContentTypeError) {
    return 415
  }

  return 400
}

async function handleScrapingRoute(
  route: ScrapingRoute,
  request: IncomingMessage,
  response: ServerResponse,
  context: ScrapingRequestContext
): Promise<void> {
  switch (route.type) {
    case 'health':
      writeJson(response, 200, { ok: true })
      return
    case 'status':
      writeJson(
        response,
        200,
        createStatus(await context.store.listProviderIds(), context.devClients)
      )
      return
    case 'providers':
      writeJson(
        response,
        200,
        (await context.store.listProviderManifests()).map(
          toRegisteredProviderInfo
        )
      )
      return
    case 'provider': {
      const provider = await context.store.getProviderManifest(route.providerId)
      if (!provider) {
        writeJson(response, 404, {
          error: `Unknown provider: ${route.providerId}`,
        })
        return
      }

      writeJson(response, 200, toProviderDescription(provider))
      return
    }
    case 'latest':
      if (route.query.provider !== undefined) {
        writeJson(
          response,
          200,
          (await context.store.getLatest(route.query))?.snapshot ?? null
        )
        return
      }

      writeJson(response, 200, await context.store.getLatestAll(route.query))
      return
    case 'history':
      writeJson(response, 200, await context.store.getHistory(route.query))
      return
    case 'ingest': {
      const body = validateDeterministicIngest(
        await readJsonBody<DeterministicIngestRequest>(request)
      )
      const record = await context.store.submitDeterministicSnapshot(
        body.providerManifest,
        body.snapshot
      )
      context.logger.info('[scraping-server] snapshot ingested', {
        requestId: context.requestId,
        provider: body.snapshot.provider,
        rawVersion: body.snapshot.rawVersion,
        metricCount: body.snapshot.metrics.length,
        source: body.snapshot.source,
      })
      writeJson(response, 201, record)
      return
    }
    case 'devClients':
      writeJson(response, 200, serializeDevClients(context.devClients))
      return
    case 'devCommands': {
      if (!isValidOrigin(request.headers.origin, context.host, context.port)) {
        throw new InvalidOriginError()
      }
      requireJsonContentType(request)

      const body = validateDevCommandRequest(
        await readJsonBody<DevCommandRequest>(request)
      )
      const resolution = resolveDevCommandTarget(
        body.targetClientId,
        context.devClients
      )

      if (!resolution.found) {
        if (resolution.reason === 'client-not-connected') {
          writeJson(response, 404, {
            error: `Dev client '${resolution.clientId}' is not connected.`,
          })
        } else {
          writeJson(response, 409, {
            error: 'No devtool websocket clients are connected.',
          })
        }
        return
      }

      context.logger.info('[scraping-server] dev command dispatched', {
        requestId: context.requestId,
        type: body.command.type,
        targetClientId: resolution.client.clientId,
      })

      const result = await executeDevCommand(
        resolution.client,
        body.command,
        context.pendingCommands
      )

      context.logger.info('[scraping-server] dev command completed', {
        requestId: context.requestId,
        commandId: result.commandId,
        ok: result.ok,
        error: result.error,
      })

      writeJson(response, result.ok ? 200 : 500, result)
      return
    }
    case 'notFound':
      writeJson(response, 404, {
        error: `No route for ${route.method} ${route.pathname}`,
      })
      return
  }
}

function isValidHost(
  hostHeader: string | undefined,
  host: string,
  port: number
): boolean {
  if (!hostHeader) return false
  if (hostHeader === `${host}:${port}`) return true
  if (host === '127.0.0.1' && hostHeader === `localhost:${port}`) return true
  return false
}

function isValidOrigin(
  originHeader: string | undefined,
  host: string,
  port: number
): boolean {
  // Non-browser clients (ws CLI, Node.js) omit Origin — allow
  if (!originHeader) return true
  // Browser extensions use chrome-extension:// origins — allow
  if (originHeader.startsWith('chrome-extension://')) return true
  // Localhost origins are acceptable for local dev tooling
  if (originHeader === `http://${host}:${port}`) return true
  if (host === '127.0.0.1' && originHeader === `http://localhost:${port}`)
    return true
  return false
}

export function createScrapingServer(options: {
  readonly host?: string
  readonly port?: number
  readonly storeFile: string
  readonly logger?: ScrapingServerLogger
}) {
  const host = options.host ?? DEFAULT_SERVER_HOST
  const port = options.port ?? DEFAULT_SERVER_PORT
  let actualPort = port
  const store = new PrismaScrapedDataStore(resolve(options.storeFile))
  const devClients = new Map<string, DevClientConnection>()
  const pendingCommands = new Map<string, PendingCommand>()
  const logger = createLogger(options.logger)

  const httpServer = createServer(async (request, response) => {
    if (!isValidHost(request.headers.host, host, actualPort)) {
      writeJson(response, 421, { error: 'Misdirected Request' })
      return
    }

    const startedAt = Date.now()
    const requestId = randomUUID()
    const method = request.method ?? 'GET'
    let pathname = '/'

    try {
      const url = new URL(request.url ?? '/', `http://${host}:${actualPort}`)
      pathname = url.pathname
      await handleScrapingRoute(
        resolveScrapingRoute(method, url),
        request,
        response,
        {
          store,
          devClients,
          pendingCommands,
          logger,
          requestId,
          host,
          port: actualPort,
        }
      )
    } catch (error) {
      writeJson(
        response,
        isClientRequestError(error) ? getClientRequestStatusCode(error) : 500,
        {
          error: getErrorMessage(error, 'Internal server error.'),
        }
      )
      logger.error('[scraping-server] request failed', {
        requestId,
        method,
        pathname,
        statusCode: response.statusCode,
        error: getLogError(error, 'Internal server error.'),
      })
      return
    } finally {
      logger.info('[scraping-server] request completed', {
        requestId,
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
      const message = parseDevtoolsMessage(buffer, logger)

      if (!message) {
        return
      }

      if (message.type === 'heartbeat') {
        return
      }

      if (message.type === 'hello') {
        if (!isCompatibleDevtoolsProtocol(message)) {
          logger.warn('[scraping-server] rejected devtools client protocol', {
            expectedProtocolVersion: DEVTOOLS_PROTOCOL_VERSION,
            receivedProtocolVersion: message.protocolVersion,
            extensionName: message.extensionName,
            extensionVersion: message.extensionVersion,
          })
          sendProtocolMismatchAndClose(socket, message.protocolVersion)
          return
        }

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
            protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
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
        const rejectedCommandCount = rejectPendingCommandsForClient(
          clientId,
          pendingCommands
        )
        logger.info('[scraping-server] devtools client disconnected', {
          clientId,
        })
        if (rejectedCommandCount > 0) {
          logger.warn(
            '[scraping-server] rejected pending dev commands for disconnected client',
            {
              clientId,
              rejectedCommandCount,
            }
          )
        }
      }
    })
  })

  httpServer.on('upgrade', (request, socket, head) => {
    if (!isValidHost(request.headers.host, host, actualPort)) {
      socket.destroy()
      return
    }

    if (!isValidOrigin(request.headers.origin, host, actualPort)) {
      socket.destroy()
      return
    }

    const url = new URL(request.url ?? '/', `http://${host}:${actualPort}`)

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

      actualPort = address.port

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
      for (const client of devClients.values()) {
        client.socket.terminate()
      }

      try {
        await new Promise<void>((resolvePromise, rejectPromise) => {
          httpServer.close((error) => {
            if (error) {
              rejectPromise(error)
              return
            }

            resolvePromise()
          })
        })

        await new Promise<void>((resolvePromise, rejectPromise) => {
          webSocketServer.close((error) => {
            if (error) {
              rejectPromise(error)
              return
            }

            resolvePromise()
          })
        })
      } finally {
        await store.close()
      }
    },
  }
}
