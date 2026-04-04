import { extractSnapshot, providerManifest } from './index'

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (message: unknown) => Promise<unknown> | undefined
      }
    }
  | undefined

const MAX_CAPTURE_ATTEMPTS = 20
const RETRY_DELAY_MS = 1_000
const OBSERVER_TIMEOUT_MS = 20_000

let hasSentSnapshot = false

async function emitSnapshot(): Promise<boolean> {
  if (hasSentSnapshot) {
    return true
  }

  const snapshot = extractSnapshot({
    url: window.location.href,
    pageText: document.body?.innerText?.trim().slice(0, 20_000) ?? '',
  })

  if (!snapshot) {
    return false
  }

  await chrome?.runtime?.sendMessage?.({
    type: 'scraped-data:snapshot',
    snapshot,
  })

  hasSentSnapshot = true
  return true
}

function startCaptureLoop(): void {
  let attempts = 0
  const observer = new MutationObserver(() => {
    void emitSnapshot().then((sent) => {
      if (sent) {
        observer.disconnect()
      }
    })
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  const attemptCapture = () => {
    attempts += 1

    void emitSnapshot().then((sent) => {
      if (sent || attempts >= MAX_CAPTURE_ATTEMPTS) {
        observer.disconnect()
        return
      }

      window.setTimeout(attemptCapture, RETRY_DELAY_MS)
    })
  }

  attemptCapture()
  window.setTimeout(() => {
    observer.disconnect()
  }, OBSERVER_TIMEOUT_MS)
}

if (
  providerManifest.matches.some((pattern) =>
    window.location.href.startsWith(pattern.replace('*', ''))
  )
) {
  startCaptureLoop()
}
