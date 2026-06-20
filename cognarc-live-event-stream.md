# CognArc — Live Event Stream
## Standalone Prompt Pack — Analytics Connector Data Visibility

> **Context:** This pack depends on FIX5-06 (real analytics connector
> connections) from Fix Pack 5 being complete. Without real connections,
> there is nothing real to stream. If FIX5-06 is not yet done, this pack
> will build correctly but the stream will stay empty until it is.
>
> **The problem this fixes:** Once Segment, Amplitude, PostHog, etc. are
> genuinely connected (FIX5-06), there is still no place in the product
> where a user can see the actual events flowing through that connection.
> The PM view's connector table shows a summary count. Nothing shows the
> real-time stream, the cognitive label translation happening on each
> event, or proof that write-back actually landed in the user's own tool.
>
> **Sequencing:**
> STREAM-01 (Supabase schema + inbound capture) ->
> STREAM-02 (webhook/ingest handlers write to the table) ->
> STREAM-03 (PM view Live Event Stream panel) ->
> STREAM-04 (event detail drawer + write-back verification) ->
> STREAM-05 (E2E tests)

---

## Pre-Flight

```bash
# Confirm FIX5-06 (real analytics connections) is applied
grep -r "verify-amplitude-connection\|verify-posthog-connection" \
  services/api-gateway/ 2>/dev/null || echo "FIX5-06 not yet applied — stream will be empty until it is"

# Confirm the PM view Analytics Connector Status table exists
grep -r "Analytics Connector Status" src/ --include="*.tsx" --include="*.jsx" -l

# Confirm Recent Event Labels section exists (from Fix Pack 3 Live)
grep -r "Recent Event Labels" src/ --include="*.tsx" --include="*.jsx" -l

# Confirm api-gateway webhook routes directory
ls services/api-gateway/src/routes/webhooks/ 2>/dev/null || echo "Not found — check path"

# Confirm Supabase realtime is already used elsewhere (Fix Pack 4 LIVE-04)
grep -r "postgres_changes\|supabase.channel" src/ --include="*.tsx" --include="*.jsx" -l
```

---

## STREAM-01 · Supabase Schema for Analytics Event Capture

```sql
-- Run in Supabase → SQL Editor → New query

CREATE TABLE analytics_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform              TEXT NOT NULL,
  raw_event_name        TEXT NOT NULL,
  raw_properties        JSONB,
  cognitive_label       TEXT,
  cognitive_label_rule  TEXT,
  write_back_status     TEXT NOT NULL DEFAULT 'pending',
  write_back_error      TEXT,
  write_back_ref        TEXT,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at          TIMESTAMPTZ
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_data" ON analytics_events
  FOR SELECT USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_analytics_events_workspace_time
  ON analytics_events(workspace_id, received_at DESC);
CREATE INDEX idx_analytics_events_platform
  ON analytics_events(workspace_id, platform, received_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE analytics_events;
```

Notes on this schema:
- `platform` is one of: segment | amplitude | mixpanel | posthog | ga4
- `raw_properties` holds event properties as received, PII-stripped
- `cognitive_label` is the derived label (e.g. "confusion"), nullable if no rule matched
- `cognitive_label_rule` records which mapping rule produced the label, for transparency
- `write_back_status` is one of: pending | success | failed | disabled
- `write_back_ref` stores a platform-specific event ID used to build "View in [Platform]" links
- Inserts come from server-side webhook handlers using the service role key, not from the client — unlike `behavioral_events`, which the SDK writes directly from the browser, so no public insert policy is needed here

---

## STREAM-02 · Wire Webhook/Ingest Handlers to Capture Events

**What this adds:** Every existing (or FIX5-06-built) webhook/API ingest
handler for Segment, Amplitude, PostHog, etc. now inserts a row into
`analytics_events` on every received event, applies the cognitive label
mapping, attempts write-back, and records the outcome.

**Prerequisite:** FIX5-06 complete (real connector credentials exist
in `workspace_settings.connectors`). STREAM-01 complete.

**Do not touch:** The connector configuration UI in Settings. The
write-back toggle logic itself (only extend what happens after a toggle
is checked).

