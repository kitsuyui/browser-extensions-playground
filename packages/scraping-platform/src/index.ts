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
export * from './server-config'
export * from './time'

// Slice by UTF-16 code units while avoiding splitting a surrogate pair.
// If the cut point lands on a high surrogate (0xD800–0xDBFF), step back by one
// so the paired low surrogate is not orphaned in the result.
function sliceSafe(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  const code = str.charCodeAt(maxLen - 1)
  const end = code >= 0xd800 && code <= 0xdbff ? maxLen - 1 : maxLen
  return str.slice(0, end)
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
        text: sliceSafe(elementLike.innerText.trim(), 1_000),
        htmlSnippet: sliceSafe(elementLike.outerHTML.trim(), 1_000),
      },
    ]
  })
}

function getPageText(doc: Document): string {
  return sliceSafe((doc.body?.innerText ?? '').trim(), 20_000)
}

/**
 * @param capturedAt - ISO 8601 timestamp for the capture. Defaults to
 * `new Date().toISOString()` evaluated at call time, so two calls without an
 * explicit value will produce different timestamps even for the same page.
 * Pass a shared timestamp when comparing or deduplicating captures.
 */
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

/**
 * @param capturedAt - ISO 8601 timestamp for the capture. Defaults to
 * `new Date().toISOString()` evaluated at call time. Pass an explicit value
 * when the timestamp must be shared with other captures in the same session.
 */
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
