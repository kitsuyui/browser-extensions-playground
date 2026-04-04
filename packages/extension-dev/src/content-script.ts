import {
  createExtensionCaptureFromDocument,
  findProviderForUrl,
} from '../../scraping-platform/src/index'

import type {
  DevCommand,
  DevCommandResult,
} from '../../scraping-server/src/protocol'

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

async function fetchJsonFromPage(command: Extract<DevCommand, { type: 'fetch-json' }>): Promise<unknown> {
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

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers: Object.fromEntries(response.headers.entries()),
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

chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (
    message.type !== 'scraping-devtools:run-command' ||
    !message.command ||
    !message.commandId
  ) {
    return
  }

  const provider = findProviderForUrl(window.location.href)

  if (!provider) {
    sendResponse(
      createResult(message.commandId, false, {
        error: 'No supported provider matched the current page.',
      })
    )
    return
  }

  if (message.command.type === 'capture-page') {
    sendResponse(
      createResult(message.commandId, true, {
        result: createExtensionCaptureFromDocument(provider, document),
      })
    )
    return
  }

  if (message.command.type === 'execute-script') {
    try {
      const result = runDangerousScript(message.command.source)
      sendResponse(
        createResult(message.commandId, true, {
          result: serializeValue(result),
        })
      )
    } catch (error) {
      sendResponse(
        createResult(message.commandId, false, {
          error: error instanceof Error ? error.message : 'unknown error',
        })
      )
    }
  }

  if (message.command.type === 'fetch-json') {
    void fetchJsonFromPage(message.command)
      .then((result) => {
        sendResponse(
          createResult(message.commandId, true, {
            result: serializeValue(result),
          })
        )
      })
      .catch((error) => {
        sendResponse(
          createResult(message.commandId, false, {
            error: error instanceof Error ? error.message : 'unknown error',
          })
        )
      })
  }

  return true
})