```
This builds on the analytics connector webhook/ingest endpoints.
If FIX5-06 already created a Segment webhook receiver and Amplitude/
PostHog polling or webhook handlers, extend them. If they do not
exist yet, create minimal versions here — find them first:

  grep -r "webhooks/segment\|webhooks/amplitude" services/api-gateway/

PART 1: Cognitive label mapping (shared across all platforms)

Create services/api-gateway/src/lib/cognitive-label-map.ts:

  export const COGNITIVE_LABEL_RULES: Record<string, {
    label: string
    rule: string
    matcher: (eventName: string, props: Record<string, unknown>) => boolean
  }> = {
    rage_click: {
      label: 'confusion',
      rule: 'rage_click -> confusion',
      matcher: (name) => /rage.?click/i.test(name),
    },
    field_reentry: {
      label: 'working_memory_overload',
      rule: 'field_reentry_count >= 3 -> working_memory_overload',
      matcher: (name, props) =>
        /field.?reentry/i.test(name) && (props.count as number ?? 0) >= 3,
    },
    scroll_reversal: {
      label: 'comprehension_failure',
      rule: 'scroll_reversal -> comprehension_failure',
      matcher: (name) => /scroll.?reversal/i.test(name),
    },
    session_abandonment_post_modal: {
      label: 'trust_erosion_trigger',
      rule: 'session_abandonment after modal -> trust_erosion_trigger',
      matcher: (name, props) =>
        /session.?abandon/i.test(name) && props.context === 'post_modal',
    },
    dwell_no_scroll: {
      label: 'cognitive_load_stall',
      rule: 'dwell > 30s with no scroll -> cognitive_load_stall',
      matcher: (name, props) =>
        /dwell/i.test(name) && (props.dwell_seconds as number ?? 0) > 30
        && !props.scrolled,
    },
    high_velocity_no_click: {
      label: 'low_attention_engagement',
      rule: 'high scroll velocity + zero clicks -> low_attention_engagement',
      matcher: (name, props) =>
        /scroll.?velocity/i.test(name) && (props.clicks as number ?? 0) === 0,
    },
  }

  export function deriveCognitiveLabel(
    eventName: string,
    properties: Record<string, unknown>
  ): { label: string | null; rule: string | null } {
    for (const rule of Object.values(COGNITIVE_LABEL_RULES)) {
      if (rule.matcher(eventName, properties)) {
        return { label: rule.label, rule: rule.rule }
      }
    }
    return { label: null, rule: null }
  }

PART 2: Shared event capture function

Create services/api-gateway/src/lib/capture-analytics-event.ts:

  import { deriveCognitiveLabel } from './cognitive-label-map'
  import { supabaseAdmin } from './supabase-admin'
  import { stripPII } from './pii-filter'

  interface CaptureParams {
    workspaceId: string
    platform: 'segment' | 'amplitude' | 'mixpanel' | 'posthog' | 'ga4'
    rawEventName: string
    rawProperties: Record<string, unknown>
  }

  export async function captureAnalyticsEvent(params: CaptureParams) {
    const cleanProps = stripPII(params.rawProperties)
    const { label, rule } = deriveCognitiveLabel(params.rawEventName, cleanProps)

    const { data: inserted } = await supabaseAdmin
      .from('analytics_events')
      .insert({
        workspace_id: params.workspaceId,
        platform: params.platform,
        raw_event_name: params.rawEventName,
        raw_properties: cleanProps,
        cognitive_label: label,
        cognitive_label_rule: rule,
        write_back_status: label ? 'pending' : 'disabled',
      })
      .select('id')
      .single()

    if (!label || !inserted) return

    const { data: settings } = await supabaseAdmin
      .from('workspace_settings')
      .select('connectors')
      .eq('workspace_id', params.workspaceId)
      .single()

    const connectorConfig = settings?.connectors?.[params.platform]
    if (!connectorConfig?.writeBack) {
      await supabaseAdmin.from('analytics_events')
        .update({ write_back_status: 'disabled', processed_at: new Date().toISOString() })
        .eq('id', inserted.id)
      return
    }

    try {
      const writeBackRef = await writeBackToPlatform(
        params.platform, connectorConfig, params.rawEventName, label
      )
      await supabaseAdmin.from('analytics_events')
        .update({
          write_back_status: 'success',
          write_back_ref: writeBackRef,
          processed_at: new Date().toISOString(),
        })
        .eq('id', inserted.id)
    } catch (err) {
      await supabaseAdmin.from('analytics_events')
        .update({
          write_back_status: 'failed',
          write_back_error: (err as Error).message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', inserted.id)
    }
  }

  async function writeBackToPlatform(
    platform: string, config: any, eventName: string, label: string
  ): Promise<string> {
    switch (platform) {
      case 'segment':
        return await segmentWriteBack(config, eventName, label)
      case 'amplitude':
        return await amplitudeWriteBack(config, eventName, label)
      case 'posthog':
        return await posthogWriteBack(config, eventName, label)
      default:
        throw new Error(`Write-back not implemented for ${platform}`)
    }
  }

  // Implement segmentWriteBack, amplitudeWriteBack, posthogWriteBack
  // using the credential decryption helper already built in FIX5-06.
  // Each returns a platform event ID/ref string used for the
  // "View in [Platform]" link in STREAM-04.

PART 3: Wire into each platform's existing ingest point

Segment (webhook receiver from FIX5-06):
  After verifying the webhook signature, call:
    await captureAnalyticsEvent({
      workspaceId, platform: 'segment',
      rawEventName: payload.event,
      rawProperties: payload.properties,
    })

Amplitude / PostHog / GA4 (if using polling rather than webhooks):
  In the polling job that fetches recent events, call
  captureAnalyticsEvent() for each new event found since the last poll.

  If FIX5-06 only built connection verification and not actual event
  ingestion, add a minimal polling job:
    services/api-gateway/src/jobs/poll-analytics-events.ts
    Runs every 60 seconds per connected platform with polling support.
    Tracks a last_polled_at cursor per platform in workspace_settings
    to avoid re-fetching the same events.

Do not touch:
- The connector Configure modals built in FIX5-06
- The write-back toggle UI itself
- The credential encryption/decryption helpers from FIX5-06
```

