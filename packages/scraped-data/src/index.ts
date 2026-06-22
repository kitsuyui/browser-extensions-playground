import type {
  ProviderId,
  ProviderSnapshot,
} from '@kitsuyui/browser-extensions-scraping-platform'
import {
  type DeterministicHistoryQuery,
  type DeterministicSnapshotRecord,
  LOCAL_SERVER_HTTP_ORIGIN,
  type ProviderDescription,
  type RegisteredProviderInfo,
  type ScrapingServerStatus,
} from '@kitsuyui/browser-extensions-scraping-server'

export function createScrapedDataTools(baseUrl = LOCAL_SERVER_HTTP_ORIGIN) {
  return {
    async getServerStatus(): Promise<ScrapingServerStatus> {
      const response = await fetch(`${baseUrl}/api/status`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return (await response.json()) as ScrapingServerStatus
    },
    async listProviders(): Promise<readonly RegisteredProviderInfo[]> {
      const response = await fetch(`${baseUrl}/api/providers`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return (await response.json()) as readonly RegisteredProviderInfo[]
    },
    async describeProvider(
      provider: ProviderId
    ): Promise<ProviderDescription | null> {
      const response = await fetch(
        `${baseUrl}/api/providers/${encodeURIComponent(provider)}`
      )

      if (!response.ok) {
        return null
      }

      return (await response.json()) as ProviderDescription
    },
    async getLatestSnapshot(
      provider?: ProviderId
    ): Promise<ProviderSnapshot | Record<string, ProviderSnapshot> | null> {
      const url = new URL(`${baseUrl}/api/snapshots/latest`)

      if (provider) {
        url.searchParams.set('provider', provider)
      }

      const response = await fetch(url)
      if (!response.ok) {
        return null
      }
      return (await response.json()) as
        | ProviderSnapshot
        | Record<string, ProviderSnapshot>
        | null
    },
    async getSnapshotHistory(
      query: DeterministicHistoryQuery = {}
    ): Promise<readonly DeterministicSnapshotRecord[]> {
      const url = new URL(`${baseUrl}/api/snapshots/history`)

      if (query.provider) {
        url.searchParams.set('provider', query.provider)
      }

      if (query.from) {
        url.searchParams.set('from', query.from)
      }

      if (query.to) {
        url.searchParams.set('to', query.to)
      }

      if (typeof query.limit === 'number') {
        url.searchParams.set('limit', String(query.limit))
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return (await response.json()) as readonly DeterministicSnapshotRecord[]
    },
  }
}
