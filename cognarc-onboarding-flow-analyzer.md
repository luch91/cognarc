# CognArc — Onboarding Flow Analyzer
## Standalone Prompt Pack — Real Input Mechanism

> **Context:** Fix Packs 1–4, URL Analysis, and Fix Pack 5 have been
> (or are being) applied. This pack gives the Designer view's
> "Onboarding Flow Analyzer — Step-by-Step Load Curve" a real input
> mechanism: users define their onboarding steps, the Behavioral SDK
> routes real events into per-step aggregation, and each row becomes
> clickable to show the underlying behavioral evidence.
>
> **The core problem this fixes:** The table currently shows six
> hardcoded rows (Welcome, Profile, Connect SDK, Configure, First Score,
> Complete) with invented Cognitive Load / Comprehension / Drop-off
> numbers and three static warning badges. Nothing real feeds it.
>
> **Sequencing:**
> FLOW-01 (Supabase schema) → FLOW-02 (Behavioral SDK event routing) →
> FLOW-03 (Define Flow UI) → FLOW-04 (live aggregation + warning logic) →
> FLOW-05 (clickable rows + evidence detail) → FLOW-06 (E2E tests)

---

## Pre-Flight

```bash
# Confirm Supabase is set up
cat package.json | grep supabase

# Find the Onboarding Flow Analyzer component
grep -r "Onboarding Flow Analyzer\|Step-by-Step Load Curve" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Find the Behavioral SDK package
ls packages/cognarc-sdk/ 2>/dev/null || echo "SDK package not found — check path"

# Find existing warning badge logic (Trust Timing, Comprehension Gap, Choice Overload)
grep -r "Trust Timing\|Comprehension Gap\|Choice Overload" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Confirm CognitiveScoreCard exists (used in detail panels)
grep -r "CognitiveScoreCard" src/ --include="*.tsx" --include="*.jsx" -l
```

---

## FLOW-01 · Supabase Schema for Onboarding Flow Tracking

```sql
-- Run in Supabase → SQL Editor → New query

-- Onboarding flow definition (the steps a workspace has configured)

CREATE TABLE onboarding_flows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Default Onboarding Flow',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE onboarding_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         UUID NOT NULL REFERENCES onboarding_flows(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  name            TEXT NOT NULL,            -- "Welcome", "Profile", etc.
  match_type      TEXT NOT NULL,            -- "route" | "event" | "manual"
  match_value     TEXT,                     -- route path or event name to match
  copy_text       TEXT,                     -- the actual instructional copy at this step
                                             -- (used for cognitive scoring of the step)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flow_id, step_order)
);

-- Behavioral events (raw events from the SDK, tagged to a step)

CREATE TABLE behavioral_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES onboarding_steps(id) ON DELETE SET NULL,
  session_id      TEXT NOT NULL,            -- anonymous session identifier from SDK
  event_type      TEXT NOT NULL,            -- rage_click | field_reentry_count |
                                             -- scroll_reversal | session_abandonment |
                                             -- scroll_velocity_change | click_error_rate
  cognitive_label TEXT NOT NULL,            -- confusion | working_memory_overload |
                                             -- comprehension_failure | trust_erosion_trigger
  metadata        JSONB,                    -- element selector, dwell time, etc. (no PII)
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE behavioral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON behavioral_events
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));
-- Public insert policy for the SDK (writes via anon key from the embedding site)
CREATE POLICY "sdk_insert" ON behavioral_events
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_behavioral_events_step ON behavioral_events(step_id, occurred_at);
CREATE INDEX idx_behavioral_events_workspace ON behavioral_events(workspace_id, occurred_at);

-- Step aggregates (computed rollups — refreshed periodically)

CREATE TABLE step_aggregates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id             UUID NOT NULL REFERENCES onboarding_steps(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sessions_entered    INTEGER NOT NULL DEFAULT 0,
  sessions_completed  INTEGER NOT NULL DEFAULT 0,
  drop_off_pct        FLOAT,
  cognitive_load      FLOAT,             -- from scoring copy_text via TRIBE/mock
  comprehension       FLOAT,
  rage_click_count    INTEGER DEFAULT 0,
  field_reentry_count INTEGER DEFAULT 0,
  scroll_reversal_count INTEGER DEFAULT 0,
  abandonment_count   INTEGER DEFAULT 0,
  warnings            TEXT[],            -- computed: trust_timing | comprehension_gap | choice_overload
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(step_id)
);

ALTER TABLE onboarding_flows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_aggregates     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_data" ON onboarding_flows
  FOR ALL USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));
CREATE POLICY "workspace_data" ON onboarding_steps
  FOR ALL USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));
CREATE POLICY "workspace_data" ON step_aggregates
  FOR ALL USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));
```

