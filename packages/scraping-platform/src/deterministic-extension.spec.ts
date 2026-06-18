import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createDeterministicExtensionManifest,
  DEFAULT_PERIODIC_CAPTURE_INTERVAL_MINUTES,
  getDeterministicExtensionStorageKeys,
  LEGACY_DETERMINISTIC_EXTENSION_STORAGE_KEYS,
  LEGACY_DETERMINISTIC_EXTENSION_STORAGE_MIGRATION,
  loadDeterministicExtensionStorageState,
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
      latestSnapshot: null,
      syncStatus: null,
    })
    expect(localSet).not.toHaveBeenCalled()
    expect(localRemove).not.toHaveBeenCalled()
  })
})