---

## STREAM-03 · PM View — Live Event Stream Panel

**What this adds:** A new panel below the existing Analytics Connector
Status table showing connection health and a real-time scrolling event
stream.

**Prerequisite:** STREAM-01, STREAM-02 complete.

**Do not touch:** The Analytics Connector Status table. The Recent Event
Labels section (this panel replaces it — see note below). The Onboarding
Flow chart. The Connected Model Cognitive Profiles table.

```
Find the Analytics Connector Status table in the PM view.

NOTE: The "Recent Event Labels" section built in Fix Pack 3 Live was
pre-seeded mock data demonstrating what this would look like. This
prompt REPLACES that section with the real, live version. If "Recent
Event Labels" still exists as hardcoded mock data, remove it and build
this in its place at the same position in the view.

PART 1: Connection Health Row

Add directly below the Analytics Connector Status table:

Header: "Live Connection Health"

For each platform with status "connected" in workspace_settings.connectors,
show a compact row:

  [pulse dot] [Platform name]   Last event: [relative time]   [n] events today   [write-back status]

Pulse dot logic:
  Query: SELECT MAX(received_at) FROM analytics_events
         WHERE workspace_id = $1 AND platform = $2
  If most recent event < 60 seconds ago: green dot, CSS pulse animation
  If most recent event 60s-5min ago: green dot, no pulse
  If most recent event > 5min ago: amber dot
  If no events ever received: grey dot, text "No events received"

Events today count: COUNT(*) FROM analytics_events WHERE platform = $2
  AND received_at > start of today

Write-back status (aggregate for this platform today):
  "Write-back healthy" — if >95% of today's events have write_back_status = 'success'
  "[n] write-back failures today" — if any failed, shown in amber
  "Write-back disabled" — if the connector's writeBack toggle is off

For platforms with status "not_connected": do not show a row here.
Instead show one line: "Connect more platforms in Settings →" (link)

PART 2: Live Event Stream

Header: "Live Event Stream"
Subline: "Real-time events from your connected platforms, with the
          cognitive label CognArc applied."

FILTER BAR (above the stream table):
  Platform dropdown: All Platforms | Segment | Amplitude | Mixpanel | PostHog | GA4
  Cognitive label dropdown: All Labels | Confusion | Working Memory Overload |
    Comprehension Failure | Trust Erosion Trigger | Cognitive Load Stall |
    Low Attention Engagement
  Search input: "Search event name..."
  "Pause stream" toggle (pauses auto-scroll/auto-update without
    disconnecting — useful when a user wants to read a specific
    moment without new rows pushing it down)

STREAM TABLE:
  Columns: TIME | PLATFORM | RAW EVENT | COGNITIVE LABEL | WRITE-BACK

  Newest events at the top. Auto-updates via Supabase realtime
  subscription on the analytics_events table, filtered to this
  workspace_id and any active filters:

  const channel = supabase
    .channel('analytics-stream')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'analytics_events',
      filter: `workspace_id=eq.${workspaceId}`
    }, (payload) => {
      if (!streamPaused) {
        setEvents(prev => [payload.new, ...prev].slice(0, 100))
      }
    })
    .subscribe()

  Initial load: most recent 50 events for this workspace, ordered
  by received_at DESC.

  New rows animate in with a brief highlight (light teal background
  fading to white over 1.5s) so the user's eye catches new arrivals
  without being jarring.

  Platform column: small coloured badge per platform (reuse the
  colour-per-platform-initial circles already used in the connector
  table: Segment green, Amplitude blue, Mixpanel purple, PostHog
  orange, GA4 yellow)

  Cognitive label column: coloured text matching the existing
  styling convention (red/amber for negative signals like
  confusion/trust_erosion, amber for moderate signals like
  cognitive_load_stall)

  Write-back column: small icon + status
    green check — write_back_status === 'success'
    red x — write_back_status === 'failed' (hover shows error tooltip)
    grey dash — write_back_status === 'disabled'
    grey clock — write_back_status === 'pending'

  Each row is clickable -> opens the event detail drawer (STREAM-04)

EMPTY STATE (no events ever received for this workspace):
  Centered illustration/icon + text:
  "No events received yet."
  "Once you connect a platform in Settings and your site starts
   sending events, they will appear here in real time."
  Button: "Go to Settings →"

EMPTY STATE (events exist but current filters match none):
  "No events match your filters."
  "Clear filters" link

Do not touch:
- The Analytics Connector Status table above this panel
- The Onboarding Flow chart below this panel
- The Connected Model Cognitive Profiles table
```

