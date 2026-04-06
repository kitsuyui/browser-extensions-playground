import { describe, expect, it } from 'vitest'

import {
  createExtensionManifest,
  extractSnapshot,
  extractSnapshotFromUsageResponse,
  isAnthropicUsageResponse,
} from '.'
import { createPopupHtml } from './runtime'

describe('extractSnapshot', () => {
  it('extracts provider-specific usage metrics from page text', () => {
    const snapshot = extractSnapshot({
      url: 'https://claude.ai/',
      pageText: 'daily messages 15 / 50 weekly quota 70 / 200',
    })

    expect(snapshot?.provider).toBe('anthropic')
    expect(snapshot?.metrics).toHaveLength(2)
    expect(snapshot?.metrics[1]).toMatchObject({
      key: 'weekly',
      remaining: 70,
      limit: 200,
    })
  })

  it('extracts usage metrics with alternative label order and "of" format', () => {
    const snapshot = extractSnapshot({
      url: 'https://claude.ai/settings/usage',
      pageText:
        'Usage remaining 17 / 20 メッセージ, 日次 4/20, 15 of 50 weekly',
    })

    expect(snapshot).toMatchObject({
      metrics: [
        {
          key: 'usage',
          remaining: 17,
          limit: 20,
        },
        {
          key: 'daily',
          remaining: 4,
          limit: 20,
        },
        {
          key: 'weekly',
          remaining: 15,
          limit: 50,
        },
      ],
    })
  })

  it('extracts usage metrics when labels are in Japanese variants', () => {
    const snapshot = extractSnapshot({
      url: 'https://claude.ai/settings/usage',
      pageText: '使用量 12 / 20 週次 3 / 50 日次 4 / 20',
    })

    expect(snapshot?.metrics).toMatchObject([
      {
        key: 'usage',
        remaining: 12,
        limit: 20,
      },
      {
        key: 'weekly',
        remaining: 3,
        limit: 50,
      },
      {
        key: 'daily',
        remaining: 4,
        limit: 20,
      },
    ])
  })

  it('extracts usage metrics from English session and 7-day label variants', () => {
    const snapshot = extractSnapshot({
      url: 'https://claude.ai/settings/usage',
      pageText: 'Current session 4 / 20 7-day usage 15 / 50 extra account text',
    })

    expect(snapshot?.metrics).toMatchObject([
      {
        key: 'daily',
        remaining: 4,
        limit: 20,
      },
      {
        key: 'weekly',
        remaining: 15,
        limit: 50,
      },
    ])
  })

  it('creates a high-confidence snapshot from the Anthropic usage API', () => {
    const usage = {
      five_hour: {
        utilization: 12,
        resets_at: '2026-04-04T12:00:00.000Z',
      },
      seven_day: {
        utilization: 34,
        resets_at: null,
      },
      extra_usage: {
        is_enabled: true,
        monthly_limit: 2000,
        used_credits: 56,
        utilization: null,
      },
    }

    expect(isAnthropicUsageResponse(usage)).toBe(true)

    const snapshot = extractSnapshotFromUsageResponse(usage, {
      capturedAt: '2026-04-04T11:38:20.000Z',
    })

    expect(snapshot).toMatchObject({
      provider: 'anthropic',
      source: 'network',
      confidence: 'high',
      rawVersion: 'anthropic-usage-api-v1',
      metrics: [
        {
          key: 'five_hour',
          label: 'Current session',
          remaining: 12,
          limit: 100,
          unit: 'percent',
          resetsAt: '2026-04-04T12:00:00.000Z',
        },
        {
          key: 'seven_day',
          label: 'Weekly limits',
          remaining: 34,
          limit: 100,
          unit: 'percent',
        },
        {
          key: 'extra_usage_credits',
          label: 'Extra usage',
          remaining: 56,
          limit: 2000,
          unit: 'credits',
        },
      ],
    })
  })

  it('rejects objects that do not look like the Anthropic usage API', () => {
    expect(
      isAnthropicUsageResponse({
        usage: 10,
      })
    ).toBe(false)
  })

  it('skips extra usage metrics when the API returns null numeric values', () => {
    const usage = {
      five_hour: {
        utilization: 12,
        resets_at: '2026-04-04T12:00:00.000Z',
      },
      seven_day: null,
      extra_usage: {
        is_enabled: true,
        monthly_limit: null,
        used_credits: null,
        utilization: null,
      },
    }

    expect(isAnthropicUsageResponse(usage)).toBe(true)

    const snapshot = extractSnapshotFromUsageResponse(usage, {
      capturedAt: '2026-04-04T11:38:20.000Z',
    })

    expect(snapshot).toMatchObject({
      provider: 'anthropic',
      metrics: [
        {
          key: 'five_hour',
          remaining: 12,
          limit: 100,
        },
      ],
    })
    expect(snapshot?.metrics).toHaveLength(1)
  })
})

describe('createExtensionManifest', () => {
  it('limits host permissions to Anthropic pages and localhost ingest', () => {
    expect(createExtensionManifest().host_permissions).toEqual([
      'https://claude.ai/*',
      'https://console.anthropic.com/*',
      'http://127.0.0.1/*',
    ])
    expect(createExtensionManifest().permissions).toEqual([
      'alarms',
      'storage',
      'tabs',
    ])
    expect(createExtensionManifest().icons).toEqual({
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    })
    expect(createExtensionManifest().action).toEqual(
      expect.objectContaining({
        default_icon: {
          16: 'icon-16.png',
          32: 'icon-32.png',
          48: 'icon-48.png',
        },
      })
    )
  })
})

describe('createPopupHtml', () => {
  it('renders a read-only provider-specific popup', () => {
    const html = createPopupHtml()

    expect(html).toContain('Quota Anthropic')
    expect(html).toContain('Current session')
    expect(html).toContain('Weekly limits')
    expect(html).toContain('Extra usage')
    expect(html).toContain('Capture enabled')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('Enabled')
  })
})
