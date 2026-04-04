import { createDeterministicExtensionManifest } from '../../scraping-platform/src/deterministic-extension'
import {
  createProviderSnapshot,
  type ExtractionContext,
  type ProviderExtractor,
  type ProviderManifest,
  type SnapshotMetric,
} from '../../scraping-platform/src/model'

const premiumRequestsUsagePercentPattern =
  /premium requests\s+(?<usedPercent>\d+(?:\.\d+)?)%/iu

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

function createSnapshotMetrics(pageText: string): readonly SnapshotMetric[] {
  const usageMatch = pageText.match(premiumRequestsUsagePercentPattern)
  const resetMatch = pageText.match(resetPattern)

  const metrics: SnapshotMetric[] = []
  const resetsAt = resetMatch?.groups?.reset?.trim() || undefined
  const usedPercent = parseNumber(usageMatch?.groups?.usedPercent)

  if (Number.isFinite(usedPercent)) {
    metrics.push({
      key: 'premium_requests_used_percent',
      label: 'Premium used',
      remaining: usedPercent,
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
  return createDeterministicExtensionManifest({
    name: 'Quota GitHub Copilot',
    description:
      'Deterministic GitHub Copilot quota extension with fixed behavior and limited permissions.',
    matches: providerManifest.matches,
  })
}

export * from './data'
export { createPopupHtml } from './runtime'