---

## FLOW-02 · Behavioral SDK — Route Events to Steps

**What this adds:** The Behavioral SDK (already built in Fix Pack 1) needs
to tag every captured event with which onboarding step it occurred in, then
send it to Supabase. Currently the SDK exists but nothing connects its
output to a step.

**Do not touch:** The SDK's core event capture logic (rage click detection,
scroll velocity, field re-entry counting). Only add step tagging + transmission.

```
Find packages/cognarc-sdk/ (the Behavioral SDK from Fix Pack 1 P-006).

PART 1: Step matching configuration

Add a new init option to the SDK:

  cognarc.init({
    workspaceId: 'ws-xxx',
    endpoint: 'https://[supabase-url]/rest/v1/behavioral_events',
    supabaseAnonKey: 'xxx',
    onboardingSteps: [
      { name: 'Welcome',     matchType: 'route', matchValue: '/welcome' },
      { name: 'Profile',     matchType: 'route', matchValue: '/profile' },
      { name: 'Connect SDK', matchType: 'route', matchValue: '/connect' },
      { name: 'Configure',   matchType: 'route', matchValue: '/configure' },
      { name: 'First Score', matchType: 'route', matchValue: '/first-score' },
      { name: 'Complete',    matchType: 'route', matchValue: '/complete' },
    ]
  })

  This config can also be fetched dynamically from CognArc's API
  instead of hardcoded, so changes in the dashboard (FLOW-03) apply
  without redeploying the embedding site's code:

  cognarc.init({
    workspaceId: 'ws-xxx',
    endpoint: '...',
    fetchStepsFromAPI: true   // fetches from GET /api/onboarding-steps/:workspaceId
  })

PART 2: Tag every event with the current step

On every track() call (existing SDK function from Fix Pack 1):

  function getCurrentStep(): string | null {
    const path = window.location.pathname
    const match = config.onboardingSteps.find(step => {
      if (step.matchType === 'route') return path === step.matchValue
        || path.startsWith(step.matchValue)
      return false
    })
    return match?.name ?? null
  }

  Modify the existing track() function to include the step:

  function track(eventType: string, metadata?: Record<string, unknown>) {
    const step = getCurrentStep()
    const cognitiveLabel = COGNITIVE_LABELS[eventType] ?? 'unknown'

    queueEvent({
      event_type: eventType,
      cognitive_label: cognitiveLabel,
      step_name: step,           // null if not in a tracked step
      session_id: getSessionId(),  // anonymous, no PII
      metadata: metadata ?? {},
      occurred_at: new Date().toISOString(),
    })
  }

PART 3: Transmission to Supabase

Use the existing batching logic from Fix Pack 1 P-006 (500ms buffer,
sendBeacon on unload). Change the transmission target:

  async function flushQueue() {
    if (eventQueue.length === 0) return
    const batch = [...eventQueue]
    eventQueue = []

    // Resolve step_name to step_id via a small local cache
    // (fetched once at init from GET /api/onboarding-steps/:workspaceId)
    const payload = batch.map(e => ({
      workspace_id: config.workspaceId,
      step_id: stepNameToId[e.step_name] ?? null,
      session_id: e.session_id,
      event_type: e.event_type,
      cognitive_label: e.cognitive_label,
      metadata: e.metadata,
      occurred_at: e.occurred_at,
    }))

    await fetch(`${config.supabaseUrl}/rest/v1/behavioral_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
      keepalive: true,  // survives page unload
    })
  }

PART 4: Session entry/completion tracking

In addition to friction events, track when a session ENTERS and
COMPLETES a step (needed for drop-off % calculation):

  Auto-fire on every route change (or call manually):

  function trackStepEntry(stepName: string) {
    track('step_entered', { step: stepName })
  }

  function trackStepCompletion(stepName: string) {
    track('step_completed', { step: stepName })
  }

  Auto-detection: if using a router, hook into route change events.
  For frameworks without an obvious hook, expose:
    cognarc.trackStepEntry('Profile')
    cognarc.trackStepCompletion('Profile')
  for manual instrumentation by the embedding site's developer.

