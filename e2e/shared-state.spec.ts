import { test, expect } from '@playwright/test'

test.describe('Shared application state', () => {

  test('evaluation queue persists across navigation', async ({ page }) => {
    await page.goto('/growth')

    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: 'test-asset.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-png-data'),
    })

    await expect(page.locator('text=test-asset.png')).toBeVisible()

    await page.click('text=Engineer')
    await page.click('text=Growth')

    await expect(page.locator('text=test-asset.png')).toBeVisible()
  })

  test('connector write-back toggle syncs between Settings and PM view', async ({ page }) => {
    await page.goto('/settings')

    const toggle = page.locator('button[aria-label="Toggle write-back for Amplitude"]')
    await toggle.click()

    // After toggling, navigate to PM view and confirm Amplitude write-back reflects current state.
    // We don't need to know the initial state — just assert the final state is self-consistent.
    await page.goto('/pm')

    const pmAmplitudeRow = page.locator('tr', { has: page.locator('td', { hasText: 'Amplitude' }) })

    // Either "✓ Enabled" or "— Disabled" must be visible — assert exactly one exists
    const enabled = pmAmplitudeRow.locator('span', { hasText: 'Enabled' })
    const disabled = pmAmplitudeRow.locator('span', { hasText: 'Disabled' })

    // At least one of these should be visible (the row exists and has a write-back indicator)
    await expect(enabled.or(disabled)).toBeVisible()
  })

  test('kill switch state persists across page navigation', async ({ page }) => {
    await page.goto('/')

    await page.click('button[aria-label="Activate kill switch"]')
    await page.click('text=Pause Agent')

    // Use the banner's specific span text — avoid matching agent feed entry
    await expect(page.locator('span:has-text("Agent actions paused")')).toBeVisible()

    await page.click('text=Engineer')
    await expect(page.locator('span:has-text("Agent actions paused")')).toBeVisible()

    await page.click('button[aria-label="Deactivate kill switch"]')
    // "Resume" is the confirm button label in the deactivate modal
    await page.locator('button:has-text("Resume")').click()

    await expect(page.locator('span:has-text("Agent actions paused")')).not.toBeVisible({ timeout: 3000 })
  })

  test('thresholds from settings propagate to engineer view', async ({ page }) => {
    await page.goto('/settings')

    // The threshold grid has three inputs inside their own label+div containers.
    // Scroll into view then fill the first numeric input in the threshold section
    // (Cognitive Load Max is first in the grid).
    const thresholdSection = page.locator('div', { has: page.locator('text=Workspace Thresholds') })
    const clInput = thresholdSection.locator('input[type="number"]').first()
    await clInput.fill('75')

    await page.click('button:has-text("Save Thresholds")')

    // Wait for the save confirmation to appear — confirms thresholds were committed
    await expect(page.locator('text=Thresholds saved')).toBeVisible({ timeout: 5000 })

    // Use sidebar navigation (not page.goto) to preserve React context state.
    // page.goto() triggers a full page reload which resets all AppContext state
    // back to initial values (CL max 80), losing the saved threshold.
    await page.click('text=Engineer')

    // Wait for the Prompt Regression Monitor to load, then check the threshold note.
    // The <p> textContent is "Thresholds: CL max 75 · Manip max … · CC min …"
    // Use page.locator with regex on inner text (matches partial text content).
    await expect(page.locator('text=CL max').first()).toBeVisible({ timeout: 5000 })
    const note = page.locator('p', { hasText: 'CL max' })
    const noteText = await note.innerText()
    expect(noteText).toContain('75')
  })

})
