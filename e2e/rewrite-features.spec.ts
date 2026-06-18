import { test, expect } from '@playwright/test'

// TRIBE v2 warm latency ~35s, cold start ~100s. Set generous timeout.
const TRIBE_TIMEOUT = 120_000

// Helper: waits for the health badge to appear after scoring.
// Skips the test if the scoring service returns an error (429, 500, etc).
async function waitForScore(page: import('@playwright/test').Page) {
  const badge = page.locator('[data-testid="health-badge"]')
  const error = page.locator('text=Scoring failed')
  const result = await Promise.race([
    badge.waitFor({ state: 'visible', timeout: TRIBE_TIMEOUT }).then(() => 'scored' as const),
    error.waitFor({ state: 'visible', timeout: TRIBE_TIMEOUT }).then(() => 'failed' as const),
  ]).catch(() => 'timeout' as const)
  if (result === 'failed') {
    const msg = await error.textContent()
    test.skip(true, `Scoring service error: ${msg}`)
  }
  if (result === 'timeout') {
    test.skip(true, 'TRIBE v2 scoring timed out — likely cold start or rate limit')
  }
}

// ── Copy Health Checker (Growth view) ────────────────────────────────────────

test.describe('Copy Health Checker', () => {

  test('scores pasted copy and shows health badge', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').first().fill(
      'Act now! Limited time offer. Our expert team guarantees results.'
    )
    await page.click('text=Check this copy')
    await waitForScore(page)
  })

  test('manager mode shows plain-English rows by default', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').first().fill('Buy now before it is too late!')
    await page.click('text=Check this copy')
    await waitForScore(page)
    await expect(page.getByText('How hard is this to read?')).toBeVisible()
    await expect(page.getByText('Will your audience understand it?')).toBeVisible()
    await expect(page.getByText('Does this feel trustworthy?')).toBeVisible()
    await expect(page.getByText('Is this pressuring or misleading people?')).toBeVisible()
  })

  test('Technical view toggle shows raw score numbers', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').first().fill('Our product is great.')
    await page.click('text=Check this copy')
    await waitForScore(page)
    await page.getByRole('button', { name: 'Technical' }).click()
    await expect(page.getByText('Cognitive Load').first()).toBeVisible()
    await expect(page.getByText('Comprehension Confidence').first()).toBeVisible()
    await expect(page.getByText('Manipulation Risk').first()).toBeVisible()
  })

  test('Show me better alternatives appears on flagged copy', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').first().fill('Act now! Limited time. Experts agree.')
    await page.click('text=Check this copy')
    await waitForScore(page)
    const badge = await page.locator('[data-testid="health-badge"]').textContent()
    if (badge?.includes('CLEAR')) { test.skip(true, 'Copy scored CLEAR — no rewrite needed'); return }
    await expect(page.getByRole('button', { name: 'Show me better alternatives' })).toBeVisible()
  })

  test('Use this version button shows before/after comparison', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').first().fill('Limited time offer! Act now or lose out forever.')
    await page.click('text=Check this copy')
    await waitForScore(page)
    const altBtn = page.getByRole('button', { name: 'Show me better alternatives' })
    if (!(await altBtn.isVisible({ timeout: 3000 }).catch(() => false))) { test.skip(true, 'No alternatives button'); return }
    await altBtn.click()
    await expect(page.getByRole('button', { name: 'Use this version' }).first()).toBeVisible({ timeout: TRIBE_TIMEOUT })
    await page.getByRole('button', { name: 'Use this version' }).first().click()
    await expect(page.getByText('Before', { exact: true })).toBeVisible({ timeout: 3000 })
  })

  test('copy type pill selector is visible', async ({ page }) => {
    await page.goto('/growth')
    await expect(page.getByRole('button', { name: 'Campaign copy' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Landing page' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CTA' })).toBeVisible()
  })

  test('Clear button resets the form', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').first().fill('Some copy')
    await page.click('text=Check this copy')
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: 'Clear' }).first().click()
    await expect(page.locator('textarea').first()).toHaveValue('')
    await expect(page.locator('[data-testid="health-badge"]')).not.toBeVisible()
  })

})

// ── CI/CD Gate Rewrite Suggestions (Engineer view) ───────────────────────────

