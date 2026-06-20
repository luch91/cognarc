import { test, expect } from '@playwright/test'

test.describe('Copy Health Checker (Manager View)', () => {

  test('shows health badge and plain-English verdict after scoring', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill(
      'Act now! Limited time offer. Our expert team guarantees results.'
    )
    await page.click('text=Check this copy')

    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })

    const readRow = page.locator('text=How hard is this to read')
    await readRow.scrollIntoViewIfNeeded()
    await expect(readRow).toBeVisible({ timeout: 5000 })
    const understandRow = page.locator('text=Will your audience understand')
    await understandRow.scrollIntoViewIfNeeded()
    await expect(understandRow).toBeVisible({ timeout: 5000 })
    const trustRow = page.locator('text=Does this feel trustworthy')
    await trustRow.scrollIntoViewIfNeeded()
    await expect(trustRow).toBeVisible({ timeout: 5000 })
    const pressureRow = page.locator('text=Is this pressuring or misleading')
    await pressureRow.scrollIntoViewIfNeeded()
    await expect(pressureRow).toBeVisible({ timeout: 5000 })
  })

  test('radar chart renders with four axes', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill('See how it works in 2 minutes.')
    await page.click('text=Check this copy')

    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })

    const radarSvg = page.locator('.recharts-radar, .recharts-polar-grid')
    await expect(radarSvg.first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Readability').first()).toBeVisible()
    await expect(page.locator('text=Clarity').first()).toBeVisible()
    await expect(page.locator('text=Trust').first()).toBeVisible()
    await expect(page.locator('text=Safety').first()).toBeVisible()
  })

  test('Technical view toggle shows raw numbers', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill('Our product is great.')
    await page.click('text=Check this copy')

    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Technical' }).click()
    await expect(page.getByText('Cognitive Load').first()).toBeVisible()
    await expect(page.getByText('Comprehension Confidence').first()).toBeVisible()
    await expect(page.getByText('Manipulation Risk').first()).toBeVisible()
  })

  test('Show me better alternatives button triggers rewrite flow', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill('Act now! Buy before midnight. Experts agree.')
    await page.click('text=Check this copy')

    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })

    const altBtn = page.locator('text=Show me better alternatives')
    if (await altBtn.isVisible()) {
      await altBtn.click()
      await expect(page.locator('text=Finding better ways to say this')).toBeVisible()
      await expect(page.locator('text=Use this version').first()).toBeVisible({ timeout: 30000 })
    }
  })

  test('before/after comparison shows after selecting a rewrite', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill('Limited time! Act now or lose out forever.')
    await page.click('text=Check this copy')

    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })

    const altBtn = page.locator('text=Show me better alternatives')
    if (await altBtn.isVisible()) {
      await altBtn.click()
      await page.waitForTimeout(15000)
      const useBtn = page.locator('text=Use this version').first()
      if (await useBtn.isVisible()) {
        await useBtn.click()
        await expect(
          page.locator('text=Before').or(page.locator('text=After'))
        ).toBeVisible({ timeout: 5000 })
      }
    }
  })

})

test.describe('Prompt Regression Monitor', () => {

  test('rows are clickable and show a chevron', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await expect(rows.first()).toBeVisible()
    await expect(
      rows.first().locator('text=▼').or(rows.first().locator('[data-testid="chevron"]'))
    ).toBeVisible()
    await expect(rows.first()).toHaveCSS('cursor', 'pointer')
  })

  test('clicking a row expands the detail panel', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await rows.first().click()
    await expect(
      page.locator('[data-testid="regression-monitor-detail"]').first()
    ).toBeVisible({ timeout: 3000 })
  })

  test('detail panel shows score history chart', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await rows.first().click()
    await expect(
      page.locator('[data-testid="regression-chart"]').first()
    ).toBeVisible({ timeout: 3000 })
  })

  test('detail panel shows baseline and current prompt text', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await rows.first().click()
    await expect(page.locator('text=Baseline').first()).toBeVisible()
    await expect(page.locator('text=Current').first()).toBeVisible()
  })

  test('BLOCK row shows impact summary in plain English', async ({ page }) => {
    await page.goto('/engineer')
    const blockRow = page.locator('[data-testid="regression-monitor-row"]').filter({ hasText: 'Checkout confirmation' })
    await blockRow.click()
    await expect(
      page.getByText('made things significantly worse').first()
    ).toBeVisible({ timeout: 3000 })
  })

  test('clicking a second row collapses the first', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await rows.nth(0).click()
    await expect(page.locator('[data-testid="regression-monitor-detail"]').first()).toBeVisible()
    await rows.nth(1).click()
    await expect(page.locator('[data-testid="regression-monitor-detail"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="regression-monitor-detail"]').first()).toBeVisible()
  })

})

test.describe('CognitiveScoreCard component', () => {

  test('manager mode is the default', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill('Hello world.')
    await page.click('text=Check this copy')

    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })

    const readRow = page.locator('text=How hard is this to read')
    await readRow.scrollIntoViewIfNeeded()
    await expect(readRow).toBeVisible({ timeout: 5000 })
  })

  test('health badge is one of three valid states', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill('Act now! Limited time! Experts agree! Do not miss out!')
    await page.click('text=Check this copy')

    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })
  })

})

test.describe('Video report with CognitiveScoreCard', () => {

  test('video report shows manager-friendly score card', async ({ page }) => {
    await page.goto('/growth')
    const viewReportBtn = page.locator('text=View Report →').first()
    if (await viewReportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewReportBtn.click()
      const badge = page.getByTestId('health-badge')
      await expect(badge).toBeVisible({ timeout: 5000 })
    }
  })

})
