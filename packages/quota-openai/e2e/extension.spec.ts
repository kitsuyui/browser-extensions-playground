import { expect, test } from './fixtures'

test('loads the MV3 service worker', async ({ extensionWorker }) => {
  expect(extensionWorker.url()).toContain('chrome-extension://')
  expect(extensionWorker.url()).toContain('/background.js')
})

test('opens the provider-specific popup page', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await expect(page.getByText(/Quota OpenAI/)).toBeVisible()
  await expect(page.getByText('Capture enabled')).toBeVisible()
  await expect(page.getByText('Codex 5h')).toBeVisible()
  await expect(page.getByText('Credits remaining')).toBeVisible()
})
