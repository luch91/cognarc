import { test, expect } from '@playwright/test'

test.describe('URL Extractor service', () => {

  test('health endpoint responds', async ({ request }) => {
    const res = await request.get('http://localhost:3008/health')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.service).toBe('url-extractor')
  })

  test('extracts content from a simple public page', async ({ request }) => {
    const res = await request.post('http://localhost:3008/extract', {
      data: {
        url: 'https://example.com',
        workspace_id: 'test',
        max_sections: 5,
      }
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.url).toBe('https://example.com')
    expect(data.total_word_count).toBeGreaterThanOrEqual(0)
    expect('warning' in data).toBeTruthy()
  })

  test('rejects localhost URLs', async ({ request }) => {
    const res = await request.post('http://localhost:3008/extract', {
      data: { url: 'http://localhost:3000', workspace_id: 'test' }
    })
    expect(res.status()).toBe(400)
    const data = await res.json()
    expect(data.detail).toContain('Private')
  })

  test('rejects invalid URLs', async ({ request }) => {
    const res = await request.post('http://localhost:3008/extract', {
      data: { url: 'not-a-url', workspace_id: 'test' }
    })
    expect(res.status()).toBe(400)
  })

})

test.describe('Copy Health Checker — URL tab', () => {

  test('URL tab is visible in Growth view', async ({ page }) => {
    await page.goto('/growth')
    await expect(
      page.getByTestId('url-tab')
    ).toBeVisible()
  })

  test('switching to URL tab shows URL input', async ({ page }) => {
    await page.goto('/growth')
    await page.getByTestId('url-tab').click()
    await expect(
      page.locator('input[type="url"]')
    ).toBeVisible()
  })

  test('invalid URL shows validation error', async ({ page }) => {
    await page.goto('/growth')
    await page.getByTestId('url-tab').click()
    const urlInput = page.locator('input[type="url"]')
    await urlInput.fill('not-a-valid-url')
    await expect(
      page.getByText('Please enter a valid URL').first()
    ).toBeVisible({ timeout: 2000 })
  })

  test('valid URL enables Analyse Page button', async ({ page }) => {
    await page.goto('/growth')
    await page.getByTestId('url-tab').click()
    const urlInput = page.locator('input[type="url"]')
    const btn = page.getByTestId('analyse-page-btn')

    await expect(btn).toBeDisabled()
    await urlInput.fill('https://example.com')
    await expect(btn).toBeEnabled()
  })

  test('valid URL triggers loading state', async ({ page }) => {
    await page.goto('/growth')
    await page.getByTestId('url-tab').click()
    await page.locator('input[type="url"]').fill('https://example.com')
    await page.getByTestId('analyse-page-btn').click()
    await expect(
      page.getByText('Fetching page...').first()
    ).toBeVisible({ timeout: 3000 })
  })

  test('analysis completes and shows health badge', async ({ page }) => {
    await page.goto('/growth')
    await page.getByTestId('url-tab').click()
    await page.locator('input[type="url"]').fill('https://stripe.com')
    await page.getByTestId('analyse-page-btn').click()
    const badge = page.getByTestId('health-badge')
    await expect(badge).toBeVisible({ timeout: 30000 })
  })

  test('section breakdown appears after analysis', async ({ page }) => {
    await page.goto('/growth')
    await page.getByTestId('url-tab').click()
    await page.locator('input[type="url"]').fill('https://stripe.com')
    await page.getByTestId('analyse-page-btn').click()
    await expect(
      page.getByTestId('section-breakdown')
    ).toBeVisible({ timeout: 30000 })
  })

})

test.describe('A/B Comparison — URL mode', () => {

  test('URL mode tab is visible in Designer view', async ({ page }) => {
    await page.goto('/designer')
    await expect(
      page.getByTestId('url-ab-tab')
    ).toBeVisible()
  })

  test('URL mode shows two URL inputs', async ({ page }) => {
    await page.goto('/designer')
    await page.getByTestId('url-ab-tab').click()
    const inputs = page.locator('input[type="url"]')
    await expect(inputs).toHaveCount(2)
  })

  test('Compare button disabled until both URLs entered', async ({ page }) => {
    await page.goto('/designer')
    await page.getByTestId('url-ab-tab').click()
    const compareBtn = page.getByText('Compare Pages')
    await expect(compareBtn).toBeDisabled()
    await page.locator('input[type="url"]').first().fill('https://example.com')
    await expect(compareBtn).toBeDisabled()
    await page.locator('input[type="url"]').nth(1).fill('https://iana.org')
    await expect(compareBtn).toBeEnabled()
  })

})
