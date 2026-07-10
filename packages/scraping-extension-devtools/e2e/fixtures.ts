import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  type Worker,
} from '@playwright/test'

export const test = base.extend<{
  context: BrowserContext
  extensionId: string
  extensionWorker: Worker
  page: Page
}>({
  context: async ({ browserName: _browserName }, use) => {
    const pathToExtension = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'dist'
    )
    const userDataDir = await mkdtemp(
      path.join(os.tmpdir(), 'scraping-devtools-playwright-')
    )
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })

    await use(context)
    await context.close()
    await rm(userDataDir, { recursive: true, force: true })
  },
  extensionWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers()

    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker')
    }

    await use(serviceWorker)
  },
  extensionId: async ({ extensionWorker }, use) => {
    const extensionId = extensionWorker.url().split('/')[2]
    await use(extensionId)
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
})

export const expect = test.expect
