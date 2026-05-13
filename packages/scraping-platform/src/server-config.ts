import type { ProviderManifest, ProviderSnapshot } from './model'

export const LOCAL_SERVER_HOST = '127.0.0.1'
export const LOCAL_SERVER_PORT = 3929
export const LOCAL_SERVER_HTTP_MATCH_PATTERN = `http://${LOCAL_SERVER_HOST}/*`
export const LOCAL_SERVER_HTTP_ORIGIN = `http://${LOCAL_SERVER_HOST}:${LOCAL_SERVER_PORT}`
export const LOCAL_SERVER_DEVTOOLS_WS_URL = `ws://${LOCAL_SERVER_HOST}:${LOCAL_SERVER_PORT}/ws/dev`
export const DEFAULT_SERVER_HOST = LOCAL_SERVER_HOST
export const DEFAULT_SERVER_PORT = LOCAL_SERVER_PORT
export const DEFAULT_SERVER_HTTP_URL = LOCAL_SERVER_HTTP_ORIGIN
export const DEFAULT_SERVER_WS_URL = LOCAL_SERVER_DEVTOOLS_WS_URL

export type DeterministicIngestRequest = {
  readonly providerManifest: ProviderManifest
  readonly snapshot: ProviderSnapshot
}
