import { expect, test } from './fixtures'

test('loads the MV3 service worker', async ({ extensionWorker }) => {
  expect(extensionWorker.url()).toContain('chrome-extension://')
  expect(extensionWorker.url()).toContain('/background.js')
})

test('opens the popup page', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await expect(page.getByText(/Server:/)).toBeVisible()
  await expect(page.getByText(/Remote control enabled/)).toBeVisible()
  await expect(page.getByText('Debug')).toBeVisible()
})