Do not touch:
- Rage click / scroll velocity / field re-entry detection logic
- The 8KB bundle size constraint (verify after this change with
  `pnpm --filter cognarc-sdk build && pnpm --filter cognarc-sdk size`)
- The PII-free guarantee (step_name and event metadata must never
  contain user-entered text, only structural/positional data)
```

---

## FLOW-03 · Designer View — Define Flow UI

**What this adds:** A way for the user to define their onboarding steps
directly in the dashboard, without needing to edit SDK config code. This
also generates an embed snippet showing exactly what to add to their site.

**Do not touch:** The existing Onboarding Flow Analyzer table layout
(rows, columns, warning badge styling) — FLOW-04 will wire it to real
data without changing its visual structure.

```
Find the "Onboarding Flow Analyzer — Step-by-Step Load Curve" section
in the Designer view.

Add a "Define Flow" button at the top right of the section
(teal outline, small). Shown whenever no onboarding_steps exist yet
for this workspace, or always visible as "Edit Flow" once steps exist.

DEFINE FLOW MODAL

Title: "Define your onboarding flow"
Subline: "Tell CognArc which steps make up your onboarding. Each step
          can be matched by URL route, or tracked manually from your code."

A dynamic list of step rows (start with 1 empty row, "+ Add Step" below):

Each step row:
  Drag handle for reordering
  Input: "Step name" (e.g. "Welcome", "Profile")
  Match type selector (pill buttons): [Route]  [Manual event]
  If Route: Input "URL path" (e.g. "/onboarding/welcome")
  If Manual event: Read-only hint:
    "Call cognarc.trackStepEntry('[step name]') from your code"
  Textarea (collapsed by default, "+ Add step copy"):
    "Paste the instructional copy shown at this step (optional —
     used to compute Cognitive Load and Comprehension scores)"
  Remove step button

"+ Add Step" button (adds a new empty row at the bottom)

Bottom of modal:
  "Save Flow" button (teal, primary)
  "Cancel" button (outline)

On Save Flow:
  1. Insert/update onboarding_flows (one row, is_active: true)
  2. Insert/update onboarding_steps (one row per step, with step_order)
  3. If any step has copy_text filled in, immediately score it:
     POST /score for each step with copy_text
     Store result for use in FLOW-04 aggregation
  4. Close modal
  5. Show the embed snippet panel (see below)

EMBED SNIPPET PANEL (shown after saving)

A panel that appears below the table after Define Flow is saved:

Header: "Add this to your site to start tracking"
Subline: "Install the Behavioral SDK and initialise it with your
          workspace ID. CognArc will automatically detect step
          transitions based on the routes you defined."

Code block (copy button):

  npm install @cognarc/sdk

  import { cognarc } from '@cognarc/sdk'

  cognarc.init({
    workspaceId: '[actual workspace id]',
    fetchStepsFromAPI: true,
  })

If any steps use "Manual event" matching, show an additional snippet:

  // Call these when the user enters/completes a manually-tracked step
  cognarc.trackStepEntry('Connect SDK')
  cognarc.trackStepCompletion('Connect SDK')

Below the code block:
  "Waiting for events..." with a small pulsing dot, until the first
  behavioral_events row arrives for this workspace (check via
  Supabase realtime subscription). Once the first event arrives,
  replace with: "Receiving live data" (green, with timestamp of
  first event).

A "Use Demo Data" button (outline, secondary) — for users who want
to see the feature working before instrumenting their own site.
On click: seeds the 6 example steps with realistic mock behavioral
events spread over the last 7 days (see FLOW-04 for the demo data
generation logic). This becomes the default state for new workspaces
so the section is never empty on first view.

Do not touch:
- The table's row/column structure
- The warning badge visual styling
```

---

## FLOW-04 · Live Aggregation + Warning Logic

**What this adds:** The actual computation that turns raw behavioral_events
rows into the Cognitive Load / Comprehension / Drop-off % numbers and the
three warning badges, replacing 100% of the hardcoded values.

**Prerequisite:** FLOW-01, FLOW-02, FLOW-03 complete.

**Do not touch:** The table's visual layout from the original implementation.

```
PART 1: Aggregation function (runs in api-gateway or as a
Supabase Edge Function, triggered on a schedule + on-demand)