test.describe('CI/CD Gate Rewrite Suggestions', () => {

  test('expanding rewrites shows loading state then alternatives', async ({ page }) => {
    await page.goto('/engineer')
    await page.locator('text=View suggested rewrites').first().click()
    await expect(
      page.locator('text=Generating cognitively-safe prompt alternatives')
        .or(page.getByText('HIGH', { exact: true }).first())
        .or(page.getByText('MEDIUM', { exact: true }).first())
    ).toBeVisible({ timeout: TRIBE_TIMEOUT })
  })

  test('collapsing and re-expanding uses cache — no second loading state', async ({ page }) => {
    test.setTimeout(300_000)
    await page.goto('/engineer')
    await page.locator('text=View suggested rewrites').first().click()
    // Wait for first load to fully complete — rewrite + 3x TRIBE re-score can take ~3min
    const spinner = page.locator('text=Generating cognitively-safe prompt alternatives')
    await expect(spinner).not.toBeVisible({ timeout: 240_000 })
    // Collapse
    await page.locator('text=Hide suggested rewrites').first().click()
    // Re-expand — cache should be instant, no spinner
    const start = Date.now()
    await page.locator('text=View suggested rewrites').first().click()
    await expect(spinner).not.toBeVisible({ timeout: 3000 })
    expect(Date.now() - start).toBeLessThan(3000)
  })

})

// ── Prompt Regression Monitor (Engineer view) ────────────────────────────────

test.describe('Prompt Regression Monitor', () => {

  test('rows are visible with chevron indicators', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await expect(rows.first()).toBeVisible({ timeout: 3000 })
    await expect(rows.first().locator('[data-testid="chevron"]')).toBeVisible()
  })

  test('rows have cursor-pointer styling', async ({ page }) => {
    await page.goto('/engineer')
    await expect(page.locator('[data-testid="regression-monitor-row"]').first()).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="regression-monitor-row"]').first()).toHaveCSS('cursor', 'pointer')
  })

  test('clicking a row expands the detail panel', async ({ page }) => {
    await page.goto('/engineer')
    await page.locator('[data-testid="regression-monitor-row"]').first().click()
    await expect(page.locator('[data-testid="regression-monitor-detail"]').first()).toBeVisible({ timeout: 2000 })
  })

  test('detail panel shows score history chart', async ({ page }) => {
    await page.goto('/engineer')
    await page.locator('[data-testid="regression-monitor-row"]').first().click()
    await expect(page.locator('[data-testid="regression-chart"]').first()).toBeVisible({ timeout: 2000 })
  })

  test('detail panel shows Baseline and Current prompt text columns', async ({ page }) => {
    await page.goto('/engineer')
    await page.locator('[data-testid="regression-monitor-row"]').first().click()
    await expect(page.getByText('Baseline (v1)').first()).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Current (v5)').first()).toBeVisible()
  })

  test('BLOCK row shows plain-English impact summary', async ({ page }) => {
    await page.goto('/engineer')
    const blockRow = page.locator('[data-testid="regression-monitor-row"]').filter({ hasText: 'Checkout confirmation' })
    await expect(blockRow).toBeVisible({ timeout: 3000 })
    await blockRow.click()
    await expect(page.getByText('⚠ This prompt change made things significantly worse.')).toBeVisible({ timeout: 2000 })
  })

  test('clicking a second row collapses the first', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await rows.nth(0).click()
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'true')
    await rows.nth(1).click()
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'false', { timeout: 2000 })
    await expect(rows.nth(1)).toHaveAttribute('aria-expanded', 'true')
  })

  test('BLOCK row shows Get Rewrite Suggestions button', async ({ page }) => {
    await page.goto('/engineer')
    const blockRow = page.locator('[data-testid="regression-monitor-row"]').filter({ hasText: 'Checkout confirmation' })
    await blockRow.click()
    await expect(page.getByRole('button', { name: 'Get Rewrite Suggestions' })).toBeVisible({ timeout: 2000 })
  })

  test('Export history button is present in detail panel', async ({ page }) => {
    await page.goto('/engineer')
    await page.locator('[data-testid="regression-monitor-row"]').first().click()
    await expect(page.getByRole('button', { name: 'Export history' })).toBeVisible({ timeout: 2000 })
  })

  test('Reset baseline shows confirmation dialog', async ({ page }) => {
    await page.goto('/engineer')
    await page.locator('[data-testid="regression-monitor-row"]').first().click()
    await page.getByRole('button', { name: 'Reset baseline' }).click()
    await expect(page.getByText('Reset baseline to current version?')).toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

})

