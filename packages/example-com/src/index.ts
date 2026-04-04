import { createDeterministicExtensionManifest } from '../../scraping-platform/src/deterministic-extension'
import {
  createProviderSnapshot,
  type ExtractionContext,
  type ProviderExtractor,
  type ProviderManifest,
  type SnapshotMetric,
} from '../../scraping-platform/src/model'

export const providerManifest: ProviderManifest = {
  id: 'example-com',
  displayName: 'Example.com',
  matches: ['https://example.com/*'],
  capabilities: ['usage'],
  snapshotSchema: {
    description:
      'Example test provider used to validate deterministic scraping plumbing.',
    rawVersions: [
      {
        rawVersion: 'example-com-dom-v1',
        source: 'dom',
        description: 'DOM capture from the Example Domain landing page.',
      },
    ],
    metrics: [
      {
        key: 'example_domain_present',
        label: 'Example Domain present',
        unit: 'unknown',
        description:
          '1 when the page contains the canonical Example Domain text.',
      },
      {
        key: 'body_text_length',
        label: 'Body text length',
        unit: 'unknown',
        description: 'Character count of the captured body text.',
      },
    ],
  },
  debugSelectors: [
    {
      key: 'hero',
      label: 'Hero content',
      selector: 'body',
    },
  ],
}

function createSnapshotMetrics(pageText: string): readonly SnapshotMetric[] {
  const trimmed = pageText.trim()

  if (!trimmed.includes('Example Domain')) {
    return []
  }

  return [
    {
      key: 'example_domain_present',
      label: 'Example Domain present',
      remaining: 1,
      unit: 'unknown',
    },
    {
      key: 'body_text_length',
      label: 'Body text length',
      remaining: trimmed.length,
      unit: 'unknown',
    },
  ]
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
    confidence: 'high',
    rawVersion: 'example-com-dom-v1',
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
    name: 'Example.com Data',
    description:
      'Deterministic example.com extension used for automated scraping tests.',
    matches: providerManifest.matches,
  })
}

export * from './data'
export { createPopupHtml } from './runtime'
