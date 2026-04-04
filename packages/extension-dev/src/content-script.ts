import {
  collectDomProbeMatches,
  createDomCapture,
} from '../../scraping-platform/src/index'

import type {
  DevCommand,
  DevCommandResult,
} from '../../scraping-server/src/protocol'
import { inferProviderId } from './providers'

declare const chrome:
  | {
      runtime?: {
        onMessage?: {
          addListener: (
            callback: (
              message: {
                readonly type?: string
                readonly commandId?: string
                readonly command?: DevCommand
              },
              sender: unknown,
              sendResponse: (response: unknown) => void
            ) => boolean | undefined
          ) => void
        }
      }
    }
  | undefined

function serializeValue(value: unknown): unknown {
  if (value === undefined) {
    return null
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

function runDangerousScript(source: string): unknown {
  const execute = new Function('document', 'window', source)
  return execute(document, window)
}

async function fetchJsonFromPage(
  command: Extract<DevCommand, { type: 'fetch-json' }>
): Promise<unknown> {
  const response = await fetch(command.url, {
    method: command.method ?? 'GET',
    headers: command.headers,
    body: command.body,
    credentials: 'include',
  })

  const text = await response.text()
  let json: unknown = null

  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }

  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers,
    body: json ?? text,
  }
}

function createResult(
  commandId: string,
  ok: boolean,
  payload: {
    readonly result?: unknown
    readonly error?: string
  }
): DevCommandResult {
  return {
    commandId,
    ok,
    ...payload,
  }
}

function createGenericCaptureFromDocument(): {
  readonly snapshot: null
  readonly domCapture: ReturnType<typeof createDomCapture>
} {
  const capturedAt = new Date().toISOString()
  const provider = inferProviderId(window.location.href)

  return {
    snapshot: null,
    domCapture: createDomCapture({
      provider,
      url: window.location.href,
      title: document.title,
      capturedAt,
      pageText: document.body?.innerText?.trim().slice(0, 20_000) ?? '',
      probeMatches: collectDomProbeMatches(document, [
        {
          key: 'main',
          label: 'Main content',
          selector: 'main, [role="main"], body',
        },
        {
          key: 'headline',
          label: 'Headline',
          selector: 'h1, h2, [data-testid]',
        },
      ]),
    }),
  }
}

chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  const commandId = message.commandId

  if (
    message.type !== 'scraping-devtools:run-command' ||
    !message.command ||
    !commandId
  ) {
    return
  }

  if (message.command.type === 'capture-page') {
    sendResponse(
      createResult(commandId, true, {
        result: createGenericCaptureFromDocument(),
      })
    )
    return
  }

  if (message.command.type === 'execute-script') {
    try {
      const result = runDangerousScript(message.command.source)
      sendResponse(
        createResult(commandId, true, {
          result: serializeValue(result),
        })
      )
    } catch (error) {
      sendResponse(
        createResult(commandId, false, {
          error: error instanceof Error ? error.message : 'unknown error',
        })
      )
    }
  }

  if (message.command.type === 'fetch-json') {
    void fetchJsonFromPage(message.command)
      .then((result) => {
        sendResponse(
          createResult(commandId, true, {
            result: serializeValue(result),
          })
        )
      })
      .catch((error) => {
        sendResponse(
          createResult(commandId, false, {
            error: error instanceof Error ? error.message : 'unknown error',
          })
        )
      })
  }

  return true
})
