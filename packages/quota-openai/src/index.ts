import { createDeterministicExtensionManifest } from '../../scraping-platform/src/deterministic-extension'
import {
  createProviderSnapshot,
  type ExtractionContext,
  type ProviderExtractor,
  type ProviderManifest,
  type SnapshotMetric,
} from '../../scraping-platform/src/model'
import type { OpenAIStableUsageSnapshot } from './data'

type OpenAIRateLimitWindow = {
  readonly used_percent: number
  readonly limit_window_seconds: number
  readonly reset_after_seconds: number
  readonly reset_at: number
}

type OpenAIWhamRateLimit = {
  readonly allowed: boolean
  readonly limit_reached: boolean
  readonly primary_window: OpenAIRateLimitWindow | null
  readonly secondary_window: OpenAIRateLimitWindow | null
}

type OpenAIWhamAdditionalRateLimit = {
  readonly limit_name: string
  readonly metered_feature?: string
  readonly rate_limit: OpenAIWhamRateLimit
}

type OpenAIWhamCredits = {
  readonly has_credits: boolean
  readonly unlimited: boolean
  readonly balance: string
}

export type OpenAIWhamUsageResponse = {
  readonly user_id: string
  readonly account_id: string
  readonly email?: string
  readonly plan_type?: string
  readonly rate_limit?: OpenAIWhamRateLimit | null
  readonly code_review_rate_limit?: OpenAIWhamRateLimit | null
  readonly additional_rate_limits?: readonly OpenAIWhamAdditionalRateLimit[]
  readonly credits?: OpenAIWhamCredits | null
}

const usageMetricDefinitions = [
  {
    key: 'codex_5h',
    label: 'Codex 5h',
    aliases: [
      '5時間の使用制限',
      '5-hour limit',
      '5 hour limit',
      '5-hour window',
      '5 hour window',
      '5-hour usage',
      '5 hour usage',
    ],
  },
  {
    key: 'codex_weekly',
    label: 'Codex weekly',
    aliases: [
      '週あたりの使用制限',
      'weekly limit',
      'weekly usage limit',
      'weekly window',
      'weekly usage',
      '7-day limit',
      '7 day limit',
      '7-day window',
      '7 day window',
      '7-day usage',
      '7 day usage',
    ],
  },
  {
    key: 'spark_5h',
    label: 'Spark 5h',
    aliases: [
      'GPT-5.3-Codex-Spark 5時間の使用制限',
      'GPT-5.3-Codex-Spark 5-hour limit',
      'GPT-5.3-Codex-Spark 5 hour limit',
      'GPT-5.3-Codex-Spark 5-hour window',
      'GPT-5.3-Codex-Spark 5 hour window',
      'GPT-5.3-Codex-Spark 5-hour usage',
      'GPT-5.3-Codex-Spark 5 hour usage',
    ],
  },
  {
    key: 'spark_weekly',
    label: 'Spark weekly',
    aliases: [
      'GPT-5.3-Codex-Spark 週あたりの使用制限',
      'GPT-5.3-Codex-Spark weekly limit',
      'GPT-5.3-Codex-Spark weekly usage limit',
      'GPT-5.3-Codex-Spark weekly window',
      'GPT-5.3-Codex-Spark weekly usage',
      'GPT-5.3-Codex-Spark 7-day limit',
      'GPT-5.3-Codex-Spark 7 day limit',
      'GPT-5.3-Codex-Spark 7-day window',
      'GPT-5.3-Codex-Spark 7 day window',
      'GPT-5.3-Codex-Spark 7-day usage',
      'GPT-5.3-Codex-Spark 7 day usage',
    ],
  },
  {
    key: 'code_review',
    label: 'Code review',
    aliases: ['コードレビュー', 'code review'],
  },
  {
    key: 'credits_remaining',
    label: 'Credits remaining',
    aliases: ['残りのクレジット', 'credits remaining'],
  },
] as const

const usageMetricBoundaryPattern = new RegExp(
  usageMetricDefinitions
    .flatMap((definition) => definition.aliases)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'giu'
)

const percentPattern =
  /(?<remaining>\d+)%\s*(?:remaining|left|used|残り)?(?:\s*(?:reset(?:s)?(?:\s+at)?|リセット)[:：]?\s*(?<reset>.*?))?$/isu

const ratioPattern =
  /(?<remaining>\d+(?:,\d{3})*)(?:\s*(?:\/|of)\s*)(?<limit>\d+(?:,\d{3})*)(?:\s*(?<tail>.*?))?$/isu

const resetPattern =
  /(?:reset(?:s)?(?:\s+at)?|リセット)[:：]?\s*(?<reset>.+)$/isu

const creditPattern = /(?<remaining>\d+)/u

function parseNumber(value: string): number {
  return Number(value.replaceAll(',', ''))
}

function parseResetAt(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const resetMatch = value.match(resetPattern)

  if (resetMatch?.groups?.reset) {
    return resetMatch.groups.reset.trim()
  }

  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : undefined
}

