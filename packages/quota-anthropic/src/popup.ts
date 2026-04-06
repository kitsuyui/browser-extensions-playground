import { DETERMINISTIC_EXTENSION_ENABLED_KEY } from '../../scraping-platform/src/deterministic-extension'

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
          set: (items: Record<string, unknown>) => Promise<void> | void
        }
      }
    }
  | undefined

type Metric = {
  readonly key: string
  readonly label: string
  readonly remaining?: number
  readonly limit?: number
  readonly unit?: string
}

type Snapshot = {
  readonly metrics?: readonly Metric[]
}

type UsageApiState = {
  readonly updatedAt?: string
  readonly received?: boolean
  readonly meta?: {
    readonly url?: string
    readonly status?: number
  }
  readonly events?: readonly {
    readonly updatedAt?: string
    readonly meta?: {
      readonly url?: string
      readonly status?: number
    }
  }[]
}

async function loadState(): Promise<{
  readonly latestSnapshot: Snapshot | null
  readonly syncStatus: Record<string, unknown> | null
  readonly enabled: boolean
  readonly usageApiState: UsageApiState | null
}> {
  const record = (await chrome?.storage?.local?.get?.([
    'latestSnapshot',
    'syncStatus',
    DETERMINISTIC_EXTENSION_ENABLED_KEY,
    'anthropicUsageApiState',
  ])) as Record<string, unknown> | undefined

  return {
    latestSnapshot: (record?.latestSnapshot as Snapshot | undefined) ?? null,
    syncStatus:
      (record?.syncStatus as Record<string, unknown> | undefined) ?? null,
    enabled: record?.[DETERMINISTIC_EXTENSION_ENABLED_KEY] !== false,
    usageApiState:
      (record?.anthropicUsageApiState as UsageApiState | undefined) ?? null,
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

function setText(selector: string, value: string): void {
  const element = document.querySelector(selector)

  if (element instanceof HTMLElement) {
    element.textContent = value
  }
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

function formatUsageApiSummary(usageApiState: UsageApiState | null): string {
  const recentEvent =
    usageApiState?.events && usageApiState.events.length > 0
      ? usageApiState.events[usageApiState.events.length - 1]
      : null
  const meta = usageApiState?.meta ?? recentEvent?.meta

  if (!usageApiState?.received && !recentEvent) {
    return 'Not observed'
  }

  return `fetch ${String(meta?.status ?? 'unknown')}`
}

function formatUsageApiUrls(usageApiState: UsageApiState | null): string {
  const urls = [
    ...(usageApiState?.events ?? []).map((event) => event.meta?.url),
    usageApiState?.meta?.url,
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
    '#current-session-value',
    formatMetric(metrics.find((metric) => metric.key === 'five_hour'))
  )
  setText(
    '#weekly-limits-value',
    formatMetric(metrics.find((metric) => metric.key === 'seven_day'))
  )
  setText(
    '#extra-usage-value',
    formatMetric(metrics.find((metric) => metric.key === 'extra_usage_credits'))
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
  setText('#usage-api-summary', formatUsageApiSummary(state.usageApiState))
  setText('#usage-api-detail', formatUsageApiUrls(state.usageApiState))
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
