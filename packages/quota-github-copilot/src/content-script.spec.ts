import type { IsoTimestampClock } from '@kitsuyui/browser-extensions-scraping-platform'
import { afterEach, describe, expect, it, vi } from 'vitest'

const matchingUrl = 'https://github.com/settings/copilot/features'
const usageText =
  'Billing Premium requests used 4 / 50 for this month. Your entitlement renews on May 1, 2026 12:00 AM UTC.'

type DocumentStub = {
  body: { innerText: string }
  documentElement: Record<string, never>
}

type WindowStub = {
  location: { href: string }
  setTimeout: ReturnType<typeof vi.fn>
}

type ContentScriptHarness = {
  documentStub: DocumentStub
  emitSnapshot: typeof import('./content-script').emitSnapshot
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function fixedClock(): IsoTimestampClock {
  return { nowIso: () => '2026-05-01T00:00:00.000Z' }
}

async function loadContentScript({
  pageText = usageText,
  sendMessage = vi.fn().mockResolvedValue(undefined),
  storageSet = vi.fn().mockResolvedValue(undefined),
}: {
  pageText?: string
  sendMessage?: (message: unknown) => Promise<unknown> | undefined
  storageSet?: (items: Record<string, unknown>) => Promise<void> | void
} = {}): Promise<ContentScriptHarness> {
  vi.resetModules()

  const windowStub: WindowStub = {
    location: { href: 'https://example.com/settings' },
    setTimeout: vi.fn(),
  }
  const documentStub: DocumentStub = {
    body: { innerText: pageText },
    documentElement: {},
  }

  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    storage: { local: { set: storageSet } },
  })

  const { emitSnapshot } = await import('./content-script')
  windowStub.location.href = matchingUrl

  return { documentStub, emitSnapshot }
}

describe('emitSnapshot', () => {
  it('serializes concurrent snapshot emissions', async () => {
    let releaseStorage: (() => void) | undefined
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const storageSet = vi.fn((_items: Record<string, unknown>) => {
      return new Promise<void>((resolve) => {
        releaseStorage = resolve
      })
    })
    const { emitSnapshot } = await loadContentScript({
      sendMessage,
      storageSet,
    })

    const first = emitSnapshot(fixedClock())
    const second = emitSnapshot(fixedClock())

    expect(storageSet).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(releaseStorage).toBeDefined()

    releaseStorage?.()

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(storageSet).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledTimes(1)

    await expect(emitSnapshot(fixedClock())).resolves.toBe(true)
    expect(storageSet).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('clears the in-flight emission when no snapshot is available', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const storageSet = vi.fn().mockResolvedValue(undefined)
    const { documentStub, emitSnapshot } = await loadContentScript({
      pageText: 'plain GitHub account settings text without Copilot usage',
      sendMessage,
      storageSet,
    })

    await expect(
      Promise.all([emitSnapshot(fixedClock()), emitSnapshot(fixedClock())])
    ).resolves.toEqual([false, false])
    expect(storageSet).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()

    documentStub.body.innerText = usageText

    await expect(emitSnapshot(fixedClock())).resolves.toBe(true)
    expect(storageSet).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})
