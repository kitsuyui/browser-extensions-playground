import { describe, expect, it } from 'vitest'

import {
  createExtensionManifest,
  extractSnapshot,
  extractSnapshotFromWhamUsageResponse,
  isOpenAIWhamUsageResponse,
} from '.'
import { createPopupHtml } from './runtime'

describe('extractSnapshot', () => {
  it('extracts Codex usage percentages and remaining credits from Japanese page text', () => {
    const snapshot = extractSnapshot({
      url: 'https://chatgpt.com/codex/settings/usage',
      pageText:
        '5時間の使用制限 98% 残り リセット：21:04 週あたりの使用制限 97% 残り リセット：2026/04/08 22:42 残りのクレジット 0',
    })

    expect(snapshot?.provider).toBe('openai')
    expect(snapshot?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'codex_5h',
          label: 'Codex 5h',
          remaining: 98,
          limit: 100,
          unit: 'percent',
          resetsAt: '21:04',
        }),
        expect.objectContaining({
          key: 'codex_weekly',
          label: 'Codex weekly',
          remaining: 97,
          limit: 100,
          unit: 'percent',
          resetsAt: '2026/04/08 22:42',
        }),
        expect.objectContaining({
          key: 'credits_remaining',
          label: 'Credits remaining',
          remaining: 0,
          unit: 'credits',
        }),
      ])
    )
  })

  it('extracts Codex usage percentages and credits from English page text', () => {
    const snapshot = extractSnapshot({
      url: 'https://chatgpt.com/codex/settings/usage',
      pageText:
        '5-hour limit 89% remaining reset at 9:04 PM Weekly limit 95% remaining reset at Apr 8, 10:42 PM GPT-5.3-Codex-Spark 5-hour limit 95% remaining reset at Apr 5, 1:20 AM GPT-5.3-Codex-Spark weekly limit 98% remaining reset at Apr 11, 8:20 PM Code review 100% remaining Credits remaining 0',
    })

    expect(snapshot?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'codex_5h',
          label: 'Codex 5h',
          remaining: 89,
          limit: 100,
          unit: 'percent',
          resetsAt: '9:04 PM',
        }),
        expect.objectContaining({
          key: 'codex_weekly',
          label: 'Codex weekly',
          remaining: 95,
          limit: 100,
          unit: 'percent',
          resetsAt: 'Apr 8, 10:42 PM',
        }),
        expect.objectContaining({
          key: 'spark_5h',
          label: 'Spark 5h',
          remaining: 95,
          limit: 100,
          unit: 'percent',
          resetsAt: 'Apr 5, 1:20 AM',
        }),
        expect.objectContaining({
          key: 'spark_weekly',
          label: 'Spark weekly',
          remaining: 98,
          limit: 100,
          unit: 'percent',
          resetsAt: 'Apr 11, 8:20 PM',
        }),
        expect.objectContaining({
          key: 'code_review',
          label: 'Code review',
          remaining: 100,
          limit: 100,
          unit: 'percent',
        }),
        expect.objectContaining({
          key: 'credits_remaining',
          label: 'Credits remaining',
          remaining: 0,
          unit: 'credits',
        }),
      ])
    )
  })

  it('returns null when the current Codex usage markers are absent', () => {
    expect(
      extractSnapshot({
        url: 'https://chatgpt.com/',
        pageText: 'plain account settings text without codex usage markers',
      })
    ).toBeNull()
  })

  it('creates a high-confidence snapshot from the WHAM usage response', () => {
    const usage = {
      user_id: 'user-1',
      account_id: 'user-1',
      email: 'openai-quota-fixture@example.invalid',
      plan_type: 'pro',
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 18_000,
          reset_after_seconds: 17_390,
          reset_at: 1_775_322_281,
        },
        secondary_window: {
          used_percent: 6,
          limit_window_seconds: 604_800,
          reset_after_seconds: 350_830,
          reset_at: 1_775_655_721,
        },
      },
      code_review_rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 604_800,
          reset_after_seconds: 604_800,
          reset_at: 1_775_909_692,
        },
        secondary_window: null,
      },
      additional_rate_limits: [
        {
          limit_name: 'GPT-5.3-Codex-Spark',
          metered_feature: 'codex_bengalfox',
          rate_limit: {
            allowed: true,
            limit_reached: false,
            primary_window: {
              used_percent: 5,
              limit_window_seconds: 18_000,
              reset_after_seconds: 14_728,
              reset_at: 1_775_319_620,
            },
            secondary_window: {
              used_percent: 2,
              limit_window_seconds: 604_800,
              reset_after_seconds: 601_528,
              reset_at: 1_775_906_420,
            },
          },
        },
      ],
      credits: {
        has_credits: false,
        unlimited: false,
        balance: '0',
      },
    }

    expect(isOpenAIWhamUsageResponse(usage)).toBe(true)

    const snapshot = extractSnapshotFromWhamUsageResponse(usage, {
      capturedAt: '2026-04-04T12:00:00.000Z',
    })

    expect(snapshot).toMatchObject({
      provider: 'openai',
      source: 'network',
      confidence: 'high',
      rawVersion: 'openai-wham-usage-v1',
      accountLabel: 'openai-quota-fixture@example.invalid',
      metrics: [
        {
          key: 'codex_5h',
          label: 'Codex 5h',
          remaining: 0,
          limit: 100,
          unit: 'percent',
          resetsAt: '2026-04-04T17:04:41.000Z',
        },
        {
          key: 'codex_weekly',
          label: 'Codex weekly',
          remaining: 6,
          limit: 100,
          unit: 'percent',
          resetsAt: '2026-04-08T13:42:01.000Z',
        },
        {
          key: 'code_review',
          label: 'Code review',
          remaining: 0,
          limit: 100,
          unit: 'percent',
          resetsAt: '2026-04-11T12:14:52.000Z',
        },
        {
          key: 'spark_5h',
          label: 'Spark 5h',
          remaining: 5,
          limit: 100,
          unit: 'percent',
          resetsAt: '2026-04-04T16:20:20.000Z',
        },
        {
          key: 'spark_weekly',
          label: 'Spark weekly',
          remaining: 2,
          limit: 100,
          unit: 'percent',
          resetsAt: '2026-04-11T11:20:20.000Z',
        },
        {
          key: 'credits_remaining',
          label: 'Credits remaining',
          remaining: 0,
          unit: 'credits',
        },
      ],
    })
  })
})

describe('createExtensionManifest', () => {
  it('limits host permissions to OpenAI pages and localhost ingest', () => {
    expect(createExtensionManifest().host_permissions).toEqual([
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'http://127.0.0.1/*',
    ])
    expect(createExtensionManifest().permissions).toEqual([
      'alarms',
      'storage',
      'tabs',
    ])
    expect(createExtensionManifest().content_scripts).toEqual([
      expect.objectContaining({
        run_at: 'document_start',
      }),
    ])
    expect(createExtensionManifest().web_accessible_resources).toEqual([
      expect.objectContaining({
        resources: ['page-hook.js'],
      }),
    ])
  })
})

describe('createPopupHtml', () => {
  it('renders a read-only provider-specific popup', () => {
    const html = createPopupHtml()

    expect(html).toContain('Quota OpenAI')
    expect(html).toContain('Codex 5h')
    expect(html).toContain('Codex weekly')
    expect(html).toContain('Credits')
    expect(html).toContain('Debug')
    expect(html).toContain('WHAM hook')
    expect(html).toContain('Capture enabled')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('Enabled')
  })
})