export const providerManifest: ProviderManifest = {
  id: 'openai',
  displayName: 'OpenAI',
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  capabilities: ['usage'],
  snapshotSchema: {
    description:
      'Usage and quota metrics extracted from ChatGPT Codex usage pages or WHAM usage responses.',
    rawVersions: [
      {
        rawVersion: 'openai-wham-usage-v1',
        source: 'network',
        description:
          'Preferred schema from the page-owned /backend-api/wham/usage response.',
      },
      {
        rawVersion: 'openai-dom-v2',
        source: 'dom',
        description:
          'Fallback schema derived from usage text rendered in the page UI.',
      },
    ],
    metrics: [
      {
        key: 'codex_5h',
        label: 'Codex 5h',
        unit: 'percent',
        description:
          'Percent used in the primary 5-hour Codex rate-limit window.',
      },
      {
        key: 'codex_weekly',
        label: 'Codex weekly',
        unit: 'percent',
        description:
          'Percent used in the secondary 7-day Codex rate-limit window.',
      },
      {
        key: 'spark_5h',
        label: 'Spark 5h',
        unit: 'percent',
        description:
          'Percent used in the primary 5-hour GPT-5.3-Codex-Spark window.',
      },
      {
        key: 'spark_weekly',
        label: 'Spark weekly',
        unit: 'percent',
        description:
          'Percent used in the secondary 7-day GPT-5.3-Codex-Spark window.',
      },
      {
        key: 'code_review',
        label: 'Code review',
        unit: 'percent',
        description: 'Percent used in the code-review rate-limit window.',
      },
      {
        key: 'credits_remaining',
        label: 'Credits remaining',
        unit: 'credits',
        description:
          'Remaining paid credits balance when the account is metered.',
      },
    ],
  },
  debugSelectors: [
    {
      key: 'usage-summary',
      label: 'Usage summary',
      selector:
        '[data-testid*="usage"], [data-testid*="quota"], [class*="usage"], [class*="quota"], main',
    },
    {
      key: 'account-menu',
      label: 'Account menu',
      selector: 'button[aria-haspopup="menu"], nav',
    },
  ],
}

function findMetricDefinition(label: string) {
  const normalizedLabel = label.trim().toLowerCase()

  return (
    usageMetricDefinitions.find((definition) =>
      definition.aliases.some(
        (alias) => alias.trim().toLowerCase() === normalizedLabel
      )
    ) ?? null
  )
}

function createCodexUsageMetrics(pageText: string): readonly SnapshotMetric[] {
  const labelMatches = [...pageText.matchAll(usageMetricBoundaryPattern)]
  const metrics: SnapshotMetric[] = []

  for (let index = 0; index < labelMatches.length; index += 1) {
    const match = labelMatches[index]
    const label = match[0]
    const definition = findMetricDefinition(label)

    if (!definition || match.index === undefined) {
      continue
    }

    const nextMatch = labelMatches[index + 1]
    const segment = pageText
      .slice(match.index + label.length, nextMatch?.index ?? pageText.length)
      .trim()

    if (definition.key === 'credits_remaining') {
      const creditMatch = segment.match(creditPattern)

      if (!creditMatch?.groups?.remaining) {
        continue
      }

      metrics.push({
        key: definition.key,
        label: definition.label,
        remaining: Number(creditMatch.groups.remaining),
        unit: 'credits',
      })
      continue
    }

    const percentMatch = segment.match(percentPattern)

    if (percentMatch?.groups?.remaining) {
      metrics.push({
        key: definition.key,
        label: definition.label,
        remaining: Number(percentMatch.groups.remaining),
        limit: 100,
        unit: 'percent',
        resetsAt: parseResetAt(percentMatch.groups.reset),
      })
      continue
    }

    const ratioMatch = segment.match(ratioPattern)

    if (!ratioMatch?.groups?.remaining || !ratioMatch.groups.limit) {
      continue
    }

    const remaining = parseNumber(ratioMatch.groups.remaining)
    const limit = parseNumber(ratioMatch.groups.limit)

    if (limit <= 0) {
      continue
    }

    metrics.push({
      key: definition.key,
      label: definition.label,
      remaining: Math.round((remaining / limit) * 100),
      limit: 100,
      unit: 'percent',
      resetsAt: parseResetAt(ratioMatch.groups.tail),
    })
  }

  return metrics.filter(
    (metric, index, source) =>
      source.findIndex((candidate) => candidate.key === metric.key) === index
  )
}

function createSnapshotMetrics(pageText: string): readonly SnapshotMetric[] {
  return createCodexUsageMetrics(pageText)
}

function isRateLimitWindow(value: unknown): value is OpenAIRateLimitWindow {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<OpenAIRateLimitWindow>

  return (
    typeof candidate.used_percent === 'number' &&
    typeof candidate.limit_window_seconds === 'number' &&
    typeof candidate.reset_after_seconds === 'number' &&
    typeof candidate.reset_at === 'number'
  )
}

