import { extractSnapshot, providerManifest } from './index'

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (message: unknown) => Promise<unknown> | undefined
      }
    }
  | undefined

async function emitSnapshot(): Promise<void> {
  const snapshot = extractSnapshot({
    url: window.location.href,
    pageText: document.body?.innerText?.trim().slice(0, 20_000) ?? '',
  })

  if (!snapshot) {
    return
  }

  await chrome?.runtime?.sendMessage?.({
    type: 'scraped-data:snapshot',
    snapshot,
  })
}

if (
  providerManifest.matches.some((pattern) =>
    window.location.href.startsWith(pattern.replace('*', ''))
  )
) {
  void emitSnapshot()
  window.setTimeout(() => {
    void emitSnapshot()
  }, 2_000)
}
