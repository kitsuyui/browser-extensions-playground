(function () {
  const messageType = 'quota-openai:wham-usage'
  const whamPathPrefix = '/backend-api/wham/'
  const originalFetch = window.fetch
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  function postPayload(payload: unknown, meta: unknown): void {
    window.postMessage(
      { type: messageType, payload, meta },
      window.location.origin
    )
  }

  function matchesUsage(input: unknown): boolean {
    return typeof input === 'string' && input.includes(whamPathPrefix)
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

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    ;(this as XMLHttpRequest & { __quotaOpenAiUrl?: unknown }).__quotaOpenAiUrl =
      url
    return originalOpen.call(this, method, url, ...rest)
  }

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
