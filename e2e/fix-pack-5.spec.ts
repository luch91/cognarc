import { test, expect } from '@playwright/test'

test.describe('Growth View — Creative Evaluation Queue', () => {

  test('all completed items show View Report button', async ({ page }) => {
    await page.goto('/growth')
    const viewReportBtns = page.getByRole('button', { name: 'View Report →' })
    await expect(viewReportBtns.first()).toBeVisible({ timeout: 5000 })
    const count = await viewReportBtns.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('clicking View Report on a text file expands CognitiveScoreCard', async ({ page }) => {
    await page.goto('/growth')
    const emailRow = page.locator('text=email-body-copy.txt').first()
    await expect(emailRow).toBeVisible({ timeout: 5000 })
    const viewReportBtns = page.getByRole('button', { name: 'View Report →' })
    await viewReportBtns.nth(1).click()
    const report = page.getByTestId('queue-item-report').first()
    await expect(report).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('health-badge').first()).toBeVisible()
  })

})

test.describe('Growth View — Variant Ranker', () => {

  test('variant input tabs visible (Paste text, Upload image, Enter URL)', async ({ page }) => {
    await page.goto('/growth')
    await expect(page.getByText('Paste text').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Upload image').first()).toBeVisible()
    await expect(page.getByText('Enter URL').first()).toBeVisible()
  })

  test('Run Comparison disabled until 2 variants added', async ({ page }) => {
    await page.goto('/growth')
    const runBtn = page.getByText('Run Comparison').first()
    await expect(runBtn).toBeVisible()
    await expect(runBtn).toBeDisabled()
  })

  test('adding 2 text variants enables Run Comparison', async ({ page }) => {
    await page.goto('/growth')
    const addBtn = page.getByTestId('add-variant')
    const textarea = page.locator('textarea[placeholder="Paste your copy — headline, email, ad, CTA..."]')
    await textarea.fill('Start your journey today.')
    await addBtn.click()
    await textarea.fill('Act now — limited time offer!')
    await addBtn.click()
    await expect(page.getByText('Run Comparison').first()).toBeEnabled({ timeout: 2000 })
  })

})

test.describe('Safety View — Post-Remediation Monitor', () => {

  test('remediation items are clickable', async ({ page }) => {
    await page.goto('/safety')
    const rows = page.locator('[data-testid="remediation-row"]')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    await expect(rows.first()).toHaveCSS('cursor', 'pointer')
  })

  test('clicking a remediation item expands detail panel', async ({ page }) => {
    await page.goto('/safety')
    const rows = page.locator('[data-testid="remediation-row"]')
    await rows.first().click()
    await expect(
      page.locator('[data-testid="remediation-detail"]').first()
    ).toBeVisible({ timeout: 3000 })
  })

  test('manual submission form is visible', async ({ page }) => {
    await page.goto('/safety')
    await expect(
      page.getByText('Submit content for review').first()
    ).toBeVisible()
    await expect(
      page.getByText('Scan for manipulation').first()
    ).toBeVisible()
  })

  test('manual submission triggers detection feed entry', async ({ page }) => {
    await page.goto('/safety')
    const textarea = page.locator('textarea').first()
    await textarea.fill(
      'Act now! Limited time offer. Experts unanimously agree this is your last chance.'
    )
    await page.getByText('Scan for manipulation').first().click()
    await expect(
      page.getByText('Manual submission').first()
    ).toBeVisible({ timeout: 10000 })
  })

})

test.describe('Engineer View — Prompt Regression Monitor', () => {

  test('Add Prompt button is visible', async ({ page }) => {
    await page.goto('/engineer')
    await expect(
      page.getByTestId('add-prompt-button')
    ).toBeVisible()
  })

  test('Add Prompt modal opens with three tabs', async ({ page }) => {
    await page.goto('/engineer')
    await page.getByTestId('add-prompt-button').click()
    await expect(page.getByText('Paste prompt').first()).toBeVisible()
    await expect(page.getByText('From GitHub').first()).toBeVisible()
    await expect(page.getByText('From API').first()).toBeVisible()
  })

  test('pasting and adding a prompt adds it to the monitor', async ({ page }) => {
    await page.goto('/engineer')
    await page.getByTestId('add-prompt-button').click()
    await page.locator('input[placeholder="Checkout confirmation"]').fill('Test prompt')
    await page.locator('textarea').first().fill('You are a helpful assistant. Be concise.')
    await page.getByText('Add to monitor').first().click()
    await expect(page.getByText('Test prompt').first()).toBeVisible({ timeout: 10000 })
  })

})

test.describe('Settings — LLM Connections', () => {

  test('Disconnect button visible for connected endpoints', async ({ page }) => {
    await page.goto('/settings')
    const disconnectBtn = page.locator('text=Disconnect').first()
    await expect(disconnectBtn).toBeVisible({ timeout: 5000 })
  })

  test('Test button shows result', async ({ page }) => {
    await page.goto('/settings')
    const testBtn = page.locator('button:has-text("Test")').first()
    await expect(testBtn).toBeVisible({ timeout: 5000 })
    await testBtn.click()
    await expect(
      page.getByText('Healthy').first()
        .or(page.getByText('Testing').first())
    ).toBeVisible({ timeout: 5000 })
  })

})

test.describe('Settings — Analytics Connectors', () => {

  test('Configure button exists on connector rows', async ({ page }) => {
    await page.goto('/settings')
    const configBtns = page.getByRole('button', { name: 'Configure' })
    await expect(configBtns.first()).toBeVisible({ timeout: 5000 })
    const count = await configBtns.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('Configure modal shows platform-specific fields', async ({ page }) => {
    await page.goto('/settings')
    const configBtns = page.getByRole('button', { name: 'Configure' })
    await configBtns.first().click()
    await expect(page.getByText('Configure').first()).toBeVisible()
    await expect(
      page.locator('input').first()
    ).toBeVisible()
  })

})

test.describe('Settings — GitHub CI/CD', () => {

  test('Add Repository opens modal with fields', async ({ page }) => {
    await page.goto('/settings')
    await page.getByText('+ Add Repository').first().click()
    await expect(page.getByText('Connect GitHub Repository').first()).toBeVisible()
    await expect(
      page.locator('input[placeholder*="github"]').first()
    ).toBeVisible()
    await expect(
      page.locator('input[placeholder*="ghp_"]').first()
    ).toBeVisible()
  })

})
