import type {
  ProviderSnapshot,
  SnapshotMetric,
} from '@kitsuyui/browser-extensions-scraping-platform'
import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

export const OPENAI_STABLE_USAGE_KEYS = [
  'codex_5h',
  'codex_weekly',
  'spark_5h',
  'spark_weekly',
  'code_review',
  'credits_remaining',
] as const

export type OpenAIStableUsageKey = (typeof OPENAI_STABLE_USAGE_KEYS)[number]

export type OpenAIStableUsageSnapshot = {
  readonly provider: 'openai'
  readonly capturedAt: string
  readonly confidence: 'high' | 'medium' | 'low'
  readonly rawVersion: string
  readonly metrics: Record<OpenAIStableUsageKey, SnapshotMetric | null>
}

export function createOpenAIStableUsageSnapshot(
  snapshot: ProviderSnapshot | null
): OpenAIStableUsageSnapshot | null {
  if (!snapshot || snapshot.provider !== 'openai') {
    return null
  }

  const metrics = Object.fromEntries(
    OPENAI_STABLE_USAGE_KEYS.map((key) => [key, null])
  ) as Record<OpenAIStableUsageKey, SnapshotMetric | null>

  for (const metric of snapshot.metrics) {
    if (OPENAI_STABLE_USAGE_KEYS.includes(metric.key as OpenAIStableUsageKey)) {
      const stableKey = metric.key as OpenAIStableUsageKey
      metrics[stableKey] = {
        ...metric,
        key: stableKey,
      }
    }
  }

  return {
    provider: 'openai',
    capturedAt: snapshot.capturedAt,
    confidence: snapshot.confidence,
    rawVersion: snapshot.rawVersion,
    metrics,
  }
}

export function createQuotaOpenAITools(baseUrl = LOCAL_SERVER_HTTP_ORIGIN) {
  return {
    async getLatestSnapshot(): Promise<ProviderSnapshot | null> {
      const url = new URL(`${baseUrl}/api/deterministic/latest`)
      url.searchParams.set('provider', 'openai')

      const response = await fetch(url)
      return (await response.json()) as ProviderSnapshot | null
    },
    async getStableUsageSnapshot() {
      return createOpenAIStableUsageSnapshot(await this.getLatestSnapshot())
    },
  }
}
