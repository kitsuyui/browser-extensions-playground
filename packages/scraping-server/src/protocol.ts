import type {
  ProviderId,
  ProviderManifest,
  ProviderSnapshot,
} from '@kitsuyui/browser-extensions-scraping-platform'

export {
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_HTTP_URL,
  DEFAULT_SERVER_PORT,
  DEFAULT_SERVER_WS_URL,
  type DeterministicIngestRequest,
  LOCAL_SERVER_DEVTOOLS_WS_URL,
  LOCAL_SERVER_HOST,
  LOCAL_SERVER_HTTP_MATCH_PATTERN,
  LOCAL_SERVER_HTTP_ORIGIN,
  LOCAL_SERVER_PORT,
} from '@kitsuyui/browser-extensions-scraping-platform'

export type RiskLevel = 'normal' | 'elevated'

export type DeterministicSnapshotRecord = {
  readonly snapshot: ProviderSnapshot
  readonly receivedAt: string
}

export type DeterministicLatestQuery = {
  readonly provider?: ProviderId
  readonly source?: ProviderSnapshot['source']
  readonly rawVersion?: string
  readonly accountLabel?: string
}

export type DeterministicHistoryQuery = {
  readonly provider?: ProviderId
  /** ISO 8601 datetime string (e.g. "2024-01-01T00:00:00.000Z") */
  readonly from?: string
  /** ISO 8601 datetime string (e.g. "2024-12-31T23:59:59.999Z") */
  readonly to?: string
  readonly limit?: number
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
  readonly snapshotProviders: readonly ProviderId[]
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
  readonly errorName?: string
  readonly errorStack?: string
}
