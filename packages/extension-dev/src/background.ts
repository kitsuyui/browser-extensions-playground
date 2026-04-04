import { listProviderHostPermissions } from '../../scraping-platform/src/index'
import {
  type DevCommandEnvelope,
  type DevCommandResult,
  LOCAL_SERVER_DEVTOOLS_WS_URL,
} from '../../scraping-server/src/protocol'

declare const chrome:
  | {
      runtime?: {
        onInstalled?: { addListener: (callback: () => void) => void }
        onMessage?: {
          addListener: (
            callback: (
              message: { readonly type?: string; readonly enabled?: boolean },
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
        }
      }
      tabs?: {
        query?: (
          queryInfo: Record<string, unknown>
        ) => Promise<Array<{ id?: number; url?: string; active?: boolean }>>
        sendMessage?: (
          tabId: number,
          message: unknown
        ) => Promise<unknown> | undefined
      }
    }
  | undefined

type ServerMessage =
  | {
      readonly type: 'welcome'
      readonly clientId: string
      readonly warning: string
    }
  | ({
      readonly type: 'run-command'
    } & DevCommandEnvelope)

let socket: WebSocket | null = null
const RECONNECT_INITIAL_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000
const RECONNECT_JITTER_MS = 500
const HEARTBEAT_INTERVAL_MS = 15_000

let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const DEVTOOLS_EXTENSION_ENABLED_KEY = 'devtoolsExtensionEnabled'

function isProviderTab(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  return listProviderHostPermissions().some((pattern) =>
    url.startsWith(pattern.replace('*', ''))
  )
}

async function persistState(items: Record<string, unknown>): Promise<void> {
  await chrome?.storage?.local?.set?.(items)
}

async function isExtensionEnabled(): Promise<boolean> {
  const record = (await chrome?.storage?.local?.get?.(
    DEVTOOLS_EXTENSION_ENABLED_KEY
  )) as Record<string, unknown> | undefined

  return record?.[DEVTOOLS_EXTENSION_ENABLED_KEY] === true
}

function clearTimeoutIfNeeded(
  handle: ReturnType<typeof setTimeout> | null
): void {
  if (handle !== null) {
    globalThis.clearTimeout(handle)
  }
}

function clearIntervalIfNeeded(
  handle: ReturnType<typeof setInterval> | null
): void {
  if (handle !== null) {
    globalThis.clearInterval(handle)
  }
}

function startHeartbeat(connectedSocket: WebSocket): void {
  clearIntervalIfNeeded(heartbeatTimer)

  heartbeatTimer = globalThis.setInterval(() => {
    if (connectedSocket.readyState === WebSocket.OPEN) {
      connectedSocket.send(
        JSON.stringify({
          type: 'heartbeat',
        })
      )
    }
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat(): void {
  clearIntervalIfNeeded(heartbeatTimer)
  heartbeatTimer = null
}

function disconnectSocket(): void {
  stopHeartbeat()
  clearTimeoutIfNeeded(reconnectTimer)
  reconnectTimer = null

  if (socket) {
    socket.close()
    socket = null
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) {
    return
  }

  const delayMs = Math.min(
    reconnectDelayMs + Math.floor(Math.random() * RECONNECT_JITTER_MS),
    RECONNECT_MAX_DELAY_MS
  )
  reconnectTimer = globalThis.setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, delayMs)

  reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS)
}

async function pickTargetTabId(): Promise<number | null> {
  const tabs =
    (await chrome?.tabs?.query?.({
      url: listProviderHostPermissions(),
    })) ?? []

  const activeTab = tabs.find((tab) => tab.active && isProviderTab(tab.url))
  const targetTab = activeTab ?? tabs.find((tab) => isProviderTab(tab.url))

  return targetTab?.id ?? null
}

async function executeCommand(
  message: DevCommandEnvelope
): Promise<DevCommandResult> {
  const targetTabId = await pickTargetTabId()

  if (!targetTabId) {
    return {
      commandId: message.commandId,
      ok: false,
      error: 'No supported provider tab is open.',
    }
  }

  const response = await chrome?.tabs?.sendMessage?.(targetTabId, {
    type: 'scraping-devtools:run-command',
    commandId: message.commandId,
    command: message.command,
  })

  if (
    !response ||
    typeof response !== 'object' ||
    !('ok' in response) ||
    !('commandId' in response)
  ) {
    return {
      commandId: message.commandId,
      ok: false,
      error: 'The content script did not return a valid command result.',
    }
  }

  return response as DevCommandResult
}

async function connect(): Promise<void> {
  if (!(await isExtensionEnabled())) {
    disconnectSocket()
    await persistState({
      devtoolsConnectionState: 'disconnected',
    })
    return
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    return
  }

  if (socket && socket.readyState === WebSocket.CONNECTING) {
    return
  }

  clearTimeoutIfNeeded(reconnectTimer)
  reconnectTimer = null

  await persistState({
    devtoolsConnectionState: 'connecting',
  })

  const nextSocket = new WebSocket(LOCAL_SERVER_DEVTOOLS_WS_URL)
  socket = nextSocket

  nextSocket.addEventListener('open', () => {
    reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
    clearTimeoutIfNeeded(reconnectTimer)
    startHeartbeat(nextSocket)
    void persistState({
      devtoolsConnectionState: 'connected',
    })
    nextSocket.send(
      JSON.stringify({
        type: 'hello',
        extensionName: 'Scraping Devtools',
        extensionVersion: '0.0.0',
      })
    )
  })

  nextSocket.addEventListener('close', () => {
    stopHeartbeat()
    if (socket === nextSocket) {
      socket = null
    }
    void persistState({
      devtoolsConnectionState: 'disconnected',
    })
    void isExtensionEnabled().then((enabled) => {
      if (enabled) {
        scheduleReconnect()
      }
    })
  })

  nextSocket.addEventListener('error', () => {
    stopHeartbeat()
    if (socket === nextSocket) {
      socket = null
    }
    void persistState({
      devtoolsConnectionState: 'disconnected',
    })
    void isExtensionEnabled().then((enabled) => {
      if (enabled) {
        scheduleReconnect()
      }
    })
  })

  nextSocket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage

    if (message.type === 'welcome') {
      void persistState({
        devtoolsWelcomeWarning: message.warning,
      })
      return
    }

    if (message.type !== 'run-command') {
      return
    }

    void executeCommand(message).then((result) => {
      void persistState({
        devtoolsLastCommandResult: result,
      })
      nextSocket.send(
        JSON.stringify({
          type: 'command-result',
          ...result,
        })
      )
    })
  })
}

chrome?.runtime?.onInstalled?.addListener(() => {
  void persistState({
    [DEVTOOLS_EXTENSION_ENABLED_KEY]: false,
    devtoolsConnectionState: 'disconnected',
  })
})

chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'extension-dev:set-enabled') {
    return
  }

  void (async () => {
    await persistState({
      [DEVTOOLS_EXTENSION_ENABLED_KEY]: message.enabled !== false,
    })

    if (message.enabled === false) {
      disconnectSocket()
      await persistState({
        devtoolsConnectionState: 'disconnected',
      })
      sendResponse({
        ok: true,
        enabled: false,
      })
      return
    }

    reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
    await connect()
    sendResponse({
      ok: true,
      enabled: true,
    })
  })()

  return true
})

void connect()
