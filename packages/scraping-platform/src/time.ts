export type IsoTimestampClock = {
  nowIso(): string
}

export const systemIsoTimestampClock: IsoTimestampClock = {
  nowIso: () => new Date().toISOString(),
}

export const isoTimestampClockGlobalKey = '__browserExtensionsIsoTimestampClock'

const explicitTimeZoneSuffixPattern = /(?:z|UTC|GMT|[+-]\d{2}:?\d{2})$/iu

type IsoTimestampClockGlobal = {
  readonly [isoTimestampClockGlobalKey]?: IsoTimestampClock
}

export function resolveIsoTimestampClock(
  scope: unknown = globalThis
): IsoTimestampClock {
  if (typeof scope !== 'object' || scope === null) {
    return systemIsoTimestampClock
  }

  const candidate = (scope as IsoTimestampClockGlobal)[
    isoTimestampClockGlobalKey
  ]

  if (candidate && typeof candidate.nowIso === 'function') {
    return candidate
  }

  return systemIsoTimestampClock
}

export function normalizeResetTimestamp(
  value: string | null | undefined
): string | undefined {
  const trimmedValue = value?.trim()

  if (!trimmedValue || !explicitTimeZoneSuffixPattern.test(trimmedValue)) {
    return undefined
  }

  const timestamp = new Date(trimmedValue)

  if (!Number.isFinite(timestamp.getTime())) {
    return undefined
  }

  return timestamp.toISOString()
}