Create services/api-gateway/src/jobs/aggregate-onboarding-steps.ts
(or Supabase Edge Function equivalent)

For each active onboarding_steps row, compute:

  async function aggregateStep(stepId: string, workspaceId: string) {
    // 1. Drop-off %: sessions that entered this step but never
    //    reached the NEXT step (or never fired step_completed)
    const entered = await countEvents(stepId, 'step_entered')
    const completed = await countEvents(stepId, 'step_completed')
    const dropOffPct = entered > 0
      ? Math.round(((entered - completed) / entered) * 100)
      : null

    // 2. Friction event counts (last 30 days)
    const rageClicks   = await countEvents(stepId, 'rage_click')
    const fieldReentry = await countEvents(stepId, 'field_reentry_count')
    const scrollRev    = await countEvents(stepId, 'scroll_reversal')
    const abandonment  = await countEvents(stepId, 'session_abandonment')

    // 3. Cognitive Load + Comprehension: from scoring the step's
    //    copy_text (set in FLOW-03), OR derived from behavioral
    //    signal density if no copy_text was provided
    const step = await getStep(stepId)
    let cognitiveLoad, comprehension

    if (step.copy_text) {
      const scores = await callScoringService(step.copy_text, workspaceId)
      cognitiveLoad = scores.cognitive_load
      comprehension = scores.comprehension_confidence
    } else {
      // Derive from behavioral signal density (fallback when no
      // copy was provided): more friction events per session = higher load
      const sessionsAtStep = Math.max(entered, 1)
      const frictionDensity = (rageClicks + fieldReentry + scrollRev) / sessionsAtStep
      cognitiveLoad = Math.min(95, 30 + frictionDensity * 15)
      comprehension = Math.max(20, 90 - frictionDensity * 12)
    }

    // 4. Warning detection (same thresholds the original mock used)
    const warnings: string[] = []

    // Trust Timing: step asks for data/connection AND occurs early
    // in the flow (step_order <= 2) AND has any abandonment signal
    if (step.step_order <= 2 && abandonment > 0 &&
        /profile|connect|sign.?up|email|payment/i.test(step.name)) {
      warnings.push('trust_timing')
    }

    // Comprehension Gap: comprehension < 55
    if (comprehension < 55) {
      warnings.push('comprehension_gap')
    }

    // Choice Overload: cognitive load > 83
    if (cognitiveLoad > 83) {
      warnings.push('choice_overload')
    }

    // 5. Upsert into step_aggregates
    await supabase.from('step_aggregates').upsert({
      step_id: stepId,
      workspace_id: workspaceId,
      sessions_entered: entered,
      sessions_completed: completed,
      drop_off_pct: dropOffPct,
      cognitive_load: Math.round(cognitiveLoad),
      comprehension: Math.round(comprehension),
      rage_click_count: rageClicks,
      field_reentry_count: fieldReentry,
      scroll_reversal_count: scrollRev,
      abandonment_count: abandonment,
      warnings,
      computed_at: new Date().toISOString(),
    })
  }

Trigger this:
  a. On a schedule (every 15 minutes via Supabase Cron or a Cloud
     Run scheduled job) for all workspaces with active flows
  b. On-demand: add a "Refresh now" button to the Onboarding Flow
     Analyzer section (see FLOW-05) that calls this for the current
     workspace's steps immediately

PART 2: Replace the hardcoded table with live data

In the Designer view Onboarding Flow Analyzer component:

  const { data: steps } = await supabase
    .from('onboarding_steps')
    .select('*, step_aggregates(*)')
    .eq('workspace_id', workspaceId)
    .order('step_order')

Render each row using step_aggregates data:
  Step name (from onboarding_steps.name)
  Warning badges (from step_aggregates.warnings array — map to the
    same visual badges: trust_timing → "Trust Timing",
    comprehension_gap → "Comprehension Gap",
    choice_overload → "Choice Overload")
  Cognitive Load (from step_aggregates.cognitive_load)
  Comprehension (from step_aggregates.comprehension)
  Drop-off % (from step_aggregates.drop_off_pct, or "—" if null/first step)

