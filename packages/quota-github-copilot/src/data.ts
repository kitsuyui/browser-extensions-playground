import type { ProviderSnapshot } from '@kitsuyui/browser-extensions-scraping-platform'
import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

export function createQuotaGithubCopilotTools(
  baseUrl = LOCAL_SERVER_HTTP_ORIGIN
) {
  return {
    async getLatestSnapshot(): Promise<ProviderSnapshot | null> {
      const url = new URL(`${baseUrl}/api/deterministic/latest`)
      url.searchParams.set('provider', 'github-copilot')

      const response = await fetch(url)
      return (await response.json()) as ProviderSnapshot | null
    },
  }
}
