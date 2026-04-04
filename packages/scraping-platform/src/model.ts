export type ProviderId = string

export type MetricUnit =
  | 'messages'
  | 'requests'
  | 'tokens'
  | 'credits'
  | 'percent'
  | 'unknown'

export type SnapshotMetric = {
  readonly key: string
  readonly label: string
  readonly remaining?: number
  readonly limit?: number
  readonly unit: MetricUnit
  readonly resetsAt?: string
}

export type ProviderSnapshot = {
  readonly provider: ProviderId
  readonly accountLabel?: string
  readonly capturedAt: string
  readonly source: 'dom' | 'network' | 'inference'
  readonly confidence: 'high' | 'medium' | 'low'
  readonly metrics: readonly SnapshotMetric[]
  readonly rawVersion: string
}

export type ProviderCapability = 'usage'

export type ProviderRawVersionDescription = {
  readonly rawVersion: string
  readonly source: ProviderSnapshot['source']
  readonly description: string
}

export type ProviderMetricDescription = {
  readonly key: string
  readonly label: string
  readonly unit: MetricUnit
  readonly description: string
}

export type ProviderSnapshotSchema = {
  readonly description: string
  readonly rawVersions: readonly ProviderRawVersionDescription[]
  readonly metrics: readonly ProviderMetricDescription[]
}

export type DomProbe = {
  readonly key: string
  readonly label: string
  readonly selector: string
}

export type DomProbeMatch = DomProbe & {
  readonly text: string
  readonly htmlSnippet?: string
}

export type DomCapture = {
  readonly provider: ProviderId
  readonly url: string
  readonly title: string
  readonly capturedAt: string
  readonly pageText: string
  readonly probeMatches: readonly DomProbeMatch[]
}

export type ProviderManifest = {
  readonly id: ProviderId
  readonly displayName: string
  readonly matches: readonly string[]
  readonly capabilities: readonly ProviderCapability[]
  readonly debugSelectors: readonly DomProbe[]
  readonly snapshotSchema?: ProviderSnapshotSchema
}

export type ExtractionContext = {
  readonly url: string
  readonly pageText: string
  readonly capturedAt?: string
  readonly accountLabel?: string
}

export type ProviderExtractor = {
  readonly manifest: ProviderManifest
  extractSnapshot(context: ExtractionContext): ProviderSnapshot | null
}

export type ExtensionCapture = {
  readonly snapshot: ProviderSnapshot | null
  readonly domCapture: DomCapture
}

export function createProviderSnapshot(
  snapshot: Omit<ProviderSnapshot, 'capturedAt'> & {
    readonly capturedAt?: string
  }
): ProviderSnapshot {
  return {
    ...snapshot,
    capturedAt: snapshot.capturedAt ?? new Date().toISOString(),
  }
}

export function createDomCapture(
  capture: Omit<DomCapture, 'capturedAt'> & {
    readonly capturedAt?: string
  }
): DomCapture {
  return {
    ...capture,
    capturedAt: capture.capturedAt ?? new Date().toISOString(),
  }
}

export function isProviderSnapshot(value: unknown): value is ProviderSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<ProviderSnapshot>

  return (
    typeof candidate.provider === 'string' &&
    typeof candidate.capturedAt === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.confidence === 'string' &&
    typeof candidate.rawVersion === 'string' &&
    Array.isArray(candidate.metrics)
  )
}
