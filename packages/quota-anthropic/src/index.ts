import { createDeterministicExtensionManifest } from '../../scraping-platform/src/deterministic-extension'
import {
  createProviderSnapshot,
  type ExtractionContext,
  type ProviderExtractor,
  type ProviderManifest,
  type SnapshotMetric,
} from '../../scraping-platform/src/model'

type AnthropicUsageBucket = {
  readonly utilization: number
  readonly resets_at: string | null
}

type AnthropicExtraUsage = {
  readonly is_enabled: boolean
  readonly monthly_limit: number
  readonly used_credits: number
  readonly utilization: number | null
}

export type AnthropicUsageResponse = {
  readonly five_hour: AnthropicUsageBucket | null
  readonly seven_day: AnthropicUsageBucket | null
  readonly seven_day_oauth_apps?: AnthropicUsageBucket | null
  readonly seven_day_opus?: AnthropicUsageBucket | null
  readonly seven_day_sonnet?: AnthropicUsageBucket | null
  readonly seven_day_cowork?: AnthropicUsageBucket | null
  readonly iguana_necktie?: AnthropicUsageBucket | null
  readonly extra_usage: AnthropicExtraUsage | null
}

const anthropicLabelPattern = /(?<label>usage|daily|weekly|使用量|日次|週次)/giu

const anthropicRatioPattern =
  /(?<remaining>\d+(?:,\d{3})*)(?:\s*(?:\/\s*|of\s*)(?<limit>\d+(?:,\d{3})*))?/iu

const anthropicInvertedPattern =
  /(?<remaining>\d+(?:,\d{3})*)\s*of\s*(?<limit>\d+(?:,\d{3})*)\s*(?<label>usage|daily|weekly|使用量|日次|週次)\b/giu

export const providerManifest: ProviderManifest = {
  id: 'anthropic',
  displayName: 'Anthropic',
  matches: ['https://claude.ai/*', 'https://console.anthropic.com/*'],
  capabilities: ['usage'],
  snapshotSchema: {
    description:
      'Usage metrics extracted from Claude usage pages or the Anthropic organization usage API.',
    rawVersions: [
      {
        rawVersion: 'anthropic-usage-api-v1',
        source: 'network',
        description:
          'Preferred schema from /api/organizations/{orgId}/usage responses.',
      },
      {
        rawVersion: 'anthropic-dom-v2',
        source: 'dom',
        description:
          'Fallback schema derived from usage text rendered in the Claude UI.',
      },
    ],
    metrics: [
      {
        key: 'five_hour',
        label: 'Current session',
        unit: 'percent',
        description: 'Percent used in the current 5-hour Claude usage window.',
      },
      {
        key: 'seven_day',
        label: 'Weekly limits',
        unit: 'percent',
        description: 'Percent used in the 7-day Claude usage window.',
      },
      {
        key: 'extra_usage_credits',
        label: 'Extra usage',
        unit: 'credits',
        description:
          'Consumed or remaining extra-usage credits from the monthly cap.',
      },
      {
        key: 'usage',
        label: 'usage',
        unit: 'messages',
        description:
          'DOM fallback count parsed from generic usage message ratios.',
      },
      {
        key: 'daily',
        label: 'daily',
        unit: 'messages',
        description:
          'DOM fallback daily message ratio parsed from rendered text.',
      },
      {
        key: 'weekly',
        label: 'weekly',
        unit: 'messages',
        description:
          'DOM fallback weekly message ratio parsed from rendered text.',
      },
    ],
  },
  debugSelectors: [
    {
      key: 'usage',
      label: 'Usage summary',
      selector:
        '[data-testid*="usage"], [data-testid*="quota"], [class*="usage"], [class*="quota"], main',
    },
    {
      key: 'sidebar',
      label: 'Sidebar',
      selector: 'aside, nav',
    },
  ],
}

function isUsageBucket(value: unknown): value is AnthropicUsageBucket {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<AnthropicUsageBucket>

  return (
    typeof candidate.utilization === 'number' &&
    (typeof candidate.resets_at === 'string' || candidate.resets_at === null)
  )
}

export function isAnthropicUsageResponse(
  value: unknown
): value is AnthropicUsageResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<AnthropicUsageResponse>

  return (
    (candidate.five_hour === null || isUsageBucket(candidate.five_hour)) &&
    (candidate.seven_day === null || isUsageBucket(candidate.seven_day)) &&
    ('extra_usage' in candidate ||
      'five_hour' in candidate ||
      'seven_day' in candidate)
  )
}

