import {
  collectDomProbeMatches,
  createDomCapture,
  createExtensionCaptureFromDocument,
  type IsoTimestampClock,
  type ProviderExtractor,
  resolveIsoTimestampClock,
} from '@kitsuyui/browser-extensions-scraping-platform'
import type {
  DevCommand,
  DevCommandResult,
} from '@kitsuyui/browser-extensions-scraping-server'
import { providerExtractor as exampleComProviderExtractor } from '../../example-com/src/index'
import { inferProviderId } from './providers'

const KNOWN_PROVIDER_EXTRACTORS: readonly ProviderExtractor[] = [
  exampleComProviderExtractor,
]

declare const chrome:
  | {
      runtime?: {
        id?: string
        onMessage?: {
          addListener: (
            callback: (
              message: {
                readonly type?: string
                readonly commandId?: string
                readonly command?: DevCommand
              },
              sender: unknown,
              sendResponse: (response: unknown) => void
            ) => boolean | undefined
          ) => void
        }
      }
    }
  | undefined

function createResult(
  commandId: string,
  ok: boolean,
  payload: {
    readonly result?: unknown
    readonly error?: string
    readonly errorName?: string
    readonly errorStack?: string
  }
): DevCommandResult {
  return {
    commandId,
    ok,
    ...payload,
  }
}

function getPageText(doc: Document): string {
  return (doc.body?.innerText ?? '').trim().slice(0, 20_000)
}

function findKnownProviderExtractor(url: string): ProviderExtractor | null {
  return (
    KNOWN_PROVIDER_EXTRACTORS.find((providerExtractor) =>
      providerExtractor.manifest.matches.some((pattern) =>
        url.startsWith(pattern.replace('*', ''))
      )
    ) ?? null
  )
}

function createGenericCaptureFromDocument(
  clock: IsoTimestampClock = resolveIsoTimestampClock()
): {
  readonly snapshot: ReturnType<
    typeof createExtensionCaptureFromDocument
  >['snapshot']
  readonly domCapture: ReturnType<typeof createDomCapture>
} {
  const capturedAt = clock.nowIso()
  const providerExtractor = findKnownProviderExtractor(window.location.href)

  if (providerExtractor) {
    return createExtensionCaptureFromDocument(
      providerExtractor,
      document,
      capturedAt
    )
  }

  const provider = inferProviderId(window.location.href)

  return {
    snapshot: null,
    domCapture: createDomCapture({
      provider,
      url: window.location.href,
      title: document.title,
      capturedAt,
      pageText: getPageText(document),
      probeMatches: collectDomProbeMatches(document, [
        {
          key: 'main',
          label: 'Main content',
          selector: 'main, [role="main"], body',
        },
        {
          key: 'headline',
          label: 'Headline',
          selector: 'h1, h2, [data-testid]',
        },
      ]),
    }),
  }
}

chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  const commandId = message.commandId

  if (
    message.type !== 'scraping-devtools:run-command' ||
    !message.command ||
    !commandId
  ) {
    return
  }

  if (message.command.type === 'capture-page') {
    sendResponse(
      createResult(commandId, true, {
        result: createGenericCaptureFromDocument(),
      })
    )
    return
  }

  return true
})
