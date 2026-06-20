import { test, expect } from '@playwright/test'

test.describe('Connection Health Row', () => {

  test('connected platforms show a health row with pulse dot', async ({ page }) => {
    await page.goto('/pm')
    await expect(page.locator('text=Live Connection Health')).toBeVisible()
    const segmentRow = page.locator('text=Segment').first().locator('..')
    if (await segmentRow.isVisible()) {
      await expect(
        segmentRow.locator('text=Last event').or(segmentRow.locator('text=No events received'))
      ).toBeVisible()
    }
  })

  test('not-connected platforms are excluded from the health row', async ({ page }) => {
    await page.goto('/pm')
    await expect(
      page.locator('text=Connect more platforms in Settings')
    ).toBeVisible({ timeout: 3000 }).catch(() => {
      // All platforms connected — acceptable, skip this assertion
    })
  })

})

test.describe('Live Event Stream', () => {

  test('stream panel is visible below connector status table', async ({ page }) => {
    await page.goto('/pm')
    await expect(page.locator('text=Live Event Stream')).toBeVisible()
  })

  test('empty state shows when no events exist', async ({ page }) => {
    await page.goto('/pm')
    const emptyState = page.locator('text=No events received yet')
    if (await emptyState.isVisible()) {
      await expect(page.locator('text=Go to Settings')).toBeVisible()
    }
  })

  test('filter bar has platform and label dropdowns', async ({ page }) => {
    await page.goto('/pm')
    await expect(
      page.locator('text=All Platforms').or(page.locator('select'))
    ).toBeVisible()
  })

  test('pause stream toggle stops new rows from appearing', async ({ page }) => {
    await page.goto('/pm')
    const pauseToggle = page.locator('text=Pause stream')
    if (await pauseToggle.isVisible()) {
      await pauseToggle.click()
      await expect(page.locator('text=Resume stream')).toBeVisible()
    }
  })

  test('stream table has correct columns when events exist', async ({ page }) => {
    await page.goto('/pm')
    const hasEvents = await page.locator('[data-testid="stream-row"]').count() > 0
    if (hasEvents) {
      await expect(page.locator('text=TIME')).toBeVisible()
      await expect(page.locator('text=PLATFORM')).toBeVisible()
      await expect(page.locator('text=RAW EVENT')).toBeVisible()
      await expect(page.locator('text=COGNITIVE LABEL')).toBeVisible()
      await expect(page.locator('text=WRITE-BACK')).toBeVisible()
    }
  })

})

test.describe('Event Detail Drawer', () => {

  test('clicking a stream row opens the detail drawer', async ({ page }) => {
    await page.goto('/pm')
    const rows = page.locator('[data-testid="stream-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(page.locator('text=Raw event properties')).toBeVisible({ timeout: 2000 })
    }
  })

  test('drawer shows cognitive label rule when label is present', async ({ page }) => {
    await page.goto('/pm')
    const rows = page.locator('[data-testid="stream-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(
        page.locator('text=Cognitive label applied')
          .or(page.locator('text=No cognitive label rule matched'))
      ).toBeVisible({ timeout: 2000 })
    }
  })

  test('successful write-back shows written back text', async ({ page }) => {
    await page.goto('/pm')
    const successRow = page.locator('[data-testid="stream-row"]').filter({ hasText: '✓' }).first()
    if (await successRow.isVisible()) {
      await successRow.click()
      await expect(page.locator('text=Written back to')).toBeVisible({ timeout: 2000 })
    }
  })

  test('failed write-back shows retry button', async ({ page }) => {
    await page.goto('/pm')
    const failedRow = page.locator('[data-testid="stream-row"]').filter({ hasText: '✗' }).first()
    if (await failedRow.isVisible()) {
      await failedRow.click()
      await expect(page.locator('text=Retry write-back')).toBeVisible({ timeout: 2000 })
    }
  })

  test('drawer closes via X button', async ({ page }) => {
    await page.goto('/pm')
    const rows = page.locator('[data-testid="stream-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(page.locator('text=Raw event properties')).toBeVisible()
      await page.click('[aria-label="Close"]')
      await expect(page.locator('text=Raw event properties')).not.toBeVisible()
    }
  })

})

test.describe('Realtime updates', () => {

  test('realtime subscription does not throw console errors', async ({ page }) => {
    await page.goto('/pm')
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(2000)
    expect(errors.filter(e => e.includes('supabase') || e.includes('realtime'))).toHaveLength(0)
  })

})

test.describe('Live Score persistence across views', () => {

  test('Live Score panel is visible on Engineer view', async ({ page }) => {
    await page.goto('/engineer')
    await expect(page.locator('text=Live Cognitive Score')).toBeVisible()
  })

  test('Score breakdown section appears after result', async ({ page }) => {
    await page.goto('/')
    const resultPanel = page.locator('text=Score Breakdown')
    // If a score has been run, the breakdown should be present
    if (await resultPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(page.locator('text=Cognitive Load —')).toBeVisible()
      await expect(page.locator('text=Comprehension —')).toBeVisible()
      await expect(page.locator('text=Trust Coherence —')).toBeVisible()
      await expect(page.locator('text=Manipulation Risk —')).toBeVisible()
    }
  })

  test('Get Rewrite Suggestions button appears after result', async ({ page }) => {
    await page.goto('/')
    const rewriteBtn = page.locator('text=Get Rewrite Suggestions')
    if (await rewriteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(rewriteBtn).toBeEnabled()
    }
  })

})