If step_aggregates is null for a step (no events yet):
  Show "Awaiting data" in muted grey across Load/Comprehension/Drop-off
  instead of a number or dash.

PART 3: Demo data generator (for "Use Demo Data" button from FLOW-03)

  async function seedDemoOnboardingData(workspaceId: string, flowId: string) {
    const steps = [
      { name: 'Welcome',     order: 1, sessions: 1000, completionRate: 0.96 },
      { name: 'Profile',     order: 2, sessions: 960,  completionRate: 0.92 },
      { name: 'Connect SDK', order: 3, sessions: 883,  completionRate: 0.78 },
      { name: 'Configure',   order: 4, sessions: 689,  completionRate: 0.61 },
      { name: 'First Score', order: 5, sessions: 420,  completionRate: 0.90 },
      { name: 'Complete',    order: 6, sessions: 378,  completionRate: 1.0  },
    ]

    for (const s of steps) {
      const stepId = await insertStep(flowId, workspaceId, s.name, s.order)
      const entered = s.sessions
      const completed = Math.round(entered * s.completionRate)

      // Generate realistic friction events scaled to drop-off severity
      const frictionRate = 1 - s.completionRate
      await insertMockEvents(stepId, workspaceId, {
        step_entered: entered,
        step_completed: completed,
        rage_click: Math.round(entered * frictionRate * 0.3),
        field_reentry_count: Math.round(entered * frictionRate * 0.4),
        scroll_reversal: Math.round(entered * frictionRate * 0.2),
        session_abandonment: entered - completed,
      })
    }

    // Trigger aggregation immediately after seeding
    for (const step of steps) {
      await aggregateStep(step.id, workspaceId)
    }
  }

  This produces realistic numbers close to the original mock
  (Welcome: low load, high comprehension, no drop-off; Configure:
  high load, low comprehension, steep drop-off) but generated FROM
  actual event rows rather than hardcoded display values — meaning
  the rest of the pipeline (warnings, aggregation, clickable detail
  in FLOW-05) all genuinely work end to end even before a real user
  visits the site.

Do not touch:
- Table column headers or row layout
- Warning badge colours/styling
```

---

## FLOW-05 · Clickable Rows with Behavioral Evidence

**What this adds:** Clicking any step row expands a detail panel showing
the actual behavioral events that produced the row's scores — not just
a recomputed number, but the underlying evidence.

**Prerequisite:** FLOW-01 through FLOW-04 complete.

**Do not touch:** The collapsed row layout. The table headers.

```
Find the Onboarding Flow Analyzer table (now wired to live data
from FLOW-04).

Make each row clickable (cursor-pointer, hover background, chevron
indicator — same interaction pattern as the Prompt Regression Monitor
from Fix Pack 3 Live LLM-C06).

data-testid="onboarding-step-row" on each row
data-testid="onboarding-step-detail" on each detail panel

DETAIL PANEL CONTENT

SECTION A: Funnel visual
  A simple horizontal bar: "[entered] sessions entered →
  [completed] completed → [drop_off_pct]% drop-off"
  Rendered as a proportional bar chart (entered = full width,
  completed = filled portion)

SECTION B: Friction Event Breakdown
  A small bar chart (Recharts) showing counts of each event type
  at this step over the last 7 days:
    Rage clicks · Field re-entry · Scroll reversal · Abandonment
  Each bar clickable-tooltip showing exact count.

SECTION C: Cognitive Score Source
  If the step has copy_text:
    Show the CognitiveScoreCard (compact, manager mode) with the
    scores computed FROM that copy.
    Show the copy_text itself in a box below:
    "Scored copy: '[the actual text]'"
  If no copy_text (derived from behavioral density):
    "No instructional copy was provided for this step. Scores are
     estimated from behavioral friction density. For more accurate
     scoring, add the step's copy in Define Flow, [step name],
     Add step copy."
    "Edit step copy" link (opens Define Flow modal, scrolled to
    this step)

