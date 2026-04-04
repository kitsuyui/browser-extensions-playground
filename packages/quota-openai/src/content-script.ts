import {
  extractSnapshot,
  extractSnapshotFromWhamUsageResponse,
  providerManifest,
  type OpenAIWhamUsageResponse,
} from './index'

declare const chrome:
  | {
      runtime?: {
        getURL?: (path: string) => string
        sendMessage?: (message: unknown) => Promise<unknown> | undefined
      }
      storage?: {
        local?: {
          get?: (
            keys: string[] | string
          ) => Promise<Record<string, unknown>> | Record<string, unknown>
          set?: (items: Record<string, unknown>) => Promise<void> | void
        }
      }
    }
  | undefined

const PAGE_MESSAGE_TYPE = 'quota-openai:wham-usage'
const WHAM_HOOK_STATE_KEY = 'openAiWhamUsageHookState'
const MAX_HOOK_EVENTS = 5
let hasObservedNetworkSnapshot = false

type WhamHookMeta = {
  readonly url?: string
  readonly status?: number
  readonly transport?: string
}

type WhamHookState = {
  readonly updatedAt?: string
  readonly received?: boolean
  readonly meta?: WhamHookMeta
  readonly payload?: OpenAIWhamUsageResponse
  readonly events?: readonly {
    readonly updatedAt: string
    readonly meta?: WhamHookMeta
  }[]
}

function injectWhamUsageHook(): void {
  const script = document.createElement('script')
  script.src = chrome?.runtime?.getURL?.('page-hook.js') ?? ''
  script.async = false
  document.documentElement.appendChild(script)
  script.addEventListener('load', () => {
    script.remove()
  })
}

async function emitSnapshot(snapshot: ReturnType<typeof extractSnapshot>): Promise<void> {
  if (!snapshot) {
    return
  }

  await chrome?.runtime?.sendMessage?.({
    type: 'scraped-data:snapshot',
    snapshot,
  })
}

function createDomSnapshot() {
  return extractSnapshot({
    url: window.location.href,
    pageText: document.body?.innerText?.trim().slice(0, 20_000) ?? '',
  })
}

function registerWhamUsageListener(): void {
  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      typeof event.data !== 'object' ||
      event.data === null ||
      (event.data as { type?: string }).type !== PAGE_MESSAGE_TYPE
    ) {
      return
    }

    const payload = (event.data as { payload?: OpenAIWhamUsageResponse }).payload
    const meta = (event.data as { meta?: unknown }).meta
    const updatedAt = new Date().toISOString()

    void (async () => {
      const record = (await chrome?.storage?.local?.get?.(
        WHAM_HOOK_STATE_KEY
      )) as Record<string, unknown> | undefined
      const previousState = (record?.[WHAM_HOOK_STATE_KEY] ??
        null) as WhamHookState | null
      const previousEvents = Array.isArray(previousState?.events)
        ? previousState.events
        : []

      await chrome?.storage?.local?.set?.({
        [WHAM_HOOK_STATE_KEY]: {
          updatedAt,
          received: Boolean(payload),
          meta,
          payload,
          events: [
            ...previousEvents,
            {
              updatedAt,
              meta: (meta as WhamHookMeta | undefined) ?? undefined,
            },
          ].slice(-MAX_HOOK_EVENTS),
        } satisfies WhamHookState,
      })
    })()

    const snapshot = payload
      ? extractSnapshotFromWhamUsageResponse(payload, {
          capturedAt: updatedAt,
        })
      : null

    if (snapshot) {
      hasObservedNetworkSnapshot = true
      void emitSnapshot(snapshot)
    }
  })
}

if (
  providerManifest.matches.some((pattern) =>
    window.location.href.startsWith(pattern.replace('*', ''))
  )
) {
  injectWhamUsageHook()
  registerWhamUsageListener()
  void emitSnapshot(createDomSnapshot())
  window.setTimeout(() => {
    if (!hasObservedNetworkSnapshot) {
      void emitSnapshot(createDomSnapshot())
    }
  }, 2_000)
}
