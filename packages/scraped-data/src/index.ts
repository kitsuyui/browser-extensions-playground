import type {
  ProviderId,
  ProviderSnapshot,
} from '@kitsuyui/browser-extensions-scraping-platform'
import {
  LOCAL_SERVER_HTTP_ORIGIN,
  type ProviderDescription,
  type RegisteredProviderInfo,
  type ScrapingServerStatus,
} from '../../scraping-server/src/protocol'

export function createScrapedDataTools(baseUrl = LOCAL_SERVER_HTTP_ORIGIN) {
  return {
    async getServerStatus(): Promise<ScrapingServerStatus> {
      const response = await fetch(`${baseUrl}/api/status`)
      return (await response.json()) as ScrapingServerStatus
    },
    async listProviders(): Promise<readonly RegisteredProviderInfo[]> {
      const response = await fetch(`${baseUrl}/api/providers`)
      return (await response.json()) as readonly RegisteredProviderInfo[]
    },
    async describeProvider(
      provider: ProviderId
    ): Promise<ProviderDescription | null> {
      const response = await fetch(
        `${baseUrl}/api/providers/${encodeURIComponent(provider)}`
      )

      if (response.status === 404) {
        return null
      }

      return (await response.json()) as ProviderDescription
    },
    async getLatestSnapshot(
      provider?: ProviderId
    ): Promise<ProviderSnapshot | Record<string, ProviderSnapshot> | null> {
      const url = new URL(`${baseUrl}/api/deterministic/latest`)

      if (provider) {
        url.searchParams.set('provider', provider)
      }

      const response = await fetch(url)
      return (await response.json()) as
        | ProviderSnapshot
        | Record<string, ProviderSnapshot>
        | null
    },
  }
}
