export const SUPPORTED_PROVIDER_MATCH_PATTERNS = [
  'https://example.com/*',
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://claude.ai/*',
  'https://console.anthropic.com/*',
  'https://github.com/settings/copilot/*',
] as const

export function urlMatchesPattern(url: string, pattern: string): boolean {
  return url.startsWith(pattern.replace('*', ''))
}

export function isSupportedProviderUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  return SUPPORTED_PROVIDER_MATCH_PATTERNS.some((pattern) =>
    urlMatchesPattern(url, pattern)
  )
}

export function inferProviderId(url: string): string {
  if (
    url.startsWith('https://chatgpt.com/') ||
    url.startsWith('https://chat.openai.com/')
  ) {
    return 'openai'
  }

  if (
    url.startsWith('https://claude.ai/') ||
    url.startsWith('https://console.anthropic.com/')
  ) {
    return 'anthropic'
  }

  if (url.startsWith('https://github.com/settings/copilot/')) {
    return 'github-copilot'
  }

  if (url.startsWith('https://example.com/')) {
    return 'example-com'
  }

  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}
