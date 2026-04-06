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

type CaptureState = {
  readonly updatedAt?: string
  readonly received?: boolean
  readonly pageUrl?: string
}

async function loadState(): Promise<{
  readonly latestSnapshot: Snapshot | null
  readonly syncStatus: Record<string, unknown> | null
  readonly enabled: boolean
  readonly captureState: CaptureState | null
}> {
  const record = (await chrome?.storage?.local?.get?.([
    'latestSnapshot',
    'syncStatus',
    DETERMINISTIC_EXTENSION_ENABLED_KEY,
    'githubCopilotCaptureState',
  ])) as Record<string, unknown> | undefined

  return {
    latestSnapshot: (record?.latestSnapshot as Snapshot | undefined) ?? null,
    syncStatus:
      (record?.syncStatus as Record<string, unknown> | undefined) ?? null,
    enabled: record?.[DETERMINISTIC_EXTENSION_ENABLED_KEY] !== false,
    captureState:
      (record?.githubCopilotCaptureState as CaptureState | undefined) ?? null,
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

function formatCaptureSummary(captureState: CaptureState | null): string {
  if (!captureState?.received) {
    return 'Not observed'
  }

  return 'DOM observed'
}

async function render(): Promise<void> {
  const state = await loadState()
  const metrics = state.latestSnapshot?.metrics ?? []

  setText(
    '#premium-used-value',
    formatMetric(
      metrics.find((metric) => metric.key === 'premium_requests_used_percent')
    )
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
  setText('#capture-summary', formatCaptureSummary(state.captureState))
  setText('#capture-detail', state.captureState?.pageUrl ?? '')
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