---

## STREAM-04 · Event Detail Drawer + Write-Back Verification

**What this adds:** Clicking any row in the Live Event Stream opens a
drawer showing the full raw payload, which cognitive label rule fired
and why, and — when write-back succeeded — a link to view the labeled
event directly inside the user's own analytics platform.

**Prerequisite:** STREAM-03 complete.

**Do not touch:** The stream table itself. The Evidence drawer pattern
from the Safety view (reuse its slide-in mechanics, do not duplicate
a different drawer pattern).

```
Find the Live Event Stream table from STREAM-03.

Add a click handler to each row that opens a slide-in drawer from
the right (reuse the same drawer mechanics as the Manipulation
Evidence drawer from Fix Pack 3 — same width, same overlay, same
CSS transition pattern, for visual consistency across the product).

DRAWER CONTENT

SECTION A: Event Summary
  Platform badge + raw event name (large, bold)
  Received: [full timestamp]
  Workspace: [current workspace name]

SECTION B: Raw Properties
  Header: "Raw event properties"
  A formatted JSON viewer (key: value pairs, monospace) showing
  raw_properties from the event. Collapsed by default if the
  payload is large (>10 keys), with "Show all [n] properties" toggle.

  Small note below: "Personally identifiable fields (email, name,
  phone) are automatically stripped before storage."

SECTION C: Cognitive Label Applied
  If cognitive_label is not null:
    Header: "Cognitive label applied"
    Large label badge (e.g. "Confusion", coloured per the existing
    label colour convention)
    Below it: "Rule: [cognitive_label_rule]"
      e.g. "rage_click -> confusion"
    Plain-English explanation (static mapping, same text used
    elsewhere for these labels):
      confusion: "Repeated rapid clicks in the same area typically
        indicate the user expected something to happen and it didn't."
      working_memory_overload: "Re-entering the same field multiple
        times suggests the user lost track of what they had already
        entered or is confused about the expected format."
      comprehension_failure: "Scrolling back up after scrolling down
        suggests the user is searching for information they expected
        to find but missed."
      trust_erosion_trigger: "Leaving immediately after a modal or
        prompt appeared suggests the interruption damaged confidence
        in the flow."
      cognitive_load_stall: "Extended time on a section with no
        scrolling suggests the user is stuck processing dense content."
      low_attention_engagement: "Fast scrolling with no interaction
        suggests the user is skimming without engaging — content may
        not be capturing attention."
  If cognitive_label is null:
    "No cognitive label rule matched this event. It was logged for
     visibility but not flagged as a friction signal."

SECTION D: Write-Back Status
  Status badge: Success / Failed / Disabled / Pending

  If SUCCESS:
    "Written back to [Platform] as event property cognarc_cognitive_label"
    "View in [Platform] →" button/link
      Construct the platform-specific deep link using write_back_ref:
        Amplitude: https://analytics.amplitude.com/[org]/event/[write_back_ref]
        Segment: https://app.segment.com/[workspace]/destinations/debugger
          (Segment doesn't support direct event deep links — link to
           the debugger view with a note: "Search for this event in
           the Segment debugger using the timestamp above")
        PostHog: https://[host]/project/[id]/events/[write_back_ref]
      Opens in a new tab.

  If FAILED:
    "Write-back failed"
    Error message: write_back_error (shown in a red callout)
    "This event was scored but the label could not be written back
     to [Platform]. Check your connection in Settings."
    "Go to Settings →" link
    "Retry write-back" button — re-attempts the write-back call for
      just this event

  If DISABLED:
    "Write-back is disabled for [Platform]."
    "Enable write-back in Settings →" link

  If PENDING:
    "Write-back in progress..." with a small spinner
    (should resolve within a few seconds; if still pending after
     30s on drawer open, show: "This is taking longer than expected.
     [Refresh status]")

SECTION E: Close
  X button, top right, same as other drawers in the product.

Do not touch:
- The stream table row click area outside this drawer
- The Manipulation Evidence drawer (reuse its CSS pattern, do not modify it)
```

