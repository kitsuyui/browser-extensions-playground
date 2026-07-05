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
          remove?: (keys: string[] | string) => Promise<void> | void
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
export const LEGACY_DETERMINISTIC_EXTENSION_STORAGE_MIGRATION = {
  removalCondition:
    'Remove a legacy key after a value for the same provider is copied or written to its provider-scoped replacement.',
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

function hasProvider(value: unknown, provider: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { readonly provider?: unknown }).provider === provider
  )
}

async function loadLegacyMigrationRecord(
  provider: string
): Promise<Record<string, unknown>> {
  const storageKeys = getDeterministicExtensionStorageKeys(provider)

  return ((await chrome?.storage?.local?.get?.([
    storageKeys.latestSnapshot,
    storageKeys.syncStatus,
    LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.latestSnapshot,
    LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.syncStatus,
  ])) ?? {}) as Record<string, unknown>
}

async function removeProviderLegacyStorageKeys(
  provider: string,
  record?: Record<string, unknown>
): Promise<void> {
  const migrationRecord = record ?? (await loadLegacyMigrationRecord(provider))
  const keysToRemove: string[] = []

  if (
    hasProvider(
      migrationRecord[
        LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.latestSnapshot
      ],
      provider
    )
  ) {
    keysToRemove.push(
      LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.latestSnapshot
    )
  }

  if (
    hasProvider(
      migrationRecord[LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.syncStatus],
      provider
    )
  ) {
    keysToRemove.push(LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.syncStatus)
  }

  if (keysToRemove.length > 0) {
    await chrome?.storage?.local?.remove?.(keysToRemove)
  }
}

export async function loadDeterministicExtensionStorageState(
  provider: string
): Promise<{
  readonly latestSnapshot: unknown
  readonly syncStatus: unknown
}> {
  const storageKeys = getDeterministicExtensionStorageKeys(provider)
  const record = await loadLegacyMigrationRecord(provider)
  const legacyLatestSnapshot =
    record[LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.latestSnapshot]
  const legacySyncStatus =
    record[LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS.syncStatus]
  const latestSnapshot =
    record[storageKeys.latestSnapshot] ??
    (hasProvider(legacyLatestSnapshot, provider) ? legacyLatestSnapshot : null)
  const syncStatus =
    record[storageKeys.syncStatus] ??
    (hasProvider(legacySyncStatus, provider) ? legacySyncStatus : null)
  const migratedEntries: Record<string, unknown> = {}

  if (
    record[storageKeys.latestSnapshot] === undefined &&
    hasProvider(legacyLatestSnapshot, provider)
  ) {
    migratedEntries[storageKeys.latestSnapshot] = legacyLatestSnapshot
  }

  if (
    record[storageKeys.syncStatus] === undefined &&
    hasProvider(legacySyncStatus, provider)
  ) {
    migratedEntries[storageKeys.syncStatus] = legacySyncStatus
  }

  if (Object.keys(migratedEntries).length > 0) {
    await chrome?.storage?.local?.set?.(migratedEntries)
  }

  await removeProviderLegacyStorageKeys(provider, record)

  return {
    latestSnapshot,
    syncStatus,
  }
}

async function persistSnapshot(snapshot: ProviderSnapshot): Promise<void> {
  const storageKeys = getDeterministicExtensionStorageKeys(snapshot.provider)

  await chrome?.storage?.local?.set?.({
    [storageKeys.latestSnapshot]: snapshot,
  })
  await removeProviderLegacyStorageKeys(snapshot.provider)
}

async function persistSyncStatus(
  provider: string,
  status: unknown
): Promise<void> {
  const storageKeys = getDeterministicExtensionStorageKeys(provider)

  await chrome?.storage?.local?.set?.({
    [storageKeys.syncStatus]: status,
  })
  await removeProviderLegacyStorageKeys(provider)
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