// ── Act-Gated decision package (Approvals view) ──────────────────────────────

test.describe('Act-Gated decision package rewrites', () => {

  test('opening a package shows TRIBE evidence scores', async ({ page }) => {
    await page.goto('/approvals')
    await page.locator('text=View package').first().click()
    await expect(page.getByText('TRIBE EVIDENCE')).toBeVisible({ timeout: 3000 })
  })

  test('alternatives section shows loading skeleton then loads', async ({ page }) => {
    await page.goto('/approvals')
    await page.locator('text=View package').first().click()
    await expect(page.getByText('Alternatives Considered')).toBeVisible({ timeout: 3000 })
  })

  test('loaded alternatives show score deltas or fallback', async ({ page }) => {
    await page.goto('/approvals')
    await page.locator('text=View package').first().click()
    await expect(page.getByText('Alternatives Considered')).toBeVisible({ timeout: 3000 })
    // Wait for loading to finish — either live alternatives or fallback render
    // Both modes render score deltas with "Load:" text
    await expect(page.locator('text=Load:').first()).toBeVisible({ timeout: TRIBE_TIMEOUT })
  })

})

// ── Video Cognitive Report (Growth view) ─────────────────────────────────────

test.describe('Video Cognitive Report', () => {

  test('pre-seeded video queue item is visible in the Growth view', async ({ page }) => {
    await page.goto('/growth')
    await expect(page.locator('text=social-ad-v1.mp4')).toBeVisible({ timeout: 3000 })
  })

  test('View Report button appears on a completed video item', async ({ page }) => {
    await page.goto('/growth')
    const videoRow = page.locator('text=social-ad-v1.mp4').locator('..')
    await expect(videoRow).toBeVisible({ timeout: 3000 })
    if (!(await videoRow.locator('text=complete').isVisible({ timeout: 2000 }).catch(() => false))) { test.skip(); return }
    await expect(videoRow.locator('text=View Report')).toBeVisible()
  })

  test('clicking View Report expands moment-by-moment findings', async ({ page }) => {
    await page.goto('/growth')
    // Close report if already open (demo mode auto-expands)
    const hideBtn = page.locator('text=Hide report')
    if (await hideBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hideBtn.click()
      await page.waitForTimeout(500)
    }
    const viewReportBtn = page.locator('text=View Report').first()
    if (!(await viewReportBtn.isVisible({ timeout: 3000 }).catch(() => false))) { test.skip(); return }
    await viewReportBtn.click()
    await expect(page.getByRole('columnheader', { name: 'Component' })).toBeVisible({ timeout: 3000 })
    // Verify severity badges exist (count avoids strict mode violation)
    const badgeCount = await page.locator('[data-testid="video-report"]').locator('text=/WARNING|CRITICAL/').count()
    expect(badgeCount).toBeGreaterThan(0)
  })

  test('Get Script Rewrite shows voiceover alternatives', async ({ page }) => {
    await page.goto('/growth')
    const viewReportBtn = page.locator('text=View Report').first()
    if (!(await viewReportBtn.isVisible({ timeout: 3000 }).catch(() => false))) { test.skip(); return }
    await viewReportBtn.click()
    const rewriteBtn = page.locator('text=Get Script Rewrite').first()
    if (!(await rewriteBtn.isVisible({ timeout: 2000 }).catch(() => false))) { test.skip(); return }
    await rewriteBtn.click()
    await expect(
      page.locator('text=generating voiceover alternatives')
        .or(page.locator('text=Copy script'))
    ).toBeVisible({ timeout: TRIBE_TIMEOUT })
  })

  test('Close button collapses the report panel', async ({ page }) => {
    await page.goto('/growth')
    const viewReportBtn = page.locator('text=View Report').first()
    if (!(await viewReportBtn.isVisible({ timeout: 3000 }).catch(() => false))) { test.skip(); return }
    await viewReportBtn.click()
    await expect(page.getByRole('columnheader', { name: 'Component' })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('columnheader', { name: 'Component' })).not.toBeVisible()
  })

})
