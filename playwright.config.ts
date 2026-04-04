import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages',
  testMatch: '**/e2e/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
})
