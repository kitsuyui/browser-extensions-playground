export type IsoTimestampClock = {
  nowIso(): string
}

export const systemIsoTimestampClock: IsoTimestampClock = {
  nowIso: () => new Date().toISOString(),
}

export const isoTimestampClockGlobalKey = '__browserExtensionsIsoTimestampClock'

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
