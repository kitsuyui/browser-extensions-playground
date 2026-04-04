import {
  type DevClientInfo,
  type DevCommandRequest,
  LOCAL_SERVER_HTTP_ORIGIN,
  type RegisteredProviderInfo,
  type ScrapingServerStatus,
} from '../../scraping-server/src/protocol'

export function createScrapingDevtoolsTools(
  baseUrl = LOCAL_SERVER_HTTP_ORIGIN
) {
  return {
    async getServerStatus(): Promise<ScrapingServerStatus> {
      const response = await fetch(`${baseUrl}/api/status`)
      return (await response.json()) as ScrapingServerStatus
    },
    async listProviders(): Promise<readonly RegisteredProviderInfo[]> {
      const response = await fetch(`${baseUrl}/api/providers`)
      return (await response.json()) as readonly RegisteredProviderInfo[]
    },
    async listDevClients(): Promise<readonly DevClientInfo[]> {
      const response = await fetch(`${baseUrl}/api/dev/clients`)
      return (await response.json()) as readonly DevClientInfo[]
    },
    async runDevCommand(command: DevCommandRequest) {
      const response = await fetch(`${baseUrl}/api/dev/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(command),
      })

      return response.json()
    },
  }
}
