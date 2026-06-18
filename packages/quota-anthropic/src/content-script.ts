import {
  type IsoTimestampClock,
  resolveIsoTimestampClock,
} from '@kitsuyui/browser-extensions-scraping-platform'
import {
  extractSnapshot,
  extractSnapshotFromUsageResponse,
  isAnthropicUsageResponse,
  providerManifest,
} from './index'

declare const chrome:
  | {
      storage?: {
        local?: {
          get?: (
            keys: string[] | string
          ) => Promise<Record<string, unknown>> | Record<string, unknown>
          set?: (items: Record<string, unknown>) => Promise<void> | void
        }
      }
      runtime?: {
        sendMessage?: (message: unknown) => Promise<unknown> | undefined
      }
    }
  | undefined

const USAGE_API_STATE_KEY = 'anthropicUsageApiState'
const MAX_USAGE_API_EVENTS = 5
let storageUpdateQueue: Promise<void> = Promise.resolve()

const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu

const usagePathPattern =
  /\/api\/organizations\/(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/usage/giu

function collectUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

const MAX_TRAVERSAL_NODES = 1_000

function collectOrganizationIdsFromUnknown(value: unknown): readonly string[] {
  const matches = new Set<string>()
  const queue: unknown[] = [value]
  let visited = 0

  while (queue.length > 0) {
    if (visited >= MAX_TRAVERSAL_NODES) break
    visited++
    const current = queue.shift()

    if (typeof current === 'string') {
      const exactMatch = current.match(uuidPattern)

      if (exactMatch) {
        for (const match of exactMatch) {
          matches.add(match)
        }
      }

      continue
    }

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    if (typeof current === 'object' && current !== null) {
      queue.push(...Object.values(current))
    }
  }

  return [...matches]
}

async function fetchJson(
  url: string,
  clock: IsoTimestampClock = resolveIsoTimestampClock()
): Promise<unknown | null> {
  const response = await fetch(url, {
    credentials: 'include',
  })

  const updatedAt = clock.nowIso()
  storageUpdateQueue = storageUpdateQueue
    .then(async () => {
      const record = (await chrome?.storage?.local?.get?.(
        USAGE_API_STATE_KEY
      )) as Record<string, unknown> | undefined
      const previousState = (record?.[USAGE_API_STATE_KEY] ?? null) as {
        readonly events?: readonly {
          readonly updatedAt?: string
          readonly meta?: {
            readonly url?: string
            readonly status?: number
          }
        }[]
      } | null
      const previousEvents = Array.isArray(previousState?.events)
        ? previousState.events
        : []

      await chrome?.storage?.local?.set?.({
        [USAGE_API_STATE_KEY]: {
          updatedAt,
          received: response.ok,
          meta: {
            url: new URL(url, window.location.origin).toString(),
            status: response.status,
          },
          events: [
            ...previousEvents,
            {
              updatedAt,
              meta: {
                url: new URL(url, window.location.origin).toString(),
                status: response.status,
              },
            },
          ].slice(-MAX_USAGE_API_EVENTS),
        },
      })
    })
    .catch(() => {})
  await storageUpdateQueue

  if (!response.ok) {
    return null
  }

  return response.json()
}

async function resolveOrganizationIds(
  clock: IsoTimestampClock = resolveIsoTimestampClock()
): Promise<readonly string[]> {
  const html = document.documentElement.innerHTML
  const idsFromUsagePath = [...html.matchAll(usagePathPattern)].flatMap(
    (match) => (typeof match.groups?.id === 'string' ? [match.groups.id] : [])
  )

  let idsFromOrganizationsApi: readonly string[] = []

  try {
    const organizations = await fetchJson('/api/organizations', clock)
    idsFromOrganizationsApi = collectOrganizationIdsFromUnknown(organizations)
  } catch {
    idsFromOrganizationsApi = []
  }

  const idsFromHtml = [...html.matchAll(uuidPattern)].map((match) => match[0])

  return collectUnique([
    ...idsFromUsagePath,
    ...idsFromOrganizationsApi,
    ...idsFromHtml,
  ]).slice(0, 20)
}

async function extractSnapshotFromUsageApi(
  clock: IsoTimestampClock = resolveIsoTimestampClock()
) {
  const organizationIds = await resolveOrganizationIds(clock)

  for (const organizationId of organizationIds) {
    try {
      const usage = await fetchJson(
        `/api/organizations/${organizationId}/usage`,
        clock
      )

      if (!isAnthropicUsageResponse(usage)) {
        continue
      }

      const snapshot = extractSnapshotFromUsageResponse(usage, {
        capturedAt: clock.nowIso(),
      })

      if (snapshot) {
        return snapshot
      }
    } catch {}
  }

  return null
}

async function emitSnapshot(
  clock: IsoTimestampClock = resolveIsoTimestampClock()
): Promise<void> {
  const snapshot =
    (await extractSnapshotFromUsageApi(clock)) ??
    extractSnapshot({
      url: window.location.href,
      pageText: document.body?.innerText?.trim().slice(0, 20_000) ?? '',
      capturedAt: clock.nowIso(),
    })

  if (!snapshot) {
    return
  }

  await chrome?.runtime?.sendMessage?.({
    type: 'scraped-data:snapshot',
    snapshot,
  })
}

if (
  providerManifest.matches.some((pattern) =>
    window.location.href.startsWith(pattern.replace('*', ''))
  )
) {
  void emitSnapshot()
  window.setTimeout(() => {
    void emitSnapshot()
  }, 2_000)
}
