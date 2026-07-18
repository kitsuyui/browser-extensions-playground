export function serializeLoggedError(
  error: unknown,
  fallback: string
): {
  readonly error: string
  readonly errorName?: string
  readonly errorStack?: string
} {
  if (error instanceof Error) {
    return {
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
    }
  }

  return {
    error:
      error === null || error === undefined
        ? fallback
        : typeof error === 'string' && error.length > 0
          ? error
          : String(error),
  }
}

export function logExtensionWarning(
  scope: string,
  message: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  console.warn(`[${scope}] ${message}`, {
    ...context,
    ...serializeLoggedError(error, 'unknown warning'),
  })
}

export function logExtensionError(
  scope: string,
  message: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  console.error(`[${scope}] ${message}`, {
    ...context,
    ...serializeLoggedError(error, 'unknown error'),
  })
}
