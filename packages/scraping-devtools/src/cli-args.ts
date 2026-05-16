import { LOCAL_SERVER_HTTP_ORIGIN } from '@kitsuyui/browser-extensions-scraping-server'

export function getScrapingDevtoolsServerUrl(
  args: readonly string[],
  serverUrlArgIndex: number
): string {
  const serverUrl = args[serverUrlArgIndex]

  return serverUrl?.startsWith('http') ? serverUrl : LOCAL_SERVER_HTTP_ORIGIN
}
