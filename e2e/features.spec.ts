import { test, expect } from '@playwright/test'

// ── Designer view ────────────────────────────────────────────────────────────

test.describe('Designer view', () => {

  test('A/B comparison — upload two variants and see results', async ({ page }) => {
    await page.goto('/designer')

    await page.locator('input[aria-label="Upload Variant A"]').setInputFiles({
      name: 'variant-a.png', mimeType: 'image/png', buffer: Buffer.from('a'),
    })
    await page.locator('input[aria-label="Upload Variant B"]').setInputFiles({
      name: 'variant-b.png', mimeType: 'image/png', buffer: Buffer.from('b'),
    })

    const compareButton = page.locator('text=Run Cognitive Comparison')
    await expect(compareButton).toBeEnabled()
    await compareButton.click()

    await expect(page.locator('text=Running TRIBE cognitive comparison')).toBeVisible()
    await expect(page.locator('text=Variant A preferred')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=High Confidence')).toBeVisible()
  })

  test('A/B comparison — compare button disabled until both variants uploaded', async ({ page }) => {
    await page.goto('/designer')

    const compareButton = page.locator('text=Run Cognitive Comparison')
    await expect(compareButton).toBeDisabled()

    await page.locator('input[aria-label="Upload Variant A"]').setInputFiles({
      name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('a'),
    })

    await expect(compareButton).toBeDisabled()
  })

  test('heatmap — uploading a screenshot shows overlay within 2 seconds', async ({ page }) => {
    await page.goto('/designer')

    await page.locator('input[aria-label="Upload UI screenshot for heatmap overlay"]').setInputFiles({
      name: 'ui-screenshot.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-data'),
    })

    await expect(page.locator('text=Analyzing attention patterns')).toBeVisible({ timeout: 2000 })
    await expect(page.locator('canvas')).toBeVisible({ timeout: 4000 })
    await expect(page.locator('text=High attention')).toBeVisible()
  })

})

// ── Settings page ────────────────────────────────────────────────────────────

test.describe('Settings page', () => {

  test('Configure modal opens for each analytics connector', async ({ page }) => {
    await page.goto('/settings')

    // The Analytics Connectors card contains all 5 connector rows.
    // Each row has an aria-label on the write-back toggle: "Toggle write-back for {name}".
    // We use the toggle as an anchor, then traverse up to the row div and find Configure.
    for (const platform of ['Segment', 'Amplitude', 'PostHog']) {
      // Row is the parent div of the write-back toggle for this connector
      const row = page.locator('button[aria-label="Toggle write-back for ' + platform + '"]')
        .locator('..').locator('..')  // up two levels to the flex items row
      await row.locator('button:has-text("Configure")').click()

      await expect(page.locator(`h2:has-text("Configure ${platform}")`)).toBeVisible()

      // Close via the × button
      await page.click('button[aria-label="Close"]')
      await expect(page.locator(`h2:has-text("Configure ${platform}")`)).not.toBeVisible()
    }
  })

  test('API key connect button opens modal for Braintrust', async ({ page }) => {
    await page.goto('/settings')

    const connectBtns = page.getByRole('button', { name: 'Connect via API Key' })
    await connectBtns.first().click()

    await expect(page.getByText('Connect Braintrust').first()).toBeVisible()
    const apiInput = page.locator('input[placeholder*="brk_"]').or(page.locator('input[type="password"]').first())
    await expect(apiInput).toBeVisible()
  })

  test('Add Repository button opens modal and saves repo', async ({ page }) => {
    await page.goto('/settings')

    await page.click('text=+ Add Repository')
    await expect(page.locator('text=Connect GitHub Repository')).toBeVisible()

    await page.fill('input[placeholder*="github.com"]', 'https://github.com/test/repo')
    await page.click('text=Save Repository')

    // The derived name shown in the list is "test/repo" — match the <p> element exactly
    await expect(page.locator('p', { hasText: 'test/repo' }).first()).toBeVisible({ timeout: 3000 })
  })

  test('SDK links are clickable anchor tags with valid hrefs', async ({ page }) => {
    await page.goto('/settings')

    const pythonSDK = page.locator('a:has-text("Python SDK")')
    await expect(pythonSDK).toBeVisible()

    const href = await pythonSDK.getAttribute('href')
    expect(href).toBeTruthy()
    expect(href).not.toBe('#')
  })

})

// ── Kill switch ──────────────────────────────────────────────────────────────

test.describe('Kill switch', () => {

  test('activating shows confirmation modal', { timeout: 60000 }, async ({ page }) => {
    await page.goto('/')

    await page.click('button[aria-label="Activate kill switch"]')

    await expect(page.locator('text=Pause all agent actions?')).toBeVisible()
    await expect(page.locator('button:has-text("Pause Agent")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()

    // Clean up — cancel so other tests start clean
    await page.locator('button:has-text("Cancel")').click()
  })

  test('cancelling does not activate kill switch', async ({ page }) => {
    await page.goto('/')
    await page.click('button[aria-label="Activate kill switch"]')
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('span:has-text("Agent actions paused")')).not.toBeVisible()
  })

  test('confirming shows amber banner and audit entry', async ({ page }) => {
    await page.goto('/')
    await page.click('button[aria-label="Activate kill switch"]')
    await page.click('text=Pause Agent')

    // Banner span (not the agent feed entry paragraph)
    await expect(page.locator('span:has-text("Agent actions paused")')).toBeVisible()

    await page.click('text=Engineer')
    await expect(page.locator('text=KILL_SWITCH').first()).toBeVisible()

    // Clean up
    await page.click('button[aria-label="Deactivate kill switch"]')
    await page.click('text=Resume')
  })

})

// ── Onboarding banner ────────────────────────────────────────────────────────

test.describe('Onboarding banner', () => {

  test('banner hides after successful connection', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('text=Connect your first LLM endpoint to start monitoring')).toBeVisible()

    await page.fill('input[placeholder="https://api.openai.com/v1"]', 'https://api.openai.com/v1')
    await page.fill('input[placeholder="sk-..."]', 'sk-testkey123')

    await page.click('text=Connect & Start Monitoring')

    await expect(page.locator('text=Connected! Generating your first score')).toBeVisible()

    await expect(
      page.locator('text=Connect your first LLM endpoint to start monitoring')
    ).not.toBeVisible({ timeout: 5000 })

    await page.click('text=Engineer')
    await page.click('text=Workspace Overview')
    await expect(
      page.locator('text=Connect your first LLM endpoint to start monitoring')
    ).not.toBeVisible()
  })

})
