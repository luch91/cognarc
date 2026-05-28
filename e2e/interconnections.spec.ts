import { test, expect } from '@playwright/test'

test.describe('View interconnections', () => {

  test('high-manipulation Growth upload triggers Safety feed entry', async ({ page }) => {
    await page.goto('/growth')

    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: 'campaign-v3.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-png'),
    })

    // Mock processing takes 5 s — wait up to 8 s for "complete" badge
    await page.waitForSelector('text=complete', { timeout: 8000 })

    await page.click('text=Safety / Red Team')

    // The manipulation feed entry excerpt is the filename (≤50 chars).
    // Allow up to 6 s for state to propagate after nav.
    const feed = page.locator('[data-testid="manipulation-feed"]')
    await expect(
      feed.locator('text=campaign-v3.png').or(feed.locator('text=Creative asset evaluated'))
    ).toBeVisible({ timeout: 6000 })
  })

  test('kill switch creates audit entry visible in both Engineer and Safety views', async ({ page }) => {
    await page.goto('/')

    await page.click('button[aria-label="Activate kill switch"]')
    await page.click('text=Pause Agent')

    await page.click('text=Engineer')
    await expect(page.locator('text=KILL_SWITCH').first()).toBeVisible()

    await page.click('text=Safety / Red Team')
    await expect(page.locator('text=KILL_SWITCH').first()).toBeVisible()

    // Clean up
    await page.click('button[aria-label="Deactivate kill switch"]')
    await page.click('text=Resume')
  })

  test('Act-Gated queue shows pending items', async ({ page }) => {
    await page.goto('/approvals')

    // Pre-seeded pending items should be present
    await expect(page.locator('text=PENDING').first()).toBeVisible()
  })

  test('agent activity feed receives entries from actions across views', async ({ page }) => {
    await page.goto('/')

    const feedItems = page.locator('[data-testid="agent-feed-item"]')
    const initialCount = await feedItems.count()

    await page.click('text=Growth')
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'new-asset.png',
      mimeType: 'image/png',
      buffer: Buffer.from('x'),
    })

    // Wait for processing to complete (mock = 5 s)
    await page.waitForSelector('text=complete', { timeout: 8000 })

    await page.click('text=Workspace Overview')

    // The feed item is rendered after state update — poll until count increases
    await expect.poll(async () => feedItems.count(), { timeout: 6000 }).toBeGreaterThan(initialCount)
  })

})
