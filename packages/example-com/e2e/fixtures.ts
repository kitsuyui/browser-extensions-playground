import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  expect as playwrightExpect,
  type Worker,
} from '@playwright/test'

import { createScrapingDevtoolsTools } from '../../scraping-devtools/src/index'
import { createScrapingServer } from '../../scraping-server/src/index'

const SERVER_URL = 'http://127.0.0.1:3929'

async function assertReusableServer(): Promise<void> {
  const response = await fetch(`${SERVER_URL}/health`)

  if (!response.ok) {
    throw new Error(
      `Port 3929 is already in use and ${SERVER_URL}/health returned ${response.status}.`
    )
  }
}

async function waitForNewDevClient(
  devtools: ReturnType<typeof createScrapingDevtoolsTools>,
  baselineDevClientIds: readonly string[]
): Promise<string> {
  const baselineClientIds = new Set(baselineDevClientIds)
  const timeoutAt = Date.now() + 10_000

  while (Date.now() < timeoutAt) {
    const clients = await devtools.listDevClients()
    const clientId =
      clients.find(
        (client) =>
          !baselineClientIds.has(client.clientId) &&
          client.extensionName === 'Scraping Devtools'
      )?.clientId ?? null

    if (clientId) {
      return clientId
    }

    await new Promise((resolve) => globalThis.setTimeout(resolve, 250))
  }

  throw new Error(
    'Timed out waiting for a newly connected Scraping Devtools client.'
  )
}

async function findExtensionWorkerByName(
  context: BrowserContext,
  extensionName: string
): Promise<Worker> {
  const timeoutAt = Date.now() + 10_000

  while (Date.now() < timeoutAt) {
    for (const worker of context.serviceWorkers()) {
      const manifestName = await worker
        .evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                chrome: { runtime: { getManifest: () => { name: string } } }
              }
            ).chrome.runtime.getManifest().name
        )
        .catch(() => null)

      if (manifestName === extensionName) {
        return worker
      }
    }

    await new Promise((resolve) => globalThis.setTimeout(resolve, 100))
  }

  throw new Error(`Timed out waiting for extension worker: ${extensionName}`)
}

async function enableDevtoolsExtension(context: BrowserContext): Promise<void> {
  const worker = await findExtensionWorkerByName(context, 'Scraping Devtools')

  await worker.evaluate(async () => {
    await new Promise<void>((resolve) => {
      ;(
        globalThis as typeof globalThis & {
          chrome: {
            runtime: {
              sendMessage: (message: unknown, callback: () => void) => void
            }
          }
        }
      ).chrome.runtime.sendMessage(
        {
          type: 'extension-dev:set-enabled',
          enabled: true,
        },
        () => resolve()
      )
    })
  })
}

export const test = base.extend<{
  baselineDevClientIds: readonly string[]
  context: BrowserContext
  devtools: ReturnType<typeof createScrapingDevtoolsTools>
  devClientId: string
  page: Page
  serverUrl: string
}>({
  baselineDevClientIds: async ({ browserName: _browserName }, use) => {
    const devtools = createScrapingDevtoolsTools(SERVER_URL)
    const clients = await devtools.listDevClients().catch(() => [])
    await use(clients.map((client) => client.clientId))
  },
  context: async (
    { baselineDevClientIds: _baselineDevClientIds, browserName: _browserName },
    use
  ) => {
    const extensionDevPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'extension-dev',
      'dist'
    )
    const exampleComPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'dist'
    )
    const userDataDir = await mkdtemp(
      path.join(os.tmpdir(), 'example-com-playwright-')
    )
    const storeDir = await mkdtemp(
      path.join(os.tmpdir(), 'scraping-server-playwright-')
    )
    const server = createScrapingServer({
      host: '127.0.0.1',
      port: 3929,
      storeFile: path.join(storeDir, 'deterministic.json'),
    })
    let startedServer = false

    try {
      await server.listen()
      startedServer = true
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error ? String(error.code) : null

      if (code !== 'EADDRINUSE') {
        throw error
      }

      await assertReusableServer()
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionDevPath},${exampleComPath}`,
        `--load-extension=${extensionDevPath},${exampleComPath}`,
      ],
    })

    await enableDevtoolsExtension(context)

    await use(context)
    await context.close()

    if (startedServer) {
      await server.close()
    }

    await rm(userDataDir, { recursive: true, force: true })
    await rm(storeDir, { recursive: true, force: true })
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
  devtools: async ({ context: _context }, use) => {
    await use(createScrapingDevtoolsTools(SERVER_URL))
  },
  devClientId: async ({ baselineDevClientIds, devtools }, use) => {
    await use(await waitForNewDevClient(devtools, baselineDevClientIds))
  },
  serverUrl: async ({ browserName: _browserName }, use) => {
    await use(SERVER_URL)
  },
})

export const expect = playwrightExpect