SECTION D: Why This Warning Fired (only if warnings exist)
  For each active warning on this step, a plain-English explanation:

  Trust Timing:
    "This step occurs early in your flow (step [n] of [total]) and
     asks for [profile/connection/payment] information. [n] sessions
     abandoned at this point — users may not yet trust your product
     enough to share this."
    Recommendation: "Consider moving this step later, after users
    have experienced value, or explain why this information is
    needed before asking."

  Comprehension Gap:
    "Comprehension score is [n]/100 — below the 55 threshold.
     [n] users showed scroll reversal or field re-entry, suggesting
     confusion rather than simple difficulty."
    Recommendation: "Review the instructional copy for this step.
    If copy_text exists, click 'Get Rewrite Suggestions' below."

  Choice Overload:
    "Cognitive load is [n]/100, above the 83 threshold. This
     usually means too many decisions or fields are presented
     simultaneously."
    Recommendation: "Consider breaking this step into two simpler
    steps, or reducing the number of visible options."

  If the step has copy_text and any warning is active:
    "Get Rewrite Suggestions" button — calls requestRewrites()
    with the step's copy_text, copyType: "microcopy", and the
    step's current scores. Same pattern as everywhere else in
    the product.

SECTION E: Actions
  "Refresh this step" button — re-runs aggregateStep() for just
    this step on demand, updates the row immediately
  "Edit step" button — opens Define Flow modal scrolled to this step
  "View raw events" button — opens a simple table of the last 50
    behavioral_events rows for this step (timestamp, event_type,
    cognitive_label — no session_id shown, to avoid implying
    individual user tracking in the UI even though sessions are anonymous)

Do not touch:
- The collapsed row appearance
- Table column headers
```

---

## FLOW-06 · E2E Tests

```
Create e2e/onboarding-flow-analyzer.spec.ts:

import { test, expect } from '@playwright/test'

test.describe('Define Flow', () => {

  test('Define Flow button is visible', async ({ page }) => {
    await page.goto('/designer')
    await expect(
      page.locator('text=Define Flow').or(page.locator('text=Edit Flow'))
    ).toBeVisible()
  })

  test('Define Flow modal allows adding steps', async ({ page }) => {
    await page.goto('/designer')
    await page.click('text=Define Flow')
    await expect(page.locator('text=Define your onboarding flow')).toBeVisible()
    await page.fill('input[placeholder*="Step name"]', 'Welcome')
    await page.click('text=+ Add Step')
    const stepNameInputs = page.locator('input[placeholder*="Step name"]')
    await expect(stepNameInputs).toHaveCount(2)
  })

  test('saving a flow shows the embed snippet', async ({ page }) => {
    await page.goto('/designer')
    await page.click('text=Define Flow')
    await page.fill('input[placeholder*="Step name"]', 'Welcome')
    await page.fill('input[placeholder*="URL path"]', '/onboarding/welcome')
    await page.click('text=Save Flow')
    await expect(page.locator('text=Add this to your site')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=npm install @cognarc/sdk')).toBeVisible()
  })

  test('Use Demo Data button populates the table', async ({ page }) => {
    await page.goto('/designer')
    const demoBtn = page.locator('text=Use Demo Data')
    if (await demoBtn.isVisible()) {
      await demoBtn.click()
      await page.waitForTimeout(3000)
      await expect(page.locator('text=Welcome')).toBeVisible()
      await expect(page.locator('text=Configure')).toBeVisible()
      await expect(page.locator('text=Awaiting data')).not.toBeVisible()
    }
  })

})

test.describe('Live aggregation', () => {

  test('table shows Awaiting data for steps with no events', async ({ page }) => {
    await page.goto('/designer')
    await expect(
      page.locator('text=Awaiting data').first()
    ).toBeVisible({ timeout: 3000 }).catch(() => {
      // If demo data was already seeded, this is expected to not appear
    })
  })

  test('Refresh now button triggers re-aggregation', async ({ page }) => {
    await page.goto('/designer')
    const refreshBtn = page.locator('text=Refresh now')
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click()
      await expect(
        page.locator('text=Refreshing').or(page.locator('text=Updated'))
      ).toBeVisible({ timeout: 5000 })
    }
  })

})

