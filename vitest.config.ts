import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const aliasEntries = [
  [
    '@kitsuyui/browser-extensions-scraping-platform',
    './packages/scraping-platform/src/index.ts',
  ],
  [
    '@kitsuyui/browser-extensions-scraping-server',
    './packages/scraping-server/src/index.ts',
  ],
  [
    '@kitsuyui/browser-extensions-scraping-extension-devtools',
    './packages/extension-dev/src/index.ts',
  ],
  [
    '@kitsuyui/browser-extensions-example-com',
    './packages/example-com/src/index.ts',
  ],
  [
    '@kitsuyui/browser-extensions-scraping-devtools',
    './packages/scraping-devtools/src/index.ts',
  ],
  [
    '@kitsuyui/browser-extensions-scraped-data',
    './packages/scraped-data/src/index.ts',
  ],
  [
    '@kitsuyui/browser-extensions-quota-openai',
    './packages/quota-openai/src/index.ts',
  ],
  [
    '@kitsuyui/browser-extensions-quota-anthropic',
    './packages/quota-anthropic/src/index.ts',
  ],
  ['@kitsuyui/browser-extensions-hello', './packages/hello/src/index.ts'],
] as const

export default defineConfig({
  resolve: {
    alias: aliasEntries.map(([find, replacement]) => ({
      find,
      replacement: fileURLToPath(new URL(replacement, import.meta.url)),
    })),
  },
  test: {
    /**
     * globals: true allows you to use describe, test, etc. without importing them
     * It is better to import them explicitly to avoid future liabilities, so it is not set to globals: true
     */
    globals: false,
    include: ['packages/**/src/**/*.spec.ts'],
    coverage: {
      include: ['**/src/**/*.ts'],
      exclude: ['**/src/**/*.spec.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
    exclude: ['**/e2e/**', '**/node_modules/**'],
  },
  /**
   * clearScreen: true clears the screen when running tests. The default is true
   * If you are watching multiple processes, the results of other processes will also be cleared, so it is set to false
   */
  clearScreen: false,
})
