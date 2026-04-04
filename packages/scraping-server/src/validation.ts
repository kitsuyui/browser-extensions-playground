import { z } from 'zod'

import type {
  DeterministicHistoryQuery,
  DeterministicIngestRequest,
  DevCommandRequest,
  DevCommandResult,
} from './protocol'

const metricUnitSchema = z.enum([
  'messages',
  'requests',
  'tokens',
  'credits',
  'percent',
  'unknown',
])

const snapshotMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  remaining: z.number().optional(),
  limit: z.number().optional(),
  unit: metricUnitSchema,
  resetsAt: z.string().optional(),
})

const providerSnapshotSchema = z.object({
  provider: z.string(),
  accountLabel: z.string().optional(),
  capturedAt: z.string(),
  source: z.enum(['dom', 'network', 'inference']),
  confidence: z.enum(['high', 'medium', 'low']),
  metrics: z.array(snapshotMetricSchema),
  rawVersion: z.string(),
})

const providerRawVersionDescriptionSchema = z.object({
  rawVersion: z.string(),
  source: z.enum(['dom', 'network', 'inference']),
  description: z.string(),
})

const providerMetricDescriptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: metricUnitSchema,
  description: z.string(),
})

const providerSnapshotSchemaDescription = z.object({
  description: z.string(),
  rawVersions: z.array(providerRawVersionDescriptionSchema),
  metrics: z.array(providerMetricDescriptionSchema),
})

const domProbeSchema = z.object({
  key: z.string(),
  label: z.string(),
  selector: z.string(),
})

const providerManifestSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  matches: z.array(z.string()),
  capabilities: z.array(z.enum(['usage'])),
  debugSelectors: z.array(domProbeSchema),
  snapshotSchema: providerSnapshotSchemaDescription.optional(),
})

const deterministicIngestRequestSchema = z
  .object({
    providerManifest: providerManifestSchema,
    snapshot: providerSnapshotSchema,
  })
  .refine(
    (value) => value.providerManifest.id === value.snapshot.provider,
    'providerManifest.id must match snapshot.provider.'
  )

const fetchJsonCommandSchema = z.object({
  type: z.literal('fetch-json'),
  url: z.string(),
  method: z.enum(['GET', 'POST']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
})

const devCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('capture-page'),
  }),
  z.object({
    type: z.literal('execute-script'),
    source: z.string(),
  }),
  fetchJsonCommandSchema,
])

const devCommandRequestSchema = z.object({
  targetClientId: z.string().optional(),
  command: devCommandSchema,
})

const devCommandResultSchema = z.object({
  commandId: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
})

const devtoolsHelloMessageSchema = z.object({
  type: z.literal('hello'),
  extensionName: z.string().optional(),
  extensionVersion: z.string().optional(),
})

const devtoolsHeartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
})

const devtoolsCommandResultMessageSchema = devCommandResultSchema.extend({
  type: z.literal('command-result'),
})

const devtoolsInboundMessageSchema = z.discriminatedUnion('type', [
  devtoolsHeartbeatMessageSchema,
  devtoolsHelloMessageSchema,
  devtoolsCommandResultMessageSchema,
])

const deterministicHistoryQuerySchema = z.object({
  provider: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(10_000).optional(),
})

export function parseDeterministicIngestRequest(
  body: unknown
): DeterministicIngestRequest {
  return deterministicIngestRequestSchema.parse(body)
}

export function parseDevCommandRequest(body: unknown): DevCommandRequest {
  return devCommandRequestSchema.parse(body)
}

export function parseDevtoolsInboundMessage(body: unknown):
  | {
      readonly type: 'heartbeat'
    }
  | {
      readonly type: 'hello'
      readonly extensionName?: string
      readonly extensionVersion?: string
    }
  | ({
      readonly type: 'command-result'
    } & DevCommandResult) {
  return devtoolsInboundMessageSchema.parse(body)
}

export function parseDeterministicHistoryQuery(
  query: Record<string, string | undefined>
): DeterministicHistoryQuery {
  return deterministicHistoryQuerySchema.parse(query)
}
