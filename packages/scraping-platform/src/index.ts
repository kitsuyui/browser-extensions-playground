import {
  createDomCapture,
  type DomCapture,
  type DomProbe,
  type DomProbeMatch,
  type ExtensionCapture,
  type ProviderExtractor,
} from './model'

export * from './deterministic-extension'
export * from './model'

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

function getPageText(doc: Document): string {
  return (doc.body?.innerText ?? '').trim().slice(0, 20_000)
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
    pageText: getPageText(doc),
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
