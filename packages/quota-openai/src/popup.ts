import {
  DETERMINISTIC_EXTENSION_ENABLED_KEY,
} from '../../scraping-platform/src/deterministic-extension'

declare const chrome:
  | {
      storage?: {
        local?: {
          get: (
            keys: string[] | string
          ) => Promise<Record<string, unknown>> | Record<string, unknown>
          set: (items: Record<string, unknown>) => Promise<void> | void
        }
      }
    }
  | undefined

type Metric = {
  readonly key: string
  readonly remaining?: number
  readonly limit?: number
  readonly unit?: string
}

type Snapshot = {
  readonly metrics?: readonly Metric[]
}

type HookState = {
  readonly updatedAt?: string
  readonly received?: boolean
  readonly meta?: {
    readonly url?: string
    readonly status?: number
    readonly transport?: string
  }
  readonly events?: readonly {
    readonly updatedAt?: string
    readonly meta?: {
      readonly url?: string
      readonly status?: number
      readonly transport?: string
    }
  }[]
}

async function loadState(): Promise<{
  readonly latestSnapshot: Snapshot | null
  readonly syncStatus: Record<string, unknown> | null
  readonly enabled: boolean
  readonly hookState: HookState | null
}> {
  const record = (await chrome?.storage?.local?.get?.([
    'latestSnapshot',
    'syncStatus',
    DETERMINISTIC_EXTENSION_ENABLED_KEY,
    'openAiWhamUsageHookState',
  ])) as Record<string, unknown> | undefined

  return {
    latestSnapshot: (record?.latestSnapshot as Snapshot | undefined) ?? null,
    syncStatus: (record?.syncStatus as Record<string, unknown> | undefined) ?? null,
    enabled: record?.[DETERMINISTIC_EXTENSION_ENABLED_KEY] !== false,
    hookState:
      (record?.openAiWhamUsageHookState as HookState | undefined) ?? null,
  }
}

function setText(selector: string, value: string): void {
  const element = document.querySelector(selector)

  if (element instanceof HTMLElement) {
    element.textContent = value
  }
}

function formatMetric(metric: Metric | undefined): string {
  if (!metric || typeof metric.remaining !== 'number') {
    return 'Unavailable'
  }

  if (metric.unit === 'percent') {
    return `${metric.remaining}% used`
  }

  if (typeof metric.limit === 'number') {
    return `${metric.remaining} / ${metric.limit}`
  }

  return String(metric.remaining)
}

function renderEnabledState(enabled: boolean): void {
  const toggle = document.querySelector('#toggle-enabled')
  const badge = document.querySelector('#capture-status')

  if (toggle instanceof HTMLInputElement) {
    toggle.checked = enabled
  }

  if (badge instanceof HTMLElement) {
    badge.textContent = enabled ? 'Enabled' : 'Disabled'
    badge.dataset.enabled = String(enabled)
  }
}

function formatHookSummary(hookState: HookState | null): string {
  const recentEvent =
    hookState?.events && hookState.events.length > 0
      ? hookState.events[hookState.events.length - 1]
      : null
  const meta = hookState?.meta ?? recentEvent?.meta

  if (!hookState?.received && !recentEvent) {
    return 'Not observed'
  }

  return `${String(meta?.transport ?? 'request')} ${String(
    meta?.status ?? 'unknown'
  )}`
}

function formatHookUrls(hookState: HookState | null): string {
  const urls = [
    ...(hookState?.events ?? []).map((event) => event.meta?.url),
    hookState?.meta?.url,
  ].filter((url): url is string => typeof url === 'string' && url.length > 0)

  const uniqueUrls = [...new Set(urls)]

  if (uniqueUrls.length === 0) {
    return ''
  }

  return uniqueUrls.slice(-3).join(', ')
}

async function render(): Promise<void> {
  const state = await loadState()
  const metrics = state.latestSnapshot?.metrics ?? []

  setText(
    '#codex-5h-value',
    formatMetric(metrics.find((metric) => metric.key === 'codex_5h'))
  )
  setText(
    '#codex-weekly-value',
    formatMetric(metrics.find((metric) => metric.key === 'codex_weekly'))
  )
  setText(
    '#credits-value',
    formatMetric(metrics.find((metric) => metric.key === 'credits_remaining'))
  )

  const syncSummary =
    state.syncStatus?.status === 'paused'
      ? 'Paused'
      : state.syncStatus?.status === 'success'
        ? 'Synced'
        : state.syncStatus?.status === 'error'
          ? `Error: ${String(state.syncStatus.error ?? 'unknown')}`
          : 'Waiting'

  setText('#sync-summary', syncSummary)
  setText('#hook-summary', formatHookSummary(state.hookState))
  setText('#hook-detail', formatHookUrls(state.hookState))
  renderEnabledState(state.enabled)
}

void render()

const toggle = document.querySelector('#toggle-enabled')

if (toggle instanceof HTMLInputElement) {
  toggle.addEventListener('change', () => {
    void (async () => {
      const nextEnabled = toggle.checked

      await chrome?.storage?.local?.set?.({
        [DETERMINISTIC_EXTENSION_ENABLED_KEY]: nextEnabled,
      })

      renderEnabledState(nextEnabled)
      await render()
    })()
  })
}