function createSnapshotMetrics(pageText: string): readonly SnapshotMetric[] {
  const withLabel = (label?: string): string => {
    const normalizedLabel = (label ?? 'usage').toLowerCase()

    if (normalizedLabel.startsWith('day') || normalizedLabel.includes('日')) {
      return 'daily'
    }

    if (normalizedLabel.startsWith('week') || normalizedLabel.includes('週')) {
      return 'weekly'
    }

    return 'usage'
  }

  const parse = (value: string): number => Number(value.replaceAll(',', ''))
  const metrics: SnapshotMetric[] = []

  const labelMatches = [...pageText.matchAll(anthropicLabelPattern)]

  for (let index = 0; index < labelMatches.length; index += 1) {
    const match = labelMatches[index]
    if (match.index === undefined) {
      continue
    }

    const nextMatch = labelMatches[index + 1]
    const segment = pageText.slice(
      match.index,
      nextMatch?.index ?? pageText.length
    )
    const firstRatioMatch = segment.match(anthropicRatioPattern)

    if (!firstRatioMatch?.groups) {
      continue
    }

    metrics.push({
      key: withLabel(match.groups?.label),
      label: match.groups?.label ?? 'usage',
      remaining: parse(firstRatioMatch.groups.remaining),
      limit: firstRatioMatch.groups.limit
        ? parse(firstRatioMatch.groups.limit)
        : undefined,
      unit: 'messages' as const,
    })
  }

  for (const match of pageText.matchAll(anthropicInvertedPattern)) {
    metrics.push({
      key: withLabel(match.groups?.label),
      label: match.groups?.label ?? 'usage',
      remaining: parse(match.groups?.remaining ?? '0'),
      limit: match.groups?.limit ? parse(match.groups.limit) : undefined,
      unit: 'messages' as const,
    })
  }

  return metrics.filter(
    (entry, index, source) =>
      source.findIndex(
        (candidate) =>
          candidate.key === entry.key &&
          candidate.remaining === entry.remaining &&
          candidate.limit === entry.limit
      ) === index
  )
}

export function extractSnapshot(context: ExtractionContext) {
  const metrics = createSnapshotMetrics(context.pageText)

  if (metrics.length === 0) {
    return null
  }

  return createProviderSnapshot({
    provider: providerManifest.id,
    accountLabel: context.accountLabel,
    source: 'dom',
    confidence: 'medium',
    rawVersion: 'anthropic-dom-v2',
    capturedAt: context.capturedAt,
    metrics,
  })
}

export function extractSnapshotFromUsageResponse(
  usage: AnthropicUsageResponse,
  options: {
    readonly capturedAt?: string
    readonly accountLabel?: string
  } = {}
) {
  const metrics: SnapshotMetric[] = []

  if (usage.five_hour) {
    metrics.push({
      key: 'five_hour',
      label: 'Current session',
      remaining: usage.five_hour.utilization,
      limit: 100,
      unit: 'percent',
      resetsAt: usage.five_hour.resets_at ?? undefined,
    })
  }

  if (usage.seven_day) {
    metrics.push({
      key: 'seven_day',
      label: 'Weekly limits',
      remaining: usage.seven_day.utilization,
      limit: 100,
      unit: 'percent',
      resetsAt: usage.seven_day.resets_at ?? undefined,
    })
  }

  if (usage.extra_usage) {
    metrics.push({
      key: 'extra_usage_credits',
      label: 'Extra usage',
      remaining: usage.extra_usage.used_credits,
      limit: usage.extra_usage.monthly_limit,
      unit: 'credits',
    })
  }

  if (metrics.length === 0) {
    return null
  }

  return createProviderSnapshot({
    provider: providerManifest.id,
    accountLabel: options.accountLabel,
    source: 'network',
    confidence: 'high',
    rawVersion: 'anthropic-usage-api-v1',
    capturedAt: options.capturedAt,
    metrics,
  })
}

export const providerExtractor: ProviderExtractor = {
  manifest: providerManifest,
  extractSnapshot,
}

export function createExtensionManifest() {
  return createDeterministicExtensionManifest({
    name: 'Quota Anthropic',
    description:
      'Deterministic Anthropic quota extension with fixed behavior and limited permissions.',
    matches: providerManifest.matches,
  })
}

export * from './data'
export { createPopupHtml } from './runtime'
