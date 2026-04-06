import { extractSnapshot, providerManifest } from './index'

declare const chrome:
  | {
      storage?: {
        local?: {
          set?: (items: Record<string, unknown>) => Promise<void> | void
        }
      }
      runtime?: {
        sendMessage?: (message: unknown) => Promise<unknown> | undefined
      }
    }
  | undefined

const CAPTURE_STATE_KEY = 'githubCopilotCaptureState'
const MAX_CAPTURE_ATTEMPTS = 20
const RETRY_DELAY_MS = 1_000
const OBSERVER_TIMEOUT_MS = 20_000

let hasSentSnapshot = false

function getPageText(): string {
  return (document.body?.innerText ?? '').trim().slice(0, 20_000)
}

async function emitSnapshot(): Promise<boolean> {
  if (hasSentSnapshot) {
    return true
  }

  await chrome?.storage?.local?.set?.({
    [CAPTURE_STATE_KEY]: {
      updatedAt: new Date().toISOString(),
      received: true,
      pageUrl: window.location.href,
    },
  })

  const snapshot = extractSnapshot({
    url: window.location.href,
    pageText: getPageText(),
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
