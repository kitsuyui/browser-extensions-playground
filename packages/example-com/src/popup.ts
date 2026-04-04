import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

declare const chrome:
  | {
      storage?: {
        local?: {
          get: (
            keys: string[] | string
          ) => Promise<Record<string, unknown>> | Record<string, unknown>
        }
      }
    }
  | undefined

async function loadState(): Promise<{
  readonly latestSnapshot: unknown
  readonly syncStatus: unknown
}> {
  const record = (await chrome?.storage?.local?.get?.([
    'latestSnapshot',
    'syncStatus',
  ])) as Record<string, unknown> | undefined

  return {
    latestSnapshot: record?.latestSnapshot ?? null,
    syncStatus: record?.syncStatus ?? null,
  }
}

async function loadServerRiskWarning(): Promise<string> {
  try {
    const response = await fetch(`${LOCAL_SERVER_HTTP_ORIGIN}/api/status`)

    if (!response.ok) {
      return 'Unable to read server status.'
    }

    const status = (await response.json()) as {
      readonly riskLevel?: string
      readonly warnings?: readonly string[]
    }

    if (status.riskLevel !== 'elevated' || !status.warnings?.[0]) {
      return 'No devtool websocket clients are connected.'
    }

    return status.warnings[0]
  } catch {
    return 'Unable to reach scraping server.'
  }
}

void Promise.all([loadState(), loadServerRiskWarning()]).then(
  ([state, warning]) => {
    const snapshotElement = document.querySelector('#snapshot')
    const syncStatusElement = document.querySelector('#sync-status')
    const riskWarning = document.querySelector('#risk-warning')

    if (snapshotElement instanceof HTMLElement) {
      snapshotElement.textContent = JSON.stringify(
        state.latestSnapshot,
        null,
        2
      )
    }

    if (syncStatusElement instanceof HTMLElement) {
      syncStatusElement.textContent = JSON.stringify(state.syncStatus, null, 2)
    }

    if (riskWarning instanceof HTMLElement) {
      riskWarning.textContent = warning
    }
  }
)
