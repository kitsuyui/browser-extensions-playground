import { afterEach, describe, expect, it, vi } from 'vitest'

const usagePayload = { usage: 'ok' }

type PostedMessage = {
  readonly message: unknown
  readonly targetOrigin: string
}

type FakeXMLHttpRequestInstance = {
  responseText: string
  status: number
  terminalEvent: string
  open(method: string, url: string | URL): void
  send(): void
  dispatch(type: string): void
  listenerCount(type: string): number
}

function installPageGlobals() {
  class FakeXMLHttpRequest {
    responseText = ''
    status = 200
    terminalEvent = 'load'
    private readonly listeners = new Map<string, (() => void)[]>()

    addEventListener(type: string, listener: () => void): void {
      const listeners = this.listeners.get(type) ?? []
      listeners.push(listener)
      this.listeners.set(type, listeners)
    }

    removeEventListener(type: string, listener: () => void): void {
      const listeners = this.listeners.get(type) ?? []
      this.listeners.set(
        type,
        listeners.filter((candidate) => candidate !== listener)
      )
    }

    open(_method: string, _url: string | URL): void {}

    send(): void {
      this.dispatch(this.terminalEvent)
      if (this.terminalEvent !== 'loadend') {
        this.dispatch('loadend')
      }
    }

    dispatch(type: string): void {
      for (const listener of [...(this.listeners.get(type) ?? [])]) {
        listener()
      }
    }

    listenerCount(type: string): number {
      return this.listeners.get(type)?.length ?? 0
    }
  }

  const messages: PostedMessage[] = []
  const originalFetch = vi.fn(async () => ({
    status: 200,
    clone: () => ({
      json: async () => usagePayload,
    }),
  }))

  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  vi.stubGlobal('window', {
    fetch: originalFetch,
    location: {
      origin: 'https://chatgpt.com',
    },
    postMessage: (message: unknown, targetOrigin: string) => {
      messages.push({ message, targetOrigin })
    },
  })

  return { messages, originalFetch }
}

async function loadHook(): Promise<void> {
  vi.resetModules()
  await import('./page-hook.ts')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('page-hook', () => {
  it('captures fetch usage requests passed as URL objects', async () => {
    const { messages, originalFetch } = installPageGlobals()
    await loadHook()

    await window.fetch(
      new URL('/backend-api/wham/usage?source=test', 'https://chatgpt.com')
    )
    await Promise.resolve()

    expect(originalFetch).toHaveBeenCalledWith(
      new URL('/backend-api/wham/usage?source=test', 'https://chatgpt.com')
    )
    expect(messages).toEqual([
      {
        targetOrigin: 'https://chatgpt.com',
        message: {
          type: 'quota-openai:wham-usage',
          payload: usagePayload,
          meta: {
            transport: 'fetch',
            url: 'https://chatgpt.com/backend-api/wham/usage?source=test',
            status: 200,
          },
        },
      },
    ])
  })

  it('captures XMLHttpRequest usage requests passed as URL objects', async () => {
    const { messages } = installPageGlobals()
    await loadHook()

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequestInstance
    xhr.responseText = JSON.stringify(usagePayload)
    xhr.status = 201
    xhr.open(
      'GET',
      new URL('/backend-api/wham/usage?source=xhr', 'https://chatgpt.com')
    )
    xhr.send()

    expect(messages).toEqual([
      {
        targetOrigin: 'https://chatgpt.com',
        message: {
          type: 'quota-openai:wham-usage',
          payload: usagePayload,
          meta: {
            transport: 'xhr',
            url: 'https://chatgpt.com/backend-api/wham/usage?source=xhr',
            status: 201,
          },
        },
      },
    ])
  })

  it('ignores XMLHttpRequest URL objects outside the usage endpoint', async () => {
    const { messages } = installPageGlobals()
    await loadHook()

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequestInstance
    xhr.responseText = JSON.stringify(usagePayload)
    xhr.open('GET', new URL('/backend-api/other', 'https://chatgpt.com'))
    xhr.send()

    expect(messages).toEqual([])
  })

  it('removes XHR listeners when the request aborts before load', async () => {
    installPageGlobals()
    await loadHook()

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequestInstance
    xhr.open(
      'GET',
      new URL('/backend-api/wham/usage?source=abort', 'https://chatgpt.com')
    )
    xhr.terminalEvent = 'abort'

    XMLHttpRequest.prototype.send.call(xhr)

    expect(xhr.listenerCount('load')).toBe(0)
    expect(xhr.listenerCount('abort')).toBe(0)
    expect(xhr.listenerCount('error')).toBe(0)
    expect(xhr.listenerCount('timeout')).toBe(0)
    expect(xhr.listenerCount('loadend')).toBe(0)
  })

  it('removes XHR listeners when the request errors before load', async () => {
    installPageGlobals()
    await loadHook()

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequestInstance
    xhr.open(
      'GET',
      new URL('/backend-api/wham/usage?source=error', 'https://chatgpt.com')
    )
    xhr.terminalEvent = 'error'

    XMLHttpRequest.prototype.send.call(xhr)

    expect(xhr.listenerCount('load')).toBe(0)
    expect(xhr.listenerCount('abort')).toBe(0)
    expect(xhr.listenerCount('error')).toBe(0)
    expect(xhr.listenerCount('timeout')).toBe(0)
    expect(xhr.listenerCount('loadend')).toBe(0)
  })
})
