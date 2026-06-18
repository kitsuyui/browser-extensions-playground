import type { ProviderManifest, ProviderSnapshot } from './model'
import {
  type DeterministicIngestRequest,
  LOCAL_SERVER_HTTP_MATCH_PATTERN,
  LOCAL_SERVER_HTTP_ORIGIN,
} from './server-config'

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
export const LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS = {
  latestSnapshot: 'latestSnapshot',
  syncStatus: 'syncStatus',
} as const

export function getDeterministicExtensionStorageKeys(provider: string): {
  readonly latestSnapshot: string
  readonly syncStatus: string
} {
  return {
    latestSnapshot: `deterministicExtension:${provider}:latestSnapshot`,
    syncStatus: `deterministicExtension:${provider}:syncStatus`,
  }
}

function serializeError(
  error: unknown,
  fallback: string
): {
  readonly error: string
  readonly errorName?: string
  readonly errorStack?: string
} {
  if (error instanceof Error) {
    return {
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
    }
  }

  return {
    error:
      error === null || error === undefined
        ? fallback
        : typeof error === 'string' && error.length > 0
          ? error
          : String(error),
  }
}

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
  const storageKeys = getDeterministicExtensionStorageKeys(snapshot.provider)

  await chrome?.storage?.local?.set?.({
    [storageKeys.latestSnapshot]: snapshot,
    [LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.latestSnapshot]: snapshot,
  })
}

async function persistSyncStatus(
  provider: string,
  status: unknown
): Promise<void> {
  const storageKeys = getDeterministicExtensionStorageKeys(provider)

  await chrome?.storage?.local?.set?.({
    [storageKeys.syncStatus]: status,
    [LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.syncStatus]: status,
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
  providerManifest: ProviderManifest,
  snapshot: ProviderSnapshot
): Promise<void> {
  const response = await fetch(`${serverUrl}/api/snapshots/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      providerManifest,
      snapshot,
    } satisfies DeterministicIngestRequest),
  })

  if (!response.ok) {
    let detail = ''

    try {
      const contentType = response.headers.get('content-type') ?? ''

      if (contentType.includes('application/json')) {
        const payload = (await response.json()) as { error?: unknown }

        if (typeof payload.error === 'string' && payload.error.length > 0) {
          detail = payload.error
        }
      } else {
        const text = await response.text()

        if (text.length > 0) {
          detail = text
        }
      }
    } catch (e) {
      console.warn('snapshot sync: failed to read error response body', e)
    }

    throw new Error(
      detail.length > 0
        ? `snapshot sync returned ${response.status}: ${detail}`
        : `snapshot sync returned ${response.status}`
    )
  }
}

async function reloadMatchingTabs(
  provider: string,
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
          await persistSyncStatus(provider, {
            status: 'error',
            updatedAt: new Date().toISOString(),
            provider,
            alarmName,
            ...serializeError(error, 'unknown reload error'),
          })
        }),
      ]
    })
  )
}

export function registerDeterministicExtensionBackground(options: {
  readonly providerManifest: ProviderManifest
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
        await persistSyncStatus(options.providerManifest.id, {
          status: 'paused',
          updatedAt: new Date().toISOString(),
          provider: options.providerManifest.id,
        })
        return
      }

      await reloadMatchingTabs(
        options.providerManifest.id,
        options.providerManifest.matches,
        alarmName
      )
    })()
  })

  chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'scraped-data:snapshot' || !message.snapshot) {
      return
    }

    const snapshot = message.snapshot

    void (async () => {
      if (!(await isExtensionEnabled())) {
        await persistSyncStatus(snapshot.provider, {
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
        await ingestSnapshot(serverUrl, options.providerManifest, snapshot)
        await persistSyncStatus(snapshot.provider, {
          status: 'success',
          updatedAt: new Date().toISOString(),
          provider: snapshot.provider,
        })
      } catch (error) {
        await persistSyncStatus(snapshot.provider, {
          status: 'error',
          updatedAt: new Date().toISOString(),
          provider: snapshot.provider,
          ...serializeError(error, 'unknown error'),
        })
      }

      sendResponse({
        ok: true,
      })
    })()

    return true
  })
}
