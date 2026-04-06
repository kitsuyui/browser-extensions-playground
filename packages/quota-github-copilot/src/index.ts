import { createDeterministicExtensionManifest } from '../../scraping-platform/src/deterministic-extension'
import {
  createProviderSnapshot,
  type ExtractionContext,
  type ProviderExtractor,
  type ProviderManifest,
  type SnapshotMetric,
} from '../../scraping-platform/src/model'

const premiumRequestsUsagePercentPattern =
  /premium requests(?:\s+(?:used|usage))?\s+(?<usedPercent>\d+(?:\.\d+)?)%|(?<usedPercentLeading>\d+(?:\.\d+)?)%\s+(?:of\s+)?premium requests(?:\s+(?:used|usage))?/iu

const premiumRequestsUsedRatioPattern =
  /premium requests(?:\s+(?:used|usage))?\s+(?<used>\d+(?:,\d{3})*)(?:\s*(?:\/|of)\s*)(?<limit>\d+(?:,\d{3})*)|(?<usedLeading>\d+(?:,\d{3})*)(?:\s*(?:\/|of)\s*)(?<limitLeading>\d+(?:,\d{3})*)\s+premium requests(?:\s+(?:used|usage))?/iu

const resetPattern =
  /(?:reset(?:s)?(?:\s+on|\s+at)?|renews(?:\s+on)?)(?:[:：]?\s*)(?<reset>[^.\n]+(?:UTC|GMT|JST|[AP]M|[0-9]{4}))?/iu

export const providerManifest: ProviderManifest = {
  id: 'github-copilot',
  displayName: 'GitHub Copilot',
  matches: ['https://github.com/settings/copilot/*'],
  capabilities: ['usage'],
  snapshotSchema: {
    description:
      'Premium request usage metrics extracted from GitHub Copilot personal settings pages.',
    rawVersions: [
      {
        rawVersion: 'github-copilot-dom-v1',
        source: 'dom',
        description:
          'Usage derived from rendered premium request counters on GitHub settings pages.',
      },
    ],
    metrics: [
      {
        key: 'premium_requests_used_percent',
        label: 'Premium used',
        unit: 'percent',
        description:
          'Percent of monthly premium request usage currently shown on the Copilot features page.',
      },
    ],
  },
  debugSelectors: [
    {
      key: 'copilot-usage',
      label: 'Copilot usage',
      selector:
        '[data-testid*="copilot"], [data-testid*="premium"], [class*="copilot"], [class*="premium"], main',
    },
    {
      key: 'settings-nav',
      label: 'Settings nav',
      selector: 'nav, aside',
    },
  ],
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  return Number(value.replaceAll(',', ''))
}

function toUsedPercent(used: number, limit: number): number | undefined {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
    return undefined
  }

  return Math.round((used / limit) * 1_000) / 10
}

function createSnapshotMetrics(pageText: string): readonly SnapshotMetric[] {
  const usageMatch = pageText.match(premiumRequestsUsagePercentPattern)
  const ratioMatch = pageText.match(premiumRequestsUsedRatioPattern)
  const resetMatch = pageText.match(resetPattern)

  const metrics: SnapshotMetric[] = []
  const resetsAt = resetMatch?.groups?.reset?.trim() || undefined
  const usedPercent =
    parseNumber(usageMatch?.groups?.usedPercent) ??
    parseNumber(usageMatch?.groups?.usedPercentLeading)
  const ratioUsed =
    parseNumber(ratioMatch?.groups?.used) ??
    parseNumber(ratioMatch?.groups?.usedLeading)
  const ratioLimit =
    parseNumber(ratioMatch?.groups?.limit) ??
    parseNumber(ratioMatch?.groups?.limitLeading)
  const inferredUsedPercent =
    usedPercent ??
    toUsedPercent(ratioUsed ?? Number.NaN, ratioLimit ?? Number.NaN)

  if (Number.isFinite(inferredUsedPercent)) {
    metrics.push({
      key: 'premium_requests_used_percent',
      label: 'Premium used',
      remaining: inferredUsedPercent,
      limit: 100,
      unit: 'percent',
      resetsAt,
    })
  }

  return metrics
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
    rawVersion: 'github-copilot-dom-v1',
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
    name: 'Quota GitHub Copilot',
    description:
      'Deterministic GitHub Copilot quota extension with fixed behavior and limited permissions.',
    matches: providerManifest.matches,
  })

  return {
    ...manifest,
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      ...manifest.action,
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
      },
    },
  }
}

export * from './data'
export { createPopupHtml } from './runtime'
