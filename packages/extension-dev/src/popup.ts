declare const chrome:
  | {
      runtime?: {
        sendMessage?: (message: unknown) => Promise<unknown> | undefined
      }
      storage?: {
        local?: {
          get: (
            keys: string[] | string
          ) => Promise<Record<string, unknown>> | Record<string, unknown>
        }
      }
    }
  | undefined

type ConnectionState = 'connecting' | 'connected' | 'disconnected'
let latestCommandResultJson = 'null'

async function loadState(): Promise<{
  readonly connectionState: ConnectionState
  readonly lastCommandResult: unknown
  readonly enabled: boolean
}> {
  const record = (await chrome?.storage?.local?.get?.([
    'devtoolsConnectionState',
    'devtoolsLastCommandResult',
    'devtoolsExtensionEnabled',
  ])) as Record<string, unknown> | undefined

  return {
    connectionState:
      (record?.devtoolsConnectionState as ConnectionState | undefined) ??
      'disconnected',
    lastCommandResult: record?.devtoolsLastCommandResult ?? null,
    enabled: record?.devtoolsExtensionEnabled === true,
  }
}

function updateConnectionState(connectionState: ConnectionState): void {
  const connectionDot = document.querySelector('#connection-dot')
  const connectionLabel = document.querySelector('#connection-label')

  if (connectionDot instanceof HTMLElement) {
    connectionDot.dataset.state = connectionState
  }

  if (!(connectionLabel instanceof HTMLElement)) {
    return
  }

  if (connectionState === 'connected') {
    connectionLabel.textContent = 'Devtools: connected'
    return
  }

  if (connectionState === 'disconnected') {
    connectionLabel.textContent = 'Devtools: disconnected'
    return
  }

  connectionLabel.textContent = 'Devtools: connecting'
}

void loadState().then((state) => {
  updateConnectionState(state.connectionState)

  const toggle = document.querySelector('#toggle-enabled')

  if (toggle instanceof HTMLInputElement) {
    toggle.checked = state.enabled
  }

  const commandResult = document.querySelector('#last-command-result')

  if (commandResult instanceof HTMLElement) {
    latestCommandResultJson = JSON.stringify(state.lastCommandResult, null, 2)
    commandResult.textContent = latestCommandResultJson
  }
})

const toggle = document.querySelector('#toggle-enabled')

if (toggle instanceof HTMLInputElement) {
  toggle.addEventListener('change', () => {
    void (async () => {
      const nextEnabled = toggle.checked

      await chrome?.runtime?.sendMessage?.({
        type: 'extension-dev:set-enabled',
        enabled: nextEnabled,
      })

      updateConnectionState(nextEnabled ? 'connecting' : 'disconnected')
    })()
  })
}

const copyButton = document.querySelector('#copy-command-result')

if (copyButton instanceof HTMLButtonElement) {
  copyButton.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(latestCommandResultJson)
        copyButton.textContent = 'Copied'
      } catch {
        copyButton.textContent = 'Copy failed'
      }

      globalThis.setTimeout(() => {
        copyButton.textContent = 'Copy JSON'
      }, 1_500)
    })()
  })
}

export {}
