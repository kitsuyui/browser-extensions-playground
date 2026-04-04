import {
  type DeterministicIngestRequest,
  LOCAL_SERVER_HTTP_MATCH_PATTERN,
  LOCAL_SERVER_HTTP_ORIGIN,
} from '../../scraping-server/src/protocol'
import type { ProviderManifest, ProviderSnapshot } from './model'

declare const chrome:
  | {
      alarms?: {
        create?: (
          name: string,
          alarmInfo: { periodInMinutes: number }
        ) => Promise<void> | void
        onAlarm?: {
          addListener: (
            callback: (alarm: { name?: string }) => void | Promise<void>
          ) => void
        }
      }
      runtime?: {
        onInstalled?: { addListener: (callback: () => void) => void }
        onStartup?: { addListener: (callback: () => void) => void }
        onMessage?: {
          addListener: (
            callback: (
              message: { type?: string; snapshot?: ProviderSnapshot },
              sender: unknown,
              sendResponse: (response: unknown) => void
            ) => boolean | undefined
          ) => void
        }
      }
      storage?: {
        local?: {
          get?: (
            keys: string[] | string
          ) => Promise<Record<string, unknown>> | Record<string, unknown>
          set: (items: Record<string, unknown>) => Promise<void> | void
        }
      }
      tabs?: {
        query?: (
          queryInfo: Record<string, unknown>
        ) => Promise<Array<{ id?: number }>>
        reload?: (tabId: number) => Promise<void> | void
      }
    }
  | undefined

export const DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES = 15
export const DETERMINISTIC_EXTENSION_ENABLED_KEY =
  'deterministicExtensionEnabled'

export function createDeterministicExtensionManifest(options: {
  readonly name: string
  readonly description: string
  readonly matches: readonly string[]
}) {
  return {
    manifest_version: 3 as const,
    name: options.name,
    version: '0.0.0',
    description: options.description,
    permissions: ['alarms', 'storage', 'tabs'],
    host_permissions: [...options.matches, LOCAL_SERVER_HTTP_MATCH_PATTERN],
    background: {
      service_worker: 'background.js',
      type: 'module' as const,
    },
    content_scripts: [
      {
        matches: options.matches,
        js: ['content-script.js'],
        run_at: 'document_idle' as const,
      },
    ],
    action: {
      default_title: options.name,
      default_popup: 'popup.html',
    },
  }
}

async function persistSnapshot(snapshot: ProviderSnapshot): Promise<void> {
  await chrome?.storage?.local?.set?.({
    latestSnapshot: snapshot,
  })
}

async function persistSyncStatus(status: unknown): Promise<void> {
  await chrome?.storage?.local?.set?.({
    syncStatus: status,
  })
}

async function isExtensionEnabled(): Promise<boolean> {
  const record = (await chrome?.storage?.local?.get?.(
    DETERMINISTIC_EXTENSION_ENABLED_KEY
  )) as Record<string, unknown> | undefined

  return record?.[DETERMINISTIC_EXTENSION_ENABLED_KEY] !== false
}

async function ingestSnapshot(
  serverUrl: string,
  snapshot: ProviderSnapshot
): Promise<void> {
  const response = await fetch(`${serverUrl}/api/deterministic/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      snapshot,
    } satisfies DeterministicIngestRequest),
  })

  if (!response.ok) {
    throw new Error(`deterministic ingest returned ${response.status}`)
  }
}

async function reloadMatchingTabs(
  matches: readonly string[],
  alarmName: string
): Promise<void> {
  const tabs = (await chrome?.tabs?.query?.({ url: matches })) ?? []

  await Promise.all(
    tabs.flatMap((tab) => {
      if (!tab.id) {
        return []
      }

      return [
        Promise.resolve(chrome?.tabs?.reload?.(tab.id)).catch(async (error) => {
          await persistSyncStatus({
            status: 'error',
            updatedAt: new Date().toISOString(),
            alarmName,
            error:
              error instanceof Error ? error.message : 'unknown reload error',
          })
        }),
      ]
    })
  )
}

export function registerDeterministicExtensionBackground(options: {
  readonly providerManifest: Pick<ProviderManifest, 'id' | 'matches'>
  readonly serverUrl?: string
  readonly periodicCaptureIntervalMinutes?: number
}) {
  const serverUrl = options.serverUrl ?? LOCAL_SERVER_HTTP_ORIGIN
  const periodicCaptureIntervalMinutes =
    options.periodicCaptureIntervalMinutes ??
    DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES
  const alarmName = `deterministic-capture:${options.providerManifest.id}`

  const schedulePeriodicCapture = () =>
    chrome?.alarms?.create?.(alarmName, {
      periodInMinutes: periodicCaptureIntervalMinutes,
    })

  chrome?.runtime?.onInstalled?.addListener(() => {
    void schedulePeriodicCapture()
  })
  chrome?.runtime?.onStartup?.addListener(() => {
    void schedulePeriodicCapture()
  })
  void schedulePeriodicCapture()

  chrome?.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name !== alarmName) {
      return
    }

    void (async () => {
      if (!(await isExtensionEnabled())) {
        await persistSyncStatus({
          status: 'paused',
          updatedAt: new Date().toISOString(),
          provider: options.providerManifest.id,
        })
        return
      }

      await reloadMatchingTabs(options.providerManifest.matches, alarmName)
    })()
  })

  chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'scraped-data:snapshot' || !message.snapshot) {
      return
    }

    const snapshot = message.snapshot

    void (async () => {
      if (!(await isExtensionEnabled())) {
        await persistSyncStatus({
          status: 'paused',
          updatedAt: new Date().toISOString(),
          provider: snapshot.provider,
        })
        sendResponse({
          ok: true,
          skipped: 'paused',
        })
        return
      }

      await persistSnapshot(snapshot)

      try {
        await ingestSnapshot(serverUrl, snapshot)
        await persistSyncStatus({
          status: 'success',
          updatedAt: new Date().toISOString(),
          provider: snapshot.provider,
        })
      } catch (error) {
        await persistSyncStatus({
          status: 'error',
          updatedAt: new Date().toISOString(),
          provider: snapshot.provider,
          error: error instanceof Error ? error.message : 'unknown error',
        })
      }

      sendResponse({
        ok: true,
      })
    })()

    return true
  })
}
