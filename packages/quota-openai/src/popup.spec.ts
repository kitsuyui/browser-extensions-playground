import { afterEach, describe, expect, it, vi } from 'vitest'

type StorageChangedCallback = (
  changes: Record<string, unknown>,
  areaName: string
) => void

afterEach(() => {
  vi.unstubAllGlobals()
})

async function loadPopup(): Promise<void> {
  vi.resetModules()
  await import('./popup.ts')
}

describe('popup', () => {
  it('re-renders when chrome.storage.local changes', async () => {
    const onChangedListeners: StorageChangedCallback[] = []
    const localGet = vi.fn().mockResolvedValue({})

    vi.stubGlobal('HTMLElement', class {})
    vi.stubGlobal('HTMLInputElement', class {})
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: localGet, set: vi.fn().mockResolvedValue(undefined) },
        onChanged: {
          addListener: vi.fn((cb: StorageChangedCallback) => {
            onChangedListeners.push(cb)
          }),
        },
      },
    })
    vi.stubGlobal('document', { querySelector: vi.fn().mockReturnValue(null) })

    await loadPopup()

    expect(onChangedListeners).toHaveLength(1)

    localGet.mockClear()
    onChangedListeners[0]({}, 'local')
    expect(localGet).toHaveBeenCalledOnce()
  })

  it('does not re-render for non-local storage changes', async () => {
    const onChangedListeners: StorageChangedCallback[] = []
    const localGet = vi.fn().mockResolvedValue({})

    vi.stubGlobal('HTMLElement', class {})
    vi.stubGlobal('HTMLInputElement', class {})
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: localGet, set: vi.fn().mockResolvedValue(undefined) },
        onChanged: {
          addListener: vi.fn((cb: StorageChangedCallback) => {
            onChangedListeners.push(cb)
          }),
        },
      },
    })
    vi.stubGlobal('document', { querySelector: vi.fn().mockReturnValue(null) })

    await loadPopup()

    localGet.mockClear()
    onChangedListeners[0]({}, 'sync')
    expect(localGet).not.toHaveBeenCalled()
  })
})
