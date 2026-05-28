import { test, expect } from '@playwright/test'

const routes = [
  { path: '/',          heading: 'Workspace Overview'    },
  { path: '/engineer',  heading: 'Engineer View'         },
  { path: '/pm',        heading: 'Product Manager View'  },
  { path: '/growth',    heading: 'Growth View'           },
  { path: '/designer',  heading: 'Designer View'         },
  { path: '/safety',    heading: 'Safety / Red Team View' },
  { path: '/approvals', heading: 'Act-Gated Approvals'   },
  { path: '/settings',  heading: 'Settings'              },
]

// ── All views render without errors ─────────────────────────────────────────

test.describe('All views render without errors', () => {
  for (const route of routes) {
    test(`${route.path} renders correctly`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => errors.push(err.message))

      await page.goto(route.path)
      await expect(page.locator(`text=${route.heading}`).first()).toBeVisible({ timeout: 5000 })

      const criticalErrors = errors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('404') &&
          !e.includes('Warning:') &&
          !e.includes('ERR_')
      )
      expect(criticalErrors).toHaveLength(0)
    })
  }
})

// ── PM view chart ────────────────────────────────────────────────────────────

test.describe('PM view chart', () => {
  test('Onboarding Flow chart is a line chart, not a bar chart', async ({ page }) => {
    await page.goto('/pm')

    await page.waitForSelector('text=Onboarding Flow — Cognitive Load Curve')

    const linePaths = await page.locator('.recharts-line-curve').count()
    expect(linePaths).toBeGreaterThanOrEqual(2)

    const barRects = await page.locator('.recharts-bar-rectangle').count()
    expect(barRects).toBe(0)
  })
})

// ── Act-Gated decision package ───────────────────────────────────────────────

test.describe('Act-Gated decision package', () => {
  test('View package expands to show TRIBE evidence', async ({ page }) => {
    await page.goto('/approvals')

    await page.click('text=View package')

    await expect(page.locator('text=TRIBE Evidence — Cognitive Scores')).toBeVisible()
    await expect(page.locator('text=Cognitive Load').first()).toBeVisible()
    await expect(page.locator('text=Top Brain Regions')).toBeVisible()
    await expect(page.locator('button:has-text("Approve")')).toBeVisible()
    await expect(page.locator('button:has-text("Reject")')).toBeVisible()
  })
})

// ── Manipulation evidence drawer ─────────────────────────────────────────────

test.describe('Manipulation evidence drawer', () => {
  test('View Evidence opens the evidence drawer', async ({ page }) => {
    await page.goto('/safety')

    await page.click('text=View Evidence')

    // Drawer sections visible
    await expect(page.locator('text=Neural Evidence — Cognitive Scores')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=Taxonomy Breakdown')).toBeVisible()
    await expect(page.locator('text=Activation Signature')).toBeVisible()

    // Close via the × button
    await page.click('button[aria-label="Close drawer"]')

    // The drawer uses CSS translate-x-full to slide off-screen (not display:none),
    // so Playwright still considers it "visible". Instead verify it's off-screen
    // by checking that the drawer's bounding box is entirely outside the viewport.
    const drawer = page.locator('div[role="dialog"][aria-label="Neural Evidence Package"]')
    await expect.poll(async () => {
      const box = await drawer.boundingBox()
      const viewportSize = page.viewportSize()
      if (!box || !viewportSize) return false
      // Drawer is off-screen when its left edge >= viewport width
      return box.x >= viewportSize.width
    }, { timeout: 5000 }).toBe(true)
  })
})
