import { defineConfig } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
const isRemote = BASE_URL !== 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // Run tests serially to avoid resource contention on local dev machines.
  // The test suite has async timers (5 s mock, 1.5 s heatmap) that cause
  // cascading timeouts when 4 workers compete for the same Vite server.
  workers: isRemote ? 4 : 1,
  // TRIBE v2 warm latency ~35s + rewrite service ~15s + nav/assertions
  timeout: 180_000,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Only spin up the dev server when running against localhost
  webServer: isRemote ? undefined : {
    command: 'pnpm --filter dashboard dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
