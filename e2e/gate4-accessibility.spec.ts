import { test, expect, type Page } from '@playwright/test'

// Explicit browser-only fixtures. These are never deployed as workspace data.
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const workspaceId = '11111111-1111-4111-8111-111111111111'
const approvalId = '22222222-2222-4222-8222-222222222222'
const user = {
  id: userId, aud: 'authenticated', role:'authenticated', email:'tester@example.com',
  app_metadata:{provider:'email',providers:['email']}, user_metadata:{},
  created_at:'2026-01-01T00:00:00.000Z',
}
const session = {
  access_token:'browser-test-token', refresh_token:'test-refresh-token',
  token_type:'bearer', expires_in:999999999, expires_at:4102444800,
  user,
}

async function signInFixture(page:Page) {
  await page.addInitScript(({session}) => {
    if (location.origin === 'http://127.0.0.1:5174') {
      localStorage.setItem('sb-test-auth-auth-token', JSON.stringify(session))
    }
  }, {session})
  await page.route('https://test-auth.example/**', async route => {
    const url = new URL(route.request().url())
    const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({status:200,headers,body:JSON.stringify(user)})
    } else if (url.pathname === '/rest/v1/workspaces') {
      await route.fulfill({status:200,headers,body:JSON.stringify([{
        id:workspaceId,name:'Browser QA workspace',user_id:userId,
      }])})
    } else if (url.pathname === '/rest/v1/admin_approvals') {
      await route.fulfill({status:200,headers,body:JSON.stringify([{
        id:approvalId,workspace_id:workspaceId,action_type:'CONTENT_REVIEW',
        description:'Review the onboarding message for unverified urgency claims',
        evidence:{source:'synthetic-browser-fixture'},
        status:'pending',created_at:'2026-10-01T09:00:00.000Z',
        reviewer_id:null,justification:null,decided_at:null,
      }])})
    } else if (url.pathname === '/rest/v1/admin_integrations' ||
               url.pathname === '/rest/v1/admin_audit_events') {
      await route.fulfill({status:200,headers,body:'[]'})
    } else {
      await route.fulfill({status:404,headers,body:JSON.stringify({error:'No browser fixture for this route'})})
    }
  })
}

test.describe('Gate 4 authenticated admin accessibility smoke', () => {
  test.use({viewport:{width:390,height:844}})
  test('mobile navigation is keyboard-closed and returns focus to opener',async({page})=>{
    await signInFixture(page)
    await page.goto('/')
    const button=page.getByRole('button',{name:'Open navigation'})
    await expect(button).toBeVisible()
    await button.click()
    const dialog=page.getByRole('dialog',{name:'Mobile navigation'})
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link',{name:'Safety / Red Team'})).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(button).toBeFocused()
  })
  test('mobile drawer navigation does not strand keyboard focus',async({page})=>{
    await signInFixture(page)
    await page.goto('/')
    await page.getByRole('button',{name:'Open navigation'}).click()
    await page.getByRole('dialog',{name:'Mobile navigation'})
      .getByRole('link',{name:'Act-Gated Approvals'}).click()
    await expect(page).toHaveURL(/\/approvals$/)
    await expect(page.getByRole('dialog',{name:'Mobile navigation'})).toHaveCount(0)
    await expect(page.getByRole('heading',{name:'Act-Gated Approvals'})).toBeVisible()
  })
  test('approval dialog traps focus and supports Escape without submitting',async({page})=>{
    await signInFixture(page)
    await page.goto('/approvals')
    await page.getByRole('button',{name:'Approve review'}).click()
    const modal=page.getByRole('dialog',{name:'Record approval'})
    await expect(modal).toBeVisible()
    await expect(modal.getByLabel(/Required justification/)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Approve review'})).toBeFocused()
  })
})
test('desktop has skip navigation and no mobile drawer opener',async({page})=>{
  await signInFixture(page)
  await page.setViewportSize({width:1280,height:800})
  await page.goto('/')
  await expect(page.getByRole('link',{name:'Skip to main content'})).toHaveCount(1)
  await expect(page.getByRole('button',{name:'Open navigation'})).toBeHidden()
  await expect(page.getByRole('navigation',{name:'Primary navigation'})).toBeVisible()
})