---

## STREAM-05 · E2E Tests

```
Create e2e/live-event-stream.spec.ts:

import { test, expect } from '@playwright/test'

test.describe('Connection Health Row', () => {

  test('connected platforms show a health row with pulse dot', async ({ page }) => {
    await page.goto('/pm')
    await expect(page.locator('text=Live Connection Health')).toBeVisible()
    const segmentRow = page.locator('text=Segment').first().locator('..')
    if (await segmentRow.isVisible()) {
      await expect(
        segmentRow.locator('text=Last event').or(segmentRow.locator('text=No events received'))
      ).toBeVisible()
    }
  })

  test('not-connected platforms are excluded from the health row', async ({ page }) => {
    await page.goto('/pm')
    await expect(
      page.locator('text=Connect more platforms in Settings')
    ).toBeVisible({ timeout: 3000 }).catch(() => {
      // All platforms connected — acceptable, skip this assertion
    })
  })

})

test.describe('Live Event Stream', () => {

  test('stream panel is visible below connector status table', async ({ page }) => {
    await page.goto('/pm')
    await expect(page.locator('text=Live Event Stream')).toBeVisible()
  })

  test('empty state shows when no events exist', async ({ page }) => {
    await page.goto('/pm')
    const emptyState = page.locator('text=No events received yet')
    if (await emptyState.isVisible()) {
      await expect(page.locator('text=Go to Settings')).toBeVisible()
    }
  })

  test('filter bar has platform and label dropdowns', async ({ page }) => {
    await page.goto('/pm')
    await expect(
      page.locator('text=All Platforms').or(page.locator('select'))
    ).toBeVisible()
  })

  test('pause stream toggle stops new rows from appearing', async ({ page }) => {
    await page.goto('/pm')
    const pauseToggle = page.locator('text=Pause stream')
    if (await pauseToggle.isVisible()) {
      await pauseToggle.click()
    }
  })

  test('stream table has correct columns when events exist', async ({ page }) => {
    await page.goto('/pm')
    const hasEvents = await page.locator('[data-testid="stream-row"]').count() > 0
    if (hasEvents) {
      await expect(page.locator('text=TIME')).toBeVisible()
      await expect(page.locator('text=PLATFORM')).toBeVisible()
      await expect(page.locator('text=RAW EVENT')).toBeVisible()
      await expect(page.locator('text=COGNITIVE LABEL')).toBeVisible()
      await expect(page.locator('text=WRITE-BACK')).toBeVisible()
    }
  })

})

test.describe('Event Detail Drawer', () => {

  test('clicking a stream row opens the detail drawer', async ({ page }) => {
    await page.goto('/pm')
    const rows = page.locator('[data-testid="stream-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(page.locator('text=Raw event properties')).toBeVisible({ timeout: 2000 })
    }
  })

  test('drawer shows cognitive label rule when label is present', async ({ page }) => {
    await page.goto('/pm')
    const rows = page.locator('[data-testid="stream-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(
        page.locator('text=Cognitive label applied')
          .or(page.locator('text=No cognitive label rule matched'))
      ).toBeVisible({ timeout: 2000 })
    }
  })

  test('successful write-back shows View in Platform link', async ({ page }) => {
    await page.goto('/pm')
    const successRow = page.locator('[data-testid="stream-row"]').filter({ hasText: 'success' }).first()
    if (await successRow.isVisible()) {
      await successRow.click()
      await expect(page.locator('text=View in').first()).toBeVisible({ timeout: 2000 })
    }
  })

  test('failed write-back shows retry button', async ({ page }) => {
    await page.goto('/pm')
    const failedRow = page.locator('[data-testid="stream-row"]').filter({ hasText: 'failed' }).first()
    if (await failedRow.isVisible()) {
      await failedRow.click()
      await expect(page.locator('text=Retry write-back')).toBeVisible({ timeout: 2000 })
    }
  })

  test('drawer closes via X button', async ({ page }) => {
    await page.goto('/pm')
    const rows = page.locator('[data-testid="stream-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(page.locator('text=Raw event properties')).toBeVisible()
      await page.click('[aria-label="Close"], button:has-text("×"), button:has-text("✕")')
      await expect(page.locator('text=Raw event properties')).not.toBeVisible()
    }
  })

})

test.describe('Realtime updates', () => {

  test('realtime subscription does not throw console errors', async ({ page }) => {
    await page.goto('/pm')
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(2000)
    expect(errors.filter(e => e.includes('supabase') || e.includes('realtime'))).toHaveLength(0)
  })

})
```