function isWhamRateLimit(value: unknown): value is OpenAIWhamRateLimit {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<OpenAIWhamRateLimit>

  return (
    typeof candidate.allowed === 'boolean' &&
    typeof candidate.limit_reached === 'boolean' &&
    (candidate.primary_window === null ||
      candidate.primary_window === undefined ||
      isRateLimitWindow(candidate.primary_window)) &&
    (candidate.secondary_window === null ||
      candidate.secondary_window === undefined ||
      isRateLimitWindow(candidate.secondary_window))
  )
}

export function isOpenAIWhamUsageResponse(
  value: unknown
): value is OpenAIWhamUsageResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<OpenAIWhamUsageResponse>

  return (
    typeof candidate.user_id === 'string' &&
    typeof candidate.account_id === 'string' &&
    (candidate.rate_limit === null ||
      candidate.rate_limit === undefined ||
      isWhamRateLimit(candidate.rate_limit)) &&
    (candidate.code_review_rate_limit === null ||
      candidate.code_review_rate_limit === undefined ||
      isWhamRateLimit(candidate.code_review_rate_limit)) &&
    (candidate.additional_rate_limits === undefined ||
      Array.isArray(candidate.additional_rate_limits))
  )
}

function toIsoFromUnixSeconds(value: number | undefined): string | undefined {
  if (typeof value !== 'number') {
    return undefined
  }

  return new Date(value * 1_000).toISOString()
}

export function extractSnapshotFromWhamUsageResponse(
  usage: OpenAIWhamUsageResponse,
  options: {
    readonly capturedAt?: string
    readonly accountLabel?: string
  } = {}
) {
  if (!isOpenAIWhamUsageResponse(usage)) {
    return null
  }

  const metrics: SnapshotMetric[] = []

  if (usage.rate_limit?.primary_window) {
    metrics.push({
      key: 'codex_5h',
      label: 'Codex 5h',
      remaining: usage.rate_limit.primary_window.used_percent,
      limit: 100,
      unit: 'percent',
      resetsAt: toIsoFromUnixSeconds(usage.rate_limit.primary_window.reset_at),
    })
  }

  if (usage.rate_limit?.secondary_window) {
    metrics.push({
      key: 'codex_weekly',
      label: 'Codex weekly',
      remaining: usage.rate_limit.secondary_window.used_percent,
      limit: 100,
      unit: 'percent',
      resetsAt: toIsoFromUnixSeconds(
        usage.rate_limit.secondary_window.reset_at
      ),
    })
  }

  if (usage.code_review_rate_limit?.primary_window) {
    metrics.push({
      key: 'code_review',
      label: 'Code review',
      remaining: usage.code_review_rate_limit.primary_window.used_percent,
      limit: 100,
      unit: 'percent',
      resetsAt: toIsoFromUnixSeconds(
        usage.code_review_rate_limit.primary_window.reset_at
      ),
    })
  }

  const sparkRateLimit = usage.additional_rate_limits?.find(
    (entry) => entry.limit_name === 'GPT-5.3-Codex-Spark'
  )?.rate_limit

  if (sparkRateLimit?.primary_window) {
    metrics.push({
      key: 'spark_5h',
      label: 'Spark 5h',
      remaining: sparkRateLimit.primary_window.used_percent,
      limit: 100,
      unit: 'percent',
      resetsAt: toIsoFromUnixSeconds(sparkRateLimit.primary_window.reset_at),
    })
  }

  if (sparkRateLimit?.secondary_window) {
    metrics.push({
      key: 'spark_weekly',
      label: 'Spark weekly',
      remaining: sparkRateLimit.secondary_window.used_percent,
      limit: 100,
      unit: 'percent',
      resetsAt: toIsoFromUnixSeconds(sparkRateLimit.secondary_window.reset_at),
    })
  }

  if (usage.credits && !usage.credits.unlimited) {
    metrics.push({
      key: 'credits_remaining',
      label: 'Credits remaining',
      remaining: Number(usage.credits.balance),
      unit: 'credits',
    })
  }

  if (metrics.length === 0) {
    return null
  }

  return createProviderSnapshot({
    provider: providerManifest.id,
    accountLabel: options.accountLabel ?? usage.email,
    source: 'network',
    confidence: 'high',
    rawVersion: 'openai-wham-usage-v1',
    capturedAt: options.capturedAt,
    metrics,
  })
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
    rawVersion: 'openai-dom-v2',
    capturedAt: context.capturedAt,
    metrics,
  })
}

export const providerExtractor: ProviderExtractor = {
  manifest: providerManifest,
  extractSnapshot,
}

export function createExtensionManifest() {
  const manifest = createDeterministicExtensionManifest({
    name: 'Quota OpenAI',
    description:
      'Deterministic OpenAI quota extension with fixed behavior and limited permissions.',
    matches: providerManifest.matches,
  })

  return {
    ...manifest,
    content_scripts: manifest.content_scripts.map((entry) => ({
      ...entry,
      run_at: 'document_start' as const,
    })),
    web_accessible_resources: [
      {
        resources: ['page-hook.js'],
        matches: providerManifest.matches,
      },
    ],
  }
}

export type { OpenAIStableUsageSnapshot }
export { createOpenAIStableUsageSnapshot, createQuotaOpenAITools } from './data'
export { createPopupHtml } from './runtime'
