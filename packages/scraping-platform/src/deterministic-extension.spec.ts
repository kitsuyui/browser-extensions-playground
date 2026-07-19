import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createDeterministicExtensionManifest,
  DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES,
  getDeterministicExtensionStorageKeys,
  LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS,
  LEGACY_DETERMINISTIC_EXTENSION_STORAGE_MIGRATION,
  loadDeterministicExtensionStorageState,
  registerDeterministicExtensionBackground,
} from './deterministic-extension'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createDeterministicExtensionManifest', () => {
  it('creates a deterministic extension manifest with limited permissions', () => {
    const manifest = createDeterministicExtensionManifest({
      name: 'Quota Example',
      description: 'Example deterministic extension',
      matches: ['https://example.com/*'],
    })

    expect(manifest.permissions).toEqual(['alarms', 'storage', 'tabs'])
    expect(manifest.host_permissions).toEqual([
      'https://example.com/*',
      'http://127.0.0.1/*',
    ])
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://example.com/*'],
        js: ['content-script.js'],
        run_at: 'document_idle',
      },
    ])
  })
})

describe('DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES', () => {
  it('uses a conservative periodic reload interval', () => {
    expect(DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES).toBe(15)
  })
})

describe('getDeterministicExtensionStorageKeys', () => {
  it('scopes runtime storage entries by provider', () => {
    expect(getDeterministicExtensionStorageKeys('openai')).toEqual({
      latestSnapshot: 'deterministicExtension:openai:latestSnapshot',
      syncStatus: 'deterministicExtension:openai:syncStatus',
    })
    expect(
      getDeterministicExtensionStorageKeys('openai').latestSnapshot
    ).not.toBe(getDeterministicExtensionStorageKeys('anthropic').latestSnapshot)
  })

  it('keeps stable legacy keys for fallback reads', () => {
    expect(LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS).toEqual({
      latestSnapshot: 'latestSnapshot',
      syncStatus: 'syncStatus',
    })
  })

  it('documents when legacy storage keys are removed', () => {
    expect(
      LEGACY_DETERMINISTIC_EXTENSION_STORAGE_MIGRATION.removalCondition
    ).toContain('provider-scoped replacement')
  })

  it('migrates provider-owned legacy values to scoped keys and removes legacy keys', async () => {
    const latestSnapshot = {
      provider: 'openai',
      capturedAt: '2026-06-18T00:00:00.000Z',
      source: 'dom',
      confidence: 'high',
      rawVersion: 'test',
      metrics: [],
    }
    const syncStatus = {
      provider: 'openai',
      status: 'success',
    }
    const localSet = vi.fn().mockResolvedValue(undefined)
    const localRemove = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            latestSnapshot,
            syncStatus,
          }),
          set: localSet,
          remove: localRemove,
        },
      },
    })

    await expect(
      loadDeterministicExtensionStorageState('openai')
    ).resolves.toEqual({
      enabled: true,
      record: {
        latestSnapshot,
        syncStatus,
      },
      latestSnapshot,
      syncStatus,
    })
    expect(localSet).toHaveBeenCalledWith({
      'deterministicExtension:openai:latestSnapshot': latestSnapshot,
      'deterministicExtension:openai:syncStatus': syncStatus,
    })
    expect(localRemove).toHaveBeenCalledWith(['latestSnapshot', 'syncStatus'])
  })

  it('leaves legacy values for other providers untouched', async () => {
    const localSet = vi.fn().mockResolvedValue(undefined)
    const localRemove = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            latestSnapshot: { provider: 'anthropic' },
            syncStatus: { provider: 'anthropic', status: 'success' },
          }),
          set: localSet,
          remove: localRemove,
        },
      },
    })

    await expect(
      loadDeterministicExtensionStorageState('openai')
    ).resolves.toEqual({
      enabled: true,
      record: {
        latestSnapshot: { provider: 'anthropic' },
        syncStatus: { provider: 'anthropic', status: 'success' },
      },
      latestSnapshot: null,
      syncStatus: null,
    })
    expect(localSet).not.toHaveBeenCalled()
    expect(localRemove).not.toHaveBeenCalled()
  })

  it('returns disabled when the deterministic extension flag is false', async () => {
    const localSet = vi.fn().mockResolvedValue(undefined)
    const localRemove = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            deterministicExtensionEnabled: false,
          }),
          set: localSet,
          remove: localRemove,
        },
      },
    })

    await expect(
      loadDeterministicExtensionStorageState('openai')
    ).resolves.toEqual({
      enabled: false,
      record: {
        deterministicExtensionEnabled: false,
      },
      latestSnapshot: null,
      syncStatus: null,
    })
    expect(localSet).not.toHaveBeenCalled()
    expect(localRemove).not.toHaveBeenCalled()
  })
})

