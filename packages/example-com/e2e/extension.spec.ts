import { expect, test } from './fixtures'

test('capture-page succeeds against example.com through the devtools channel', async ({
  page,
  devtools,
  devClientId,
}) => {
  await page.goto('https://example.com/')

  await expect
    .poll(async () =>
      devtools.runDevCommand({
        targetClientId: devClientId,
        command: {
          type: 'capture-page',
        },
      })
    )
    .toMatchObject({
      ok: true,
      result: {
        domCapture: {
          provider: 'example-com',
          title: 'Example Domain',
        },
        snapshot: {
          provider: 'example-com',
          rawVersion: 'example-com-dom-v1',
        },
      },
    })
})

test('example.com extension ingests a snapshot into the scraping server', async ({
  page,
  serverUrl,
}) => {
  const previousSnapshotResponse = await fetch(
    `${serverUrl}/api/snapshots/latest?provider=example-com`
  )
  const previousSnapshot = (await previousSnapshotResponse.json()) as {
    capturedAt?: string
  } | null

  await page.goto('https://example.com/')

  await expect
    .poll(async () => {
      const response = await fetch(
        `${serverUrl}/api/snapshots/latest?provider=example-com`
      )
      const snapshot = (await response.json()) as {
        capturedAt?: string
        metrics?: unknown[]
        provider?: string
        rawVersion?: string
      } | null

      if (!snapshot) {
        return false
      }

      if (snapshot.provider !== 'example-com') {
        return false
      }

      if (snapshot.rawVersion !== 'example-com-dom-v1') {
        return false
      }

      if (snapshot.capturedAt === previousSnapshot?.capturedAt) {
        return false
      }

      return (snapshot.metrics ?? []).some(
        (metric) =>
          typeof metric === 'object' &&
          metric !== null &&
          'key' in metric &&
          'remaining' in metric &&
          metric.key === 'example_domain_present' &&
          metric.remaining === 1
      )
    })
    .toBe(true)
})
