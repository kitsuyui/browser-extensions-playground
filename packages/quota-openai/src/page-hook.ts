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

  function toUrlString(input: unknown): string | null {
    if (typeof input === 'string') {
      return input.length === 0 ? null : input
    }

    if (input instanceof URL) {
      return input.href
    }

    if (input instanceof Request) {
      return input.url
    }

    return null
  }

  function toPathname(input: unknown): string | null {
    const url = toUrlString(input)

    if (url === null) {
      return null
    }

    try {
      return new URL(url, window.location.origin).pathname
    } catch {
      return null
    }
  }

  function matchesUsage(input: unknown): boolean {
    return toPathname(input) === usageEndpointPath
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    const url = toUrlString(args[0]) ?? undefined

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
        .catch((e: unknown) => {
          console.debug(
            '[quota-openai] failed to parse WHAM usage fetch response as JSON',
            {
              url,
              status: response.status,
              error: e,
            }
          )
        })
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
      const requestUrl = toUrlString(
        (this as XMLHttpRequest & { __quotaOpenAiUrl?: unknown })
          .__quotaOpenAiUrl
      )

      if (matchesUsage(requestUrl) && typeof this.responseText === 'string') {
        try {
          postPayload(JSON.parse(this.responseText), {
            transport: 'xhr',
            url: requestUrl,
            status: this.status,
          })
        } catch (e: unknown) {
          console.debug(
            '[quota-openai] failed to parse WHAM usage XHR response as JSON',
            {
              url: requestUrl,
              status: this.status,
              error: e,
            }
          )
        }
      }
    })

    return originalSend.call(this, ...args)
  }
})()