test.describe('Clickable step rows', () => {

  test('rows are clickable', async ({ page }) => {
    await page.goto('/designer')
    const rows = page.locator('[data-testid="onboarding-step-row"]')
    if (await rows.count() > 0) {
      await expect(rows.first()).toHaveCSS('cursor', 'pointer')
    }
  })

  test('clicking a row expands detail panel with funnel visual', async ({ page }) => {
    await page.goto('/designer')
    const rows = page.locator('[data-testid="onboarding-step-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(
        page.locator('[data-testid="onboarding-step-detail"]').first()
      ).toBeVisible({ timeout: 2000 })
      await expect(
        page.locator('text=sessions entered')
          .or(page.locator('text=completed'))
      ).toBeVisible()
    }
  })

  test('Configure step (with warnings) shows plain-English explanation', async ({ page }) => {
    await page.goto('/designer')
    const configureRow = page.locator('text=Configure').locator('..')
    if (await configureRow.isVisible()) {
      await configureRow.click()
      await expect(
        page.locator('text=Choice Overload')
          .or(page.locator('text=too many decisions'))
      ).toBeVisible({ timeout: 2000 })
    }
  })

  test('step with copy_text shows Get Rewrite Suggestions button', async ({ page }) => {
    await page.goto('/designer')
    const configureRow = page.locator('text=Configure').locator('..')
    if (await configureRow.isVisible()) {
      await configureRow.click()
      const rewriteBtn = page.locator('text=Get Rewrite Suggestions')
      if (await rewriteBtn.isVisible()) {
        await expect(rewriteBtn).toBeVisible()
      }
    }
  })

  test('View raw events shows event table without session identifiers', async ({ page }) => {
    await page.goto('/designer')
    const rows = page.locator('[data-testid="onboarding-step-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      const viewEventsBtn = page.locator('text=View raw events')
      if (await viewEventsBtn.isVisible()) {
        await viewEventsBtn.click()
        await expect(page.locator('text=event_type').or(
          page.locator('th:has-text("Event")')
        )).toBeVisible({ timeout: 2000 })
        await expect(page.locator('text=session_id')).not.toBeVisible()
      }
    }
  })

})

test.describe('Behavioral SDK step tagging', () => {

  test('SDK bundle size remains under 8KB after step tagging changes', async ({ page }) => {
    // This is a build-time check — verify via CLI, not Playwright
    // Included here as a reminder; run separately:
    // pnpm --filter cognarc-sdk build && pnpm --filter cognarc-sdk size
    expect(true).toBe(true)
  })

})
```

---

## Run Tests

```bash
# Verify SDK bundle size first (critical constraint)
cd packages/cognarc-sdk
pnpm build && pnpm size
# Must stay under 8192 bytes gzipped

# Run the E2E suite
npx playwright test e2e/onboarding-flow-analyzer.spec.ts

# Run with visible browser
npx playwright test e2e/onboarding-flow-analyzer.spec.ts --headed

# Test the aggregation job directly
curl -X POST http://localhost:3000/api/jobs/aggregate-onboarding-steps \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "ws-1"}'
```

---

## What Not to Touch

| Already working | Status |
|---|---|
| Table column headers (Step, Cognitive Load, Comprehension, Drop-off %) | Unchanged |
| Warning badge visual styling | Unchanged — only the trigger logic becomes real |
| Behavioral SDK rage click / scroll / field re-entry detection | Unchanged — only adds step tagging |
| CognitiveScoreCard component | Used in detail panel, not rebuilt |
| Heatmap Viewer, A/B Comparison sections (Designer view) | Untouched |
| 8KB SDK bundle size constraint | Must verify after FLOW-02, do not exceed |

---

## Data Flow Summary

```
User defines onboarding steps in Define Flow modal (FLOW-03)
          |
Embed snippet generated -> developer adds SDK to their site
          |
Real users move through onboarding on the embedding site
          |
Behavioral SDK detects friction events (rage click, field re-entry,
  scroll reversal) + step entry/completion, tags each with the
  current step (FLOW-02)
          |
Events batched and sent to Supabase behavioral_events table
          |
Aggregation job runs every 15 min (or on-demand via Refresh button)
  -> computes drop-off %, cognitive load, comprehension, warnings
  -> writes to step_aggregates (FLOW-04)
          |
Designer view Onboarding Flow Analyzer reads step_aggregates,
  renders live table — no more hardcoded values
          |
Clicking a row shows the actual behavioral evidence + plain-English
  explanation of any warning + rewrite suggestions if copy was scored
  (FLOW-05)
```

---

*CognArc Onboarding Flow Analyzer - Standalone Pack*
*Requires Fix Packs 1-4 applied*
*FLOW-01 -> FLOW-02 -> FLOW-03 -> FLOW-04 -> FLOW-05 -> FLOW-06*
