;(() => {
  const messageType = 'quota-openai:wham-usage'
  const usageEndpointPath = '/backend-api/wham/usage'
  const originalFetch = window.fetch
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  function postPayload(payload: unknown, meta: unknown): void {
    window.postMessage(
      { type: messageType, payload, meta },
      window.location.origin
    )
  }

  function toPathname(input: unknown): string | null {
    if (typeof input !== 'string' || input.length === 0) {
      return null
    }

    try {
      return new URL(input, window.location.origin).pathname
    } catch {
      return null
    }
  }

  function matchesUsage(input: unknown): boolean {
    return toPathname(input) === usageEndpointPath
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    const url =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof Request
          ? args[0].url
          : undefined

    if (matchesUsage(url)) {
      const clone = response.clone()
      void clone
        .json()
        .then((payload) => {
          postPayload(payload, {
            transport: 'fetch',
            url,
            status: response.status,
          })
        })
        .catch(() => {})
    }

    return response
  }

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    ;(
      this as XMLHttpRequest & { __quotaOpenAiUrl?: unknown }
    ).__quotaOpenAiUrl = url

    if (async === undefined) {
      return (
        originalOpen as (
          this: XMLHttpRequest,
          method: string,
          url: string | URL
        ) => void
      ).call(this, method, url)
    }

    return (
      originalOpen as (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        async: boolean,
        username?: string | null,
        password?: string | null
      ) => void
    ).call(this, method, url, async, username, password)
  } as XMLHttpRequest['open']

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      const requestUrl = (
        this as XMLHttpRequest & { __quotaOpenAiUrl?: unknown }
      ).__quotaOpenAiUrl

      if (matchesUsage(requestUrl) && typeof this.responseText === 'string') {
        try {
          postPayload(JSON.parse(this.responseText), {
            transport: 'xhr',
            url: requestUrl,
            status: this.status,
          })
        } catch {}
      }
    })

    return originalSend.call(this, ...args)
  }
})()
