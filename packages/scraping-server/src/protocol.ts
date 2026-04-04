import type {
  ProviderId,
  ProviderManifest,
  ProviderSnapshot,
} from '@kitsuyui/browser-extensions-scraping-platform'

export const LOCAL_SERVER_HOST = '127.0.0.1'
export const LOCAL_SERVER_PORT = 3929
export const LOCAL_SERVER_HTTP_MATCH_PATTERN = `http://${LOCAL_SERVER_HOST}/*`
export const LOCAL_SERVER_HTTP_ORIGIN = `http://${LOCAL_SERVER_HOST}:${LOCAL_SERVER_PORT}`
export const LOCAL_SERVER_DEVTOOLS_WS_URL = `ws://${LOCAL_SERVER_HOST}:${LOCAL_SERVER_PORT}/ws/dev`
export const DEFAULT_SERVER_HOST = LOCAL_SERVER_HOST
export const DEFAULT_SERVER_PORT = LOCAL_SERVER_PORT
export const DEFAULT_SERVER_HTTP_URL = LOCAL_SERVER_HTTP_ORIGIN
export const DEFAULT_SERVER_WS_URL = LOCAL_SERVER_DEVTOOLS_WS_URL

export type RiskLevel = 'normal' | 'elevated'

export type DeterministicSnapshotRecord = {
  readonly snapshot: ProviderSnapshot
  readonly receivedAt: string
}

export type DeterministicHistoryQuery = {
  readonly provider?: ProviderId
  readonly from?: string
  readonly to?: string
  readonly limit?: number
}

export type DeterministicIngestRequest = {
  readonly providerManifest: ProviderManifest
  readonly snapshot: ProviderSnapshot
}

export type RegisteredProviderInfo = Pick<
  ProviderManifest,
  'id' | 'displayName' | 'matches' | 'capabilities'
>

export type ProviderDescription = Pick<
  ProviderManifest,
  'id' | 'displayName' | 'matches' | 'capabilities' | 'snapshotSchema'
>

export type DevClientInfo = {
  readonly clientId: string
  readonly connectedAt: string
  readonly extensionName?: string
  readonly extensionVersion?: string
}

export type ScrapingServerStatus = {
  readonly serverTime: string
  readonly riskLevel: RiskLevel
  readonly warnings: readonly string[]
  readonly deterministicProviders: readonly ProviderId[]
  readonly devClients: readonly DevClientInfo[]
}

export type DevCommand =
  | {
      readonly type: 'capture-page'
    }
  | {
      readonly type: 'execute-script'
      readonly source: string
    }
  | {
      readonly type: 'fetch-json'
      readonly url: string
      readonly method?: 'GET' | 'POST'
      readonly headers?: Record<string, string>
      readonly body?: string
    }

export type DevCommandRequest = {
  readonly targetClientId?: string
  readonly command: DevCommand
}

export type DevCommandEnvelope = {
  readonly commandId: string
  readonly command: DevCommand
}

export type DevCommandResult = {
  readonly commandId: string
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: string
}
