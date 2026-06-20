import { test, expect } from '@playwright/test'

test.describe('Cross-view data sync', () => {

  test('scoring in Growth view produces a health badge result', async ({ page }) => {
    await page.goto('/growth')
    await page.getByRole('textbox', { name: 'Copy to check' }).fill(
      'Act now! Limited time offer. Experts agree this is urgent.'
    )
    await page.click('text=Check this copy')
    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 15000 })
    const text = await badge.textContent()
    expect(text).toMatch(/FLAGGED|NEEDS REVIEW|CLEAR/)
  })

  test('manipulation detection in Safety view adds to feed', async ({ page }) => {
    await page.goto('/safety')
    const textarea = page.locator('textarea').first()
    await textarea.fill(
      'Act now or you will miss out forever! Experts unanimously agree. Limited supply remaining!'
    )
    await page.getByText('Scan for manipulation').first().click()
    await expect(page.getByText('Manual submission').first()).toBeVisible({ timeout: 10000 })
  })

  test('adding prompt in Engineer view appears in the monitor table', async ({ page }) => {
    await page.goto('/engineer')
    await page.getByTestId('add-prompt-button').click()
    await page.locator('input[placeholder="Checkout confirmation"]').fill('Data sync prompt')
    await page.locator('textarea').first().fill('You are a helpful assistant for testing data sync.')
    await page.getByText('Add to monitor').first().click()
    await expect(page.getByText('Data sync prompt').first()).toBeVisible({ timeout: 10000 })
  })

  test('variant ranker comparison produces ranked results with scores', async ({ page }) => {
    await page.goto('/growth')
    const textarea = page.locator('textarea[placeholder="Paste your copy — headline, email, ad, CTA..."]')
    const addBtn = page.getByTestId('add-variant')

    await textarea.fill('Start your journey today.')
    await addBtn.click()
    await textarea.fill('Act now — limited time offer!')
    await addBtn.click()

    await page.getByText('Run Comparison').first().click()
    await expect(
      page.getByText('Variant A').first()
    ).toBeVisible({ timeout: 30000 })
    await expect(
      page.getByText('Variant B').first()
    ).toBeVisible()
    await expect(page.getByText('Load:').first()).toBeVisible()
    await expect(page.getByText('Trust:').first()).toBeVisible()
    await expect(
      page.getByText('Start New Comparison').first()
    ).toBeVisible()
  })

  test('LLM endpoint Test button shows result', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForTimeout(1000)
    const testBtn = page.getByRole('button', { name: 'Test' }).first()
    await expect(testBtn).toBeVisible({ timeout: 10000 })
    await testBtn.click()
    await expect(
      page.getByText('Healthy').first()
        .or(page.getByText('Failed').first())
    ).toBeVisible({ timeout: 10000 })
  })

})

test.describe('Public GCloud TRIBE endpoint', () => {

  test('scoring proxy health check responds', async ({ page }) => {
    const res = await page.request.get('http://localhost:3001/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  test('scoring proxy accepts POST /score and returns valid scores', async ({ page }) => {
    const res = await page.request.post('http://localhost:3001/score', {
      data: {
        stimulus_type: 'text',
        content: 'Test input for scoring',
        workspace_id: 'ws-test',
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.cognitive_load).toBeGreaterThanOrEqual(0)
    expect(body.cognitive_load).toBeLessThanOrEqual(100)
    expect(body.comprehension_confidence).toBeGreaterThanOrEqual(0)
    expect(body.trust_coherence).toBeGreaterThanOrEqual(0)
    expect(body.manipulation_risk).toBeGreaterThanOrEqual(0)
    expect(body.cognitive_risk).toMatch(/LOW|MEDIUM|HIGH/)
    expect(body.model_version).toBeDefined()
    expect(body.latency_ms).toBeGreaterThanOrEqual(0)
  })

  test('scoring proxy returns different scores for different input', async ({ page }) => {
    const calm = await page.request.post('http://localhost:3001/score', {
      data: { stimulus_type: 'text', content: 'Hello, how are you?', workspace_id: 'ws-test' },
    })
    const aggressive = await page.request.post('http://localhost:3001/score', {
      data: {
        stimulus_type: 'text',
        content: 'ACT NOW! LIMITED TIME! EXPERTS AGREE! DO NOT MISS THIS ONCE IN A LIFETIME OPPORTUNITY! BUY NOW OR REGRET FOREVER!',
        workspace_id: 'ws-test',
      },
    })
    const calmBody = await calm.json()
    const aggressiveBody = await aggressive.json()
    expect(aggressiveBody.manipulation_risk).toBeGreaterThan(calmBody.manipulation_risk)
  })

})
