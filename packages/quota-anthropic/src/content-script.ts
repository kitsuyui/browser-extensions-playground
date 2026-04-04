import {
  extractSnapshot,
  extractSnapshotFromUsageResponse,
  isAnthropicUsageResponse,
  providerManifest,
} from './index'

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (message: unknown) => Promise<unknown> | undefined
      }
    }
  | undefined

const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu

const usagePathPattern =
  /\/api\/organizations\/(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/usage/giu

function collectUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function collectOrganizationIdsFromUnknown(value: unknown): readonly string[] {
  const matches = new Set<string>()
  const queue: unknown[] = [value]

  while (queue.length > 0) {
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

async function fetchJson(url: string): Promise<unknown | null> {
  const response = await fetch(url, {
    credentials: 'include',
  })

  if (!response.ok) {
    return null
  }

  return response.json()
}

async function resolveOrganizationIds(): Promise<readonly string[]> {
  const html = document.documentElement.innerHTML
  const idsFromUsagePath = [...html.matchAll(usagePathPattern)].flatMap(
    (match) => (typeof match.groups?.id === 'string' ? [match.groups.id] : [])
  )

  let idsFromOrganizationsApi: readonly string[] = []

  try {
    const organizations = await fetchJson('/api/organizations')
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

async function extractSnapshotFromUsageApi() {
  const organizationIds = await resolveOrganizationIds()

  for (const organizationId of organizationIds) {
    try {
      const usage = await fetchJson(
        `/api/organizations/${organizationId}/usage`
      )

      if (!isAnthropicUsageResponse(usage)) {
        continue
      }

      const snapshot = extractSnapshotFromUsageResponse(usage, {
        capturedAt: new Date().toISOString(),
      })

      if (snapshot) {
        return snapshot
      }
    } catch {}
  }

  return null
}

async function emitSnapshot(): Promise<void> {
  const snapshot =
    (await extractSnapshotFromUsageApi()) ??
    extractSnapshot({
      url: window.location.href,
      pageText: document.body?.innerText?.trim().slice(0, 20_000) ?? '',
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
