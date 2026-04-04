import { providerExtractor as exampleComProvider } from '@kitsuyui/browser-extensions-example-com'
import { providerExtractor as anthropicProvider } from '@kitsuyui/browser-extensions-quota-anthropic'
import { providerExtractor as openAiProvider } from '@kitsuyui/browser-extensions-quota-openai'

import {
  createDomCapture,
  type DomCapture,
  type DomProbe,
  type DomProbeMatch,
  type ExtensionCapture,
  type ExtractionContext,
  type ProviderExtractor,
  type ProviderId,
  type ProviderManifest,
  type ProviderSnapshot,
} from './model'

export * from './deterministic-extension'
export * from './model'

export const providerRegistry: readonly ProviderExtractor[] = [
  exampleComProvider,
  openAiProvider,
  anthropicProvider,
]

export function listProviders(): readonly ProviderManifest[] {
  return providerRegistry.map(({ manifest }) => manifest)
}

export function describeProvider(
  providerId: ProviderId
): ProviderManifest | null {
  return (
    providerRegistry.find(({ manifest }) => manifest.id === providerId)
      ?.manifest ?? null
  )
}

export function findProviderForUrl(url: string): ProviderExtractor | null {
  return (
    providerRegistry.find(({ manifest }) =>
      manifest.matches.some((pattern) =>
        url.startsWith(pattern.replace('*', ''))
      )
    ) ?? null
  )
}

export function listProviderHostPermissions(): readonly string[] {
  return providerRegistry.flatMap(({ manifest }) => manifest.matches)
}

export function extractSnapshotFromPage(
  context: ExtractionContext
): ProviderSnapshot | null {
  const provider = findProviderForUrl(context.url)
  return provider?.extractSnapshot(context) ?? null
}

export function collectDomProbeMatches(
  doc: Document,
  probes: readonly DomProbe[]
): readonly DomProbeMatch[] {
  return probes.flatMap((probe) => {
    const element = doc.querySelector(probe.selector)

    if (
      !element ||
      typeof (element as { innerText?: unknown }).innerText !== 'string' ||
      typeof (element as { outerHTML?: unknown }).outerHTML !== 'string'
    ) {
      return []
    }

    const elementLike = element as unknown as {
      innerText: string
      outerHTML: string
    }

    return [
      {
        ...probe,
        text: elementLike.innerText.trim().slice(0, 1_000),
        htmlSnippet: elementLike.outerHTML.slice(0, 1_000),
      },
    ]
  })
}

export function createDomCaptureFromDocument(
  provider: ProviderExtractor,
  doc: Document,
  capturedAt = new Date().toISOString()
): DomCapture {
  return createDomCapture({
    provider: provider.manifest.id,
    url: doc.location.href,
    title: doc.title,
    pageText: doc.body?.innerText?.trim().slice(0, 20_000) ?? '',
    probeMatches: collectDomProbeMatches(doc, provider.manifest.debugSelectors),
    capturedAt,
  })
}

export function createExtensionCaptureFromDocument(
  provider: ProviderExtractor,
  doc: Document,
  capturedAt = new Date().toISOString()
): ExtensionCapture {
  const domCapture = createDomCaptureFromDocument(provider, doc, capturedAt)
  const snapshot = provider.extractSnapshot({
    url: domCapture.url,
    pageText: domCapture.pageText,
    accountLabel: undefined,
    capturedAt,
  })

  return {
    snapshot,
    domCapture,
  }
}