describe('registerDeterministicExtensionBackground', () => {
  function createStorageLocal(record: Record<string, unknown>) {
    return {
      get: vi.fn().mockImplementation(async (keys: string[] | string) => {
        const keyList = Array.isArray(keys) ? keys : [keys]

        return Object.fromEntries(
          keyList
            .filter((key) => key in record)
            .map((key) => [key, record[key]])
        )
      }),
      set: vi
        .fn()
        .mockImplementation(
          async (items: Record<string, unknown>): Promise<void> => {
            Object.assign(record, items)
          }
        ),
      remove: vi.fn().mockImplementation(async (keys: string[] | string) => {
        const keyList = Array.isArray(keys) ? keys : [keys]

        for (const key of keyList) {
          delete record[key]
        }
      }),
    }
  }

  function createSnapshot(capturedAt: string) {
    return {
      provider: 'openai',
      capturedAt,
      source: 'dom' as const,
      confidence: 'high' as const,
      rawVersion: 'test',
      metrics: [],
    }
  }

  function createRuntimeListenerHarness() {
    let messageListener:
      | ((
          message: {
            type?: string
            snapshot?: ReturnType<typeof createSnapshot>
          },
          sender: unknown,
          sendResponse: (response: unknown) => void
        ) => boolean | undefined)
      | undefined

    return {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: {
          addListener: vi.fn().mockImplementation((listener) => {
            messageListener = listener
          }),
        },
      },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      getMessageListener() {
        if (!messageListener) {
          throw new Error('message listener not registered')
        }

        return messageListener
      },
    }
  }

  async function dispatchSnapshotMessage(
    listener: (
      message: { type?: string; snapshot?: ReturnType<typeof createSnapshot> },
      sender: unknown,
      sendResponse: (response: unknown) => void
    ) => boolean | undefined,
    snapshot: ReturnType<typeof createSnapshot>
  ): Promise<unknown> {
    return await new Promise((resolve) => {
      listener(
        {
          type: 'scraped-data:snapshot',
          snapshot,
        },
        undefined,
        resolve
      )
    })
  }

  it('skips stale snapshots that arrive after a newer snapshot', async () => {
    const record: Record<string, unknown> = {}
    const storageLocal = createStorageLocal(record)
    const runtimeHarness = createRuntimeListenerHarness()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('chrome', {
      runtime: runtimeHarness.runtime,
      alarms: runtimeHarness.alarms,
      storage: {
        local: storageLocal,
      },
    })

    registerDeterministicExtensionBackground({
      providerManifest: {
        id: 'openai',
        displayName: 'OpenAI',
        matches: ['https://example.com/*'],
        capabilities: ['usage'],
        debugSelectors: [],
      },
    })

    const listener = runtimeHarness.getMessageListener()
    const newerSnapshot = createSnapshot('2026-07-10T00:00:05.000Z')
    const olderSnapshot = createSnapshot('2026-07-10T00:00:00.000Z')

    await expect(
      dispatchSnapshotMessage(listener, newerSnapshot)
    ).resolves.toEqual({ ok: true })
    await expect(
      dispatchSnapshotMessage(listener, olderSnapshot)
    ).resolves.toEqual({ ok: true, skipped: 'stale' })

    const storageKeys = getDeterministicExtensionStorageKeys('openai')

    expect(record[storageKeys.latestSnapshot]).toEqual(newerSnapshot)
    expect(record[storageKeys.syncStatus]).toMatchObject({
      provider: 'openai',
      status: 'success',
      snapshotCapturedAt: newerSnapshot.capturedAt,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the newest snapshot after concurrent messages complete', async () => {
    const record: Record<string, unknown> = {}
    const storageLocal = createStorageLocal(record)
    const runtimeHarness = createRuntimeListenerHarness()
    let fetchCallCount = 0
    let resolveFirstFetchStarted!: () => void
    let resolveFirstFetch!: () => void
    const firstFetchStarted = new Promise<void>((resolve) => {
      resolveFirstFetchStarted = resolve
    })
    const firstFetch = new Promise<void>((resolve) => {
      resolveFirstFetch = resolve
    })
    const fetchMock = vi.fn().mockImplementation(async () => {
      fetchCallCount += 1

      if (fetchCallCount === 1) {
        resolveFirstFetchStarted()
        await firstFetch
      }

      return {
        ok: true,
        headers: { get: () => 'application/json' },
      }
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('chrome', {
      runtime: runtimeHarness.runtime,
      alarms: runtimeHarness.alarms,
      storage: {
        local: storageLocal,
      },
    })

    registerDeterministicExtensionBackground({
      providerManifest: {
        id: 'openai',
        displayName: 'OpenAI',
        matches: ['https://example.com/*'],
        capabilities: ['usage'],
        debugSelectors: [],
      },
    })

    const listener = runtimeHarness.getMessageListener()
    const olderSnapshot = createSnapshot('2026-07-10T00:00:00.000Z')
    const newerSnapshot = createSnapshot('2026-07-10T00:00:05.000Z')
    const olderPromise = dispatchSnapshotMessage(listener, olderSnapshot)
    const newerPromise = dispatchSnapshotMessage(listener, newerSnapshot)

    await firstFetchStarted
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFirstFetch()

    await expect(olderPromise).resolves.toEqual({ ok: true })
    await expect(newerPromise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const storageKeys = getDeterministicExtensionStorageKeys('openai')

    expect(record[storageKeys.latestSnapshot]).toEqual(newerSnapshot)
    expect(record[storageKeys.syncStatus]).toMatchObject({
      provider: 'openai',
      status: 'success',
      snapshotCapturedAt: newerSnapshot.capturedAt,
    })
  })

  it('responds and records an error when persisting a snapshot fails', async () => {
    const record: Record<string, unknown> = {}
    const runtimeHarness = createRuntimeListenerHarness()
    const snapshot = createSnapshot('2026-07-10T00:00:00.000Z')
    const storageKeys = getDeterministicExtensionStorageKeys('openai')
    const localRemove = vi.fn().mockResolvedValue(undefined)
    const localGet = vi
      .fn()
      .mockImplementation(async (keys: string[] | string) => {
        const keyList = Array.isArray(keys) ? keys : [keys]

        return Object.fromEntries(
          keyList
            .filter((key) => key in record)
            .map((key) => [key, record[key]])
        )
      })
    const localSet = vi
      .fn()
      .mockImplementation(async (items: Record<string, unknown>) => {
        if (storageKeys.latestSnapshot in items) {
          throw new Error('snapshot write failed')
        }

        Object.assign(record, items)
      })

    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('chrome', {
      runtime: runtimeHarness.runtime,
      alarms: runtimeHarness.alarms,
      storage: {
        local: {
          get: localGet,
          set: localSet,
          remove: localRemove,
        },
      },
    })

    registerDeterministicExtensionBackground({
      providerManifest: {
        id: 'openai',
        displayName: 'OpenAI',
        matches: ['https://example.com/*'],
        capabilities: ['usage'],
        debugSelectors: [],
      },
    })

    const listener = runtimeHarness.getMessageListener()

    await expect(
      dispatchSnapshotMessage(listener, snapshot)
    ).resolves.toMatchObject({
      ok: false,
      error: 'snapshot write failed',
    })
    expect(record[storageKeys.syncStatus]).toMatchObject({
      provider: 'openai',
      status: 'error',
      snapshotCapturedAt: snapshot.capturedAt,
      error: 'snapshot write failed',
    })
  })

  it('responds when paused status persistence fails', async () => {
    const record: Record<string, unknown> = {
      deterministicExtensionEnabled: false,
    }
    const runtimeHarness = createRuntimeListenerHarness()
    const snapshot = createSnapshot('2026-07-10T00:00:00.000Z')
    const storageKeys = getDeterministicExtensionStorageKeys('openai')
    const localRemove = vi.fn().mockResolvedValue(undefined)
    let syncStatusWriteAttempts = 0
    const localSet = vi
      .fn()
      .mockImplementation(async (items: Record<string, unknown>) => {
        if (storageKeys.syncStatus in items) {
          syncStatusWriteAttempts += 1

          if (syncStatusWriteAttempts === 1) {
            throw new Error('paused status write failed')
          }
        }

        Object.assign(record, items)
      })

    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('chrome', {
      runtime: runtimeHarness.runtime,
      alarms: runtimeHarness.alarms,
      storage: {
        local: {
          get: vi.fn().mockImplementation(async (keys: string[] | string) => {
            const keyList = Array.isArray(keys) ? keys : [keys]

            return Object.fromEntries(
              keyList
                .filter((key) => key in record)
                .map((key) => [key, record[key]])
            )
          }),
          set: localSet,
          remove: localRemove,
        },
      },
    })

    registerDeterministicExtensionBackground({
      providerManifest: {
        id: 'openai',
        displayName: 'OpenAI',
        matches: ['https://example.com/*'],
        capabilities: ['usage'],
        debugSelectors: [],
      },
    })

    const listener = runtimeHarness.getMessageListener()

    await expect(
      dispatchSnapshotMessage(listener, snapshot)
    ).resolves.toMatchObject({
      ok: false,
      error: 'paused status write failed',
    })
    expect(syncStatusWriteAttempts).toBe(2)
    expect(record[storageKeys.syncStatus]).toMatchObject({
      provider: 'openai',
      status: 'error',
      snapshotCapturedAt: snapshot.capturedAt,
      error: 'paused status write failed',
    })
  })
})
