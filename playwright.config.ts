import { defineConfig } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5174'
const isRemote = !BASE_URL.includes('localhost') && !BASE_URL.includes('127.0.0.1')

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
    command: 'pnpm --filter @cognarc/dashboard dev',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
