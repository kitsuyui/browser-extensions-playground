import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@kitsuyui\/([^/]+)$/,
        replacement: fileURLToPath(
          new URL('./packages/$1/src/index.ts', import.meta.url)
        ),
      },
    ],
  },
  test: {
    /**
     * globals: true allows you to use describe, test, etc. without importing them
     * It is better to import them explicitly to avoid future liabilities, so it is not set to globals: true
     */
    globals: false,
    coverage: {
      include: ['**/src/**/*.ts'],
      exclude: ['**/src/**/*.spec.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
  /**
   * clearScreen: true clears the screen when running tests. The default is true
   * If you are watching multiple processes, the results of other processes will also be cleared, so it is set to false
   */
  clearScreen: false,
})