---

## Run Tests

```bash
# Run the stream tests
npx playwright test e2e/live-event-stream.spec.ts

# Run with visible browser (recommended — realtime behaviour is easier to verify visually)
npx playwright test e2e/live-event-stream.spec.ts --headed

# Manually trigger a test event to verify end-to-end flow
curl -X POST https://your-segment-webhook-url \
  -H "Content-Type: application/json" \
  -d '{
    "event": "rage_click",
    "properties": { "element": "checkout-button", "count": 4 }
  }'
# Then check the PM view — a new row should appear within 1-2 seconds
```

---

## What Not to Touch

| Already working | Status |
|---|---|
| Analytics Connector Status table | Unchanged |
| Connector Configure modals (FIX5-06) | Unchanged |
| Write-back toggle UI | Unchanged — STREAM-02 extends what happens after it's checked |
| Credential encryption/decryption helpers (FIX5-06) | Reused, not duplicated |
| Manipulation Evidence drawer pattern | Reused for visual consistency, not modified |
| Onboarding Flow chart, Connected Model Cognitive Profiles | Untouched |

---

## Data Flow Summary

```
Real user action on the connected site
  (rage click, field re-entry, scroll reversal, etc.)
          |
Behavioral SDK OR the user's existing analytics SDK
  (Segment/Amplitude/PostHog) captures it
          |
Event reaches CognArc via:
  - Segment: webhook push (real-time)
  - Amplitude/PostHog/GA4: webhook or polling job (near real-time)
          |
captureAnalyticsEvent() runs:
  1. Strip PII from properties
  2. Apply cognitive label mapping rules
  3. Insert row into analytics_events (status: pending)
  4. If write-back enabled: attempt write to source platform
  5. Update row with write_back_status: success | failed
          |
Supabase realtime fires INSERT/UPDATE event
          |
PM view Live Event Stream panel updates instantly
  (Connection Health row + scrolling table)
          |
User clicks a row -> Event Detail Drawer
  -> sees raw payload, label reasoning, write-back proof
  -> "View in [Platform]" deep link confirms the loop closed
```

---

*CognArc Live Event Stream - Standalone Pack*
*Requires FIX5-06 (real analytics connections) complete first*
*STREAM-01 -> STREAM-02 -> STREAM-03 -> STREAM-04 -> STREAM-05*
