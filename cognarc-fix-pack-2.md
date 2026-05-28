# CognArc Dashboard — Fix Pack 2
## Second Video Review + Live Testing Bugs + E2E Tests

> **Context:** Fix Pack 1 (`cognarc-fix-prompts.md`) has already been applied.
> This pack covers issues found in the second recording plus bugs discovered during
> live functional testing. Run prompts in the order listed. One at a time. Verify
> visually and with tests before moving to the next.

> **Critical sequencing rule:** FIX-A01 (shared state) MUST be run first.
> Everything else in this pack depends on it.

---

## Stack Reference

```
Framework:  React 18 + Vite
Styling:    Tailwind CSS
Charts:     Recharts
Routing:    React Router (routes: /, /engineer, /pm, /growth, /designer, /safety, /approvals, /settings)
State:      useState / useContext (local per component — this pack fixes that)
Testing:    Playwright (E2E) — install if not present
Deployed:   cognarc-dashboard.vercel.app
```

---

## Pre-Flight

```bash
# Confirm current state
cat package.json | grep -E "react|vite|recharts|playwright|zustand|context"

# Find where app-level state currently lives
grep -r "useState\|createContext\|useContext" src/ --include="*.tsx" --include="*.jsx" -l

# Find the Growth view upload handler
grep -r "Upload asset\|uploadAsset\|queue\|evaluation" src/ --include="*.tsx" --include="*.jsx" -l

# Find the Settings connectors
grep -r "Configure\|Analytics Connector\|connector" src/ --include="*.tsx" --include="*.jsx" -l

# Find the Designer heatmap component
grep -r "heatmap\|Heatmap\|overlay\|Upload screenshot" src/ --include="*.tsx" --include="*.jsx" -l

# Find where A/B comparison lives
grep -r "Variant A\|Variant B\|ab-compare\|ABCompar" src/ --include="*.tsx" --include="*.jsx" -l
```

---

## TIER 0 — Foundation (run this before everything else)

---

### FIX-A01 · Build Shared Application State

**Why this is first:** Every other fix in this pack either writes to or reads from shared
state. Without this, uploads vanish on navigation, connector changes don't propagate,
kill switch state doesn't persist, and the five views remain disconnected silos.

**Risk level:** Medium-high. Touches App root. Take a git commit before running.

**Do not touch:** Any view component's UI. Routing. Sidebar. Any existing local state
that is purely view-local (e.g. a collapsed/expanded toggle).

```
Create a shared application state layer using React Context.

Step 1 — Create the file src/context/AppContext.tsx (or .jsx):

Define this shape:

interface AppState {
  // Shared across Growth → Safety → Approvals → Overview
  evaluationQueue: EvaluationItem[]

  // Single audit log read by Engineer, Safety, Approvals
  auditLog: AuditEntry[]

  // Act-Gated pending queue — fed by Safety detections + Engineer breaches
  actGatedQueue: ActGatedItem[]

  // Agent Activity Feed — shown on Workspace Overview
  agentFeed: AgentFeedEntry[]

  // Connector state — Settings writes, PM view reads
  connectors: ConnectorState

  // Thresholds — Settings writes, all evaluation logic reads
  thresholds: { cognitiveLoadMax: number; manipulationRiskMax: number; comprehensionConfidenceMin: number }

  // Kill switch — persists across all page navigation
  killSwitchActive: boolean

  // Onboarding — hide banner after first connection
  hasConnectedEndpoint: boolean
}

Define these action functions on the context:
  addToEvaluationQueue(item: EvaluationItem): void
  updateEvaluationItem(id: string, updates: Partial<EvaluationItem>): void
  addAuditEntry(entry: AuditEntry): void
  addActGatedItem(item: ActGatedItem): void
  addAgentFeedEntry(entry: AgentFeedEntry): void
  updateConnector(name: string, updates: Partial<ConnectorConfig>): void
  updateThresholds(updates: Partial<Thresholds>): void
  setKillSwitch(active: boolean): void
  setHasConnectedEndpoint(value: boolean): void

Step 2 — Seed the context with the existing hardcoded data:

Move the existing hardcoded data from each view INTO the context initial state:
- The 4 existing evaluation queue items from GrowthView → evaluationQueue
- The existing audit log entries from EngineerView and SafetyView → auditLog
  (merge them into one array, deduplicated by timestamp)
- The existing Act-Gated pending items from ApprovalsView → actGatedQueue
- The existing Agent Activity Feed entries from WorkspaceOverview → agentFeed
- The existing connector statuses from PMView and SettingsView → connectors
- Existing thresholds from SettingsView → thresholds
- killSwitchActive: false
- hasConnectedEndpoint: false

Step 3 — Wrap the app:

In App.tsx (or main.tsx), wrap the entire router/app with <AppProvider>.

Step 4 — Update each view to READ from context instead of local state:

For each view, replace the hardcoded array with a useAppContext() call.
Do NOT rewrite the view's JSX — just swap the data source.

Views to update:
- GrowthView: evaluationQueue from context
- EngineerView: auditLog from context
- SafetyView: auditLog + actGatedItems from context
- ApprovalsView: actGatedQueue from context
- WorkspaceOverview: agentFeed + connectors from context
- PMView: connectors from context
- SettingsView: connectors + thresholds from context

Step 5 — Verify nothing broke:

After this change, every view should look identical to before.
The only difference is the data source — context instead of local arrays.
No visual change should be visible.
```

> **Claude Code Tip:** This is a refactor, not a feature add. After running, spend
> 5 minutes clicking through every view to confirm nothing changed visually. If
> anything looks different, something was missed in the data migration.

---

## TIER 1 — Critical Fixes (run after FIX-A01)

---

### FIX-A02 · Fix Onboarding Banner — Hide After Connection

**What's broken:** After "Connected! Generating your first score..." the banner stays
on screen permanently. It should disappear and the full overview should show.

**Prerequisite:** FIX-A01 complete. `hasConnectedEndpoint` now lives in context.

**Do not touch:** The onboarding banner's form, inputs, or step indicator styling.
The Cognitive Health section. The trend chart.

```
Find the OnboardingBanner component (or wherever the "Connect your first LLM
endpoint to start monitoring" banner is rendered in WorkspaceOverview).

Currently the banner shows even after the connection succeeds.

Fix:

1. After the success message "Connected! Generating your first score..." is shown
   (the existing 2000ms delay), call setHasConnectedEndpoint(true) from AppContext.

2. The banner should already be conditionally rendered based on hasConnectedEndpoint.
   If it isn't, wrap it: {!hasConnectedEndpoint && <OnboardingBanner />}

3. When hasConnectedEndpoint becomes true, the banner unmounts cleanly.
   The Cognitive Health section expands to fill the space.

4. Because hasConnectedEndpoint lives in AppContext, it persists across navigation.
   If the user goes to Engineer view and comes back, the banner stays gone.

Do not touch:
- The banner form or step indicator
- The Cognitive Health section
- The trend chart
- Any other WorkspaceOverview section
```

---

### FIX-A03 · Kill Switch — Confirmation Dialog, Red State, Banner, Audit Entry

**What's broken:** Kill switch toggle has no visible effect. It must be demonstrated
in the demo — it is the governance centrepiece of the product.

**Prerequisite:** FIX-A01 complete. `killSwitchActive` and `addAuditEntry` in context.

**Do not touch:** The toggle's position or "KILL SWITCH" label. Any view component.

```
Find the Kill Switch toggle component (top-right of every page).

Currently toggling it does nothing visible. Add this behaviour:

ON (activating):

1. Show a confirmation dialog. Use a custom modal (not browser confirm()) styled
   consistently with the rest of the dashboard:
   Title: "Pause all agent actions?"
   Body: "All Act-Auto and Act-Gated actions will be paused across this workspace.
          Monitoring continues. All queued actions will be cancelled."
   Buttons: "Pause Agent" (red/destructive) | "Cancel" (outline)

2. If "Pause Agent" is clicked:
   a. Call setKillSwitch(true) from context
   b. Toggle changes to active state: red background, white toggle circle on right
   c. Add a full-width amber banner BELOW the top nav bar (above page content):
      "⚠  Agent actions paused — monitoring continues. Kill switch is active."
      Include an "X" dismiss button that hides the banner (but keeps kill switch on)
   d. Call addAuditEntry({
        action: "KILL_SWITCH",
        zone: "ACT_GATED",
        outcome: "approved",
        authorisedBy: "user:admin",
        time: new Date().toLocaleTimeString()
      })
   e. Call addAgentFeedEntry({
        zone: "ACT_GATED",
        description: "Kill switch activated — all agent actions paused.",
        time: "just now"
      })

3. If "Cancel" is clicked: close modal, no state change.

OFF (deactivating):

1. Show confirmation modal:
   Title: "Resume agent actions?"
   Body: "Act-Auto and Act-Gated actions will resume according to workspace policy."
   Buttons: "Resume" (teal) | "Cancel"

2. If "Resume":
   a. Call setKillSwitch(false)
   b. Toggle returns to inactive grey state
   c. Remove the amber banner
   d. Call addAuditEntry with action: "KILL_SWITCH", outcome: "deactivated"

State persistence: because killSwitchActive is in AppContext, the red toggle
and amber banner persist when navigating between pages.

Do not touch:
- Toggle position or label text
- Any view component logic
- The audit log table component itself (just add data to it)
```

---

### FIX-A04 · Fix Designer Heatmap — Real Upload Handler with Responsive Overlay

**What's broken:** Uploading a screenshot shows the image but the colour gradient
overlay is static — the same fixed gradient regardless of what is uploaded. The
legend dots (High/Medium/Low) are decorative. Nothing responds to the actual image.

**Do not touch:** The A/B comparison section above the heatmap. The Onboarding
Load Curve table below. The Upload screenshot button itself.

```
Find the Attention / Load Heatmap Viewer component in the Designer view.

Currently:
- An image is shown with a static CSS gradient overlay
- The gradient is the same regardless of which image was uploaded
- The legend dots are just coloured circles with labels

Fix:

1. Replace the static CSS gradient with a Canvas-based overlay that responds
   to the uploaded image's actual dimensions:

   When an image is uploaded:
   a. Display the image in the viewer
   b. Create an absolutely-positioned <canvas> element over the image,
      matching its rendered dimensions exactly (use ResizeObserver or
      onLoad to get the rendered size)
   c. Draw heatmap hotspots on the canvas using these RELATIVE positions
      (so they scale with any image size):
      - Primary hotspot: top-left area (15-35% x, 10-30% y) — red, radius 22% of width
      - Secondary hotspot: center-right (55-75% x, 25-45% y) — orange, radius 16% of width
      - Tertiary hotspot: bottom-center (35-55% x, 60-75% y) — yellow, radius 12% of width
      Use radialGradient fills with rgba values: red (255,50,50,0.45),
      orange (255,165,0,0.32), yellow (255,255,0,0.22), transparent at edges
   d. The canvas has pointer-events: none so the image is still interactable

2. Add a processing state:
   - On upload: show a spinner overlay for 1500ms with "Analyzing attention
     patterns..." text
   - After 1500ms: fade in the heatmap overlay
   - This makes it feel like something is computing, not just rendering static CSS

3. Keep the High/Medium/Low legend dots below the image — they are correct.
   They should be positioned: High (red dot), Medium (orange dot), Low (yellow dot).

4. The overlay should be visually different for different uploaded images because
   the canvas dimensions change with image aspect ratio. Even with fixed relative
   hotspot positions, a portrait image will look different from a landscape image.

Do not touch:
- The A/B comparison section
- The Onboarding Load Curve table
- The Upload screenshot button trigger
```

---

### FIX-A05 · Build A/B Comparison Upload Mechanism

**What's broken:** The A/B comparison section shows pre-seeded results but there
is no way to actually submit two assets for comparison. No upload zones, no Compare
button, no user-initiated flow.

**Do not touch:** The comparison result display (scores, winner badge, Share Report,
confidence level). The Onboarding Load Curve table. Any other Designer view section.

```
Find the A/B comparison section in the Designer view (the section showing
"Variant A" and "Variant B" scores with "Variant A preferred · HIGH CONFIDENCE").

Currently the results are pre-seeded with no upload mechanism.

Rebuild this section with a two-phase UI:

PHASE 1 — Upload state (shown when no comparison has been run yet,
or after clicking "New Comparison"):

Show two upload zones side by side:

Left zone:
  - Dashed border, label "Variant A"
  - Upload icon + text "Drop a file or click to upload"
  - Accepts: PNG, JPG, HTML, TXT
  - Shows filename when file is selected

Right zone:
  - Same styling, label "Variant B"

Below both zones:
  - A "Run Cognitive Comparison" button (teal, full-width)
  - Disabled until BOTH zones have files
  - When clicked: transitions to Phase 2

PHASE 2 — Processing state (1500ms):
  Show a loading state: "Running TRIBE cognitive comparison..."
  A progress indicator (simple animated dots or spinner)

PHASE 3 — Results state (the existing result display):
  The existing "Variant A · scores" and "Variant B · scores" layout
  with "Variant A preferred · HIGH CONFIDENCE · Share Report"
  PLUS a "New Comparison" button (outline, small) that resets back to Phase 1

Mock scoring logic:
  For the uploaded files, generate mock scores:
  - Variant A: Load 38, Comprehension 82, Trust 86, Manipulation 9
  - Variant B: Load 67, Comprehension 58, Trust 61, Manipulation 28
  (These match the existing pre-seeded values so the result looks consistent)

State: use local useState for the comparison flow phases.
The comparison result does NOT need to be in AppContext.

Do not touch:
- The existing result display layout (scores, winner, share button)
- The Heatmap Viewer section
- The Onboarding Load Curve table
```

---

### FIX-A06 · Fix Creative Evaluation Queue — Persist Across Navigation

**What's broken:** Uploaded assets in the Growth view Creative Evaluation Queue
vanish when navigating to another page and returning.

**Prerequisite:** FIX-A01 complete. `evaluationQueue` now lives in AppContext and
`addToEvaluationQueue` + `updateEvaluationItem` are available.

**Do not touch:** The queue list UI. The Variant Ranker. The Brand Trust Drift
Monitor. The Cognitive Funnel Mapper.

```
Find the Growth view's Creative Evaluation Queue upload handler.

Currently when a file is uploaded, it is added to local component state.
When the component unmounts (navigation away), that state is lost.

Fix:

1. Replace the local queue state with the evaluationQueue from AppContext:
   const { evaluationQueue, addToEvaluationQueue, updateEvaluationItem } = useAppContext()

2. The upload handler should call addToEvaluationQueue() instead of
   setLocalQueue() (or however it currently adds to local state).

3. The queue list renders evaluationQueue from context — not local state.

4. The processing simulation (queued → processing → complete) should use
   updateEvaluationItem() to update the item's status in context.

5. Verify: upload a file, navigate to Engineer view, navigate back to Growth.
   The uploaded file should still be in the queue with its current status.

6. Also: when a Growth view upload completes with HIGH manipulation risk
   (Manipulation score > 40 in the mock), automatically call addAgentFeedEntry()
   with a RECOMMEND zone entry:
   "Manipulation risk [score]/100 detected in [filename] — review recommended."

Do not touch:
- The queue list component structure
- The Variant Ranker
- Any other Growth view section
```

---

### FIX-A07 · Fix Settings — Analytics Connector Configure Modal
Read CLAUDE.md
**What's broken:** Every "Configure" button in the Analytics Connectors section
does nothing. Users have no way to set up or modify connector details.

**Do not touch:** The connector status displays. The write-back toggles (keep them
functional). The Eval Platform Integrations section. The Workspace Thresholds section.

```
Find the Analytics Connectors section in the Settings view.

Each connector row (Segment, Amplitude, Mixpanel, PostHog, GA4) has a
"Configure" button that currently does nothing.

Build a Configure modal that opens when any Configure button is clicked:

Modal title: "Configure [Platform Name]"

Modal content varies by platform status:

For CONNECTED platforms (Segment, Amplitude, PostHog, GA4):
  - Read-only field: "Webhook URL" or "API Key" (show masked: "••••••••abc123")
  - Write-back toggle (synced with the toggle on the main row)
  - "Event filter" text input: placeholder "e.g. page_view, click, form_submit"
    (currently empty / shows "All events")
  - "Test Connection" button — on click: spinner 1000ms then "Connection healthy ✓"
  - "Disconnect" button (red outline) — on click: confirmation "Disconnect Segment?
    This will stop event ingestion and write-back." with Confirm/Cancel
  - "Save" button

For DEGRADED platforms (Mixpanel):
  - Status badge: "Degraded — reconnection required"
  - "API Key" input field (empty, prompts re-entry)
  - "Reconnect" button (teal) — on click: spinner 1500ms then shows Connected status
  - "Save" button

Modal close: X button top-right, clicking outside closes it.

On Save: call updateConnector(platformName, { ...changes }) from context.
The main connector row updates to reflect any changes.

Do not touch:
- The write-back toggle on the main row (it should stay in sync with the modal)
- Any other Settings section
```

---

### FIX-A08 · Fix Settings — Eval Platform Integration Buttons
Read CLAUDE.md
**What's broken:** "Connect via OAuth" and "Connect via API Key" buttons do nothing.
The OpenAPI spec, Python SDK, TypeScript SDK text links are not clickable.

**Do not touch:** The platform names, descriptions, or layout. The Workspace Thresholds
section. The Analytics Connectors section.

```
Find the Eval Platform Integrations section in the Settings view.

Fix 1 — OAuth buttons (Braintrust, Langfuse):
When "Connect via OAuth" is clicked, open a modal:
  Title: "Connect [Platform] via OAuth"
  Body: "In a production environment, this would open an OAuth authorization
         flow with [Platform]. For this demo workspace, click below to simulate
         a successful connection."
  Button: "Simulate Connection" (teal)
  On click: close modal, change the platform row to show:
    - Status: "Connected" (green)
    - Button changes to "Disconnect" (red outline)
    - Add an audit entry: { action: "EVAL_PLATFORM_CONNECTED", zone: "ACT_AUTO",
        outcome: "success", authorisedBy: "user:admin" }

Fix 2 — API Key buttons (Weights & Biases, Arize Phoenix):
When "Connect via API Key" is clicked, open a modal:
  Title: "Connect [Platform] via API Key"
  Input: "API Key" (password type, placeholder "Enter your API key")
  Input: "Workspace / Project ID" (text, placeholder "Optional")
  Button: "Save & Connect" (teal)
  On click (any non-empty API key): close modal, show Connected state as above.

Fix 3 — Text links:
Change "OpenAPI spec", "Python SDK", "TypeScript SDK" from plain text to
actual <a> tags:
  OpenAPI spec: href="https://github.com/cognarc/cognarc-api" target="_blank"
  Python SDK:   href="https://github.com/cognarc/cognarc-python" target="_blank"
  TypeScript SDK: href="https://github.com/cognarc/cognarc-js" target="_blank"
  (These are placeholder GitHub URLs — they don't need to resolve)
  Style them with the existing link colour (teal) and underline on hover.

Do not touch:
- Platform names or descriptions
- Workspace Thresholds
- Analytics Connectors
```

---

### FIX-A09 · Fix Settings — Add Repository Button

**What's broken:** "Add Repository" button in the GitHub / CI/CD section does nothing.

**Do not touch:** The existing connected repo row. Any other Settings section.

```
Find the GitHub / CI/CD section in the Settings view.
The "+ Add Repository" button currently does nothing.

When clicked, open a modal:
  Title: "Connect GitHub Repository"

  Fields:
  - "Repository URL" (text input, placeholder "https://github.com/org/repo")
  - "Personal Access Token" (password input, placeholder "ghp_...")
  - "Monitored paths" (text input, placeholder "prompts/**/*.txt, src/copy/**")
    Label: "Files that trigger cognitive evaluation on PR"

  Buttons:
  - "Test Connection" — spinner 1200ms then "Repository accessible ✓"
  - "Save Repository" (teal) — on click with non-empty URL:
      Close modal
      Add a new row to the repository list showing the entered URL
      Status: "Connected" (green)
      Call addAuditEntry({ action: "REPO_CONNECTED", zone: "ACT_AUTO",
        outcome: "success", authorisedBy: "user:admin" })
  - Cancel (outline)

Do not touch:
- The existing cognarc-app repository row
- Any other Settings section
```

---

### FIX-A10 · Save Thresholds — Confirmation + Propagation to All Views

**What's broken:** "Save Thresholds" button in Settings does not show confirmation
and does not propagate threshold changes to the evaluation logic in other views.

**Prerequisite:** FIX-A01 complete. `updateThresholds` in context.

**Do not touch:** The threshold input fields. Any other Settings section.

```
Find the Workspace Thresholds section in the Settings view.

Currently "Save Thresholds" has no visible feedback and doesn't update
the context thresholds that other views should use.

Fix:

1. On "Save Thresholds" click:
   a. Call updateThresholds({ cognitiveLoadMax, manipulationRiskMax,
      comprehensionConfidenceMin }) with the current input values
   b. Show inline confirmation below the button:
      "✓ Thresholds saved — changes applied to all connected evaluations"
      Green text, fades out after 3 seconds
   c. Call addAuditEntry({ action: "THRESHOLD_UPDATE", zone: "ACT_AUTO",
      outcome: "success", authorisedBy: "user:admin",
      time: new Date().toLocaleTimeString() })

2. Add input validation:
   - cognitiveLoadMax must be 1–100
   - manipulationRiskMax must be 1–100
   - comprehensionConfidenceMin must be 1–100
   - If any value is out of range, show inline error and do not save

3. The Prompt Regression Monitor in the Engineer view and the CI/CD gate
   should visually reflect the saved thresholds:
   In the Prompt Regression Monitor, add a small note below the table:
   "Thresholds: CL max [value] · Manip max [value] · CC min [value]"
   Read these from context.thresholds.

Do not touch:
- The input field layout
- The Eval Platform Integrations section
- Any other Settings section
```

---

## TIER 2 — Interconnections (run after all TIER 1 fixes)

---

### FIX-A11 · Wire Growth Queue → Safety Detection Feed

**What's broken:** Uploading a creative in Growth has no effect on the Safety view.
They should be connected — a high-manipulation evaluation in Growth should appear
in the Safety Manipulation Detection Feed.

**Prerequisite:** FIX-A01 and FIX-A06 complete.

**Do not touch:** The existing 5 seeded manipulation detection entries. The audit
trail. The Post-Remediation Monitor.

```
When an evaluation completes in the Growth Creative Evaluation Queue
with manipulation_risk > 40, automatically add a new entry to the
Safety Manipulation Detection Feed.

In the Growth queue processing logic (where status updates from
"processing" to "complete"), after setting the final scores:

If the mock manipulation score > 40:
  Add to the manipulation detection feed (stored in AppContext or
  in Safety view state — find where the feed entries array lives):
  {
    id: unique id,
    category: "false_urgency",   // use this for any Growth asset
    score: [the manipulation score],
    time: "just now",
    excerpt: "[filename] — [first 50 chars of filename or 'Creative asset evaluated']...",
    showEvidence: false
  }

  Also call addAgentFeedEntry({
    zone: "RECOMMEND",
    description: "Manipulation risk [score]/100 in [filename] — review in Safety view.",
    time: "just now"
  })

  Also call addActGatedItem if manipulation score > 70:
  {
    id: unique id,
    title: "[filename] flagged for manipulation risk [score]/100",
    requestedAt: new Date().toLocaleString(),
    type: "CONTENT_FLAG",
    decisionBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleString(),
    status: "pending"
  }

Verify: upload any asset in Growth, watch the Safety view's manipulation
feed add a new entry at the top. If manipulation > 70, also check that
Act-Gated Approvals shows a new pending item.

Do not touch:
- The existing 5 seeded feed entries
- The audit trail data
- Any other Safety view section
```

---

### FIX-A12 · Wire Settings Connector State → PM View Connector Table

**What's broken:** The PM View's Analytics Connector Status table and the Settings
Analytics Connectors section are separate hardcoded data sets. Toggling write-back
in Settings has no effect on the PM view.

**Prerequisite:** FIX-A01 complete. Both views now read from `context.connectors`.

**Do not touch:** The PM view connector table's layout or columns. The Settings
connector rows' layout.

```
Find the PM View's Analytics Connector Status table.
Find the Settings Analytics Connectors section.

Currently both sections have their own hardcoded connector data.
After FIX-A01, both should be reading from context.connectors.

Verify and fix the sync:

1. The PM view connector table should render context.connectors directly:
   Each row reads: name, status, eventsToday, writeBack, lastSync from context.

2. When the write-back toggle is changed in Settings, it calls
   updateConnector(name, { writeBack: newValue }) which updates context.

3. The PM view re-renders automatically because it reads from context.

4. When the Configure modal (FIX-A07) saves changes, the PM view
   connector table should reflect any status changes immediately.

5. Add one additional field to the connector data that both views show:
   eventsToday (number) — already exists in PM view, ensure it's in context.

Test: Go to Settings, toggle Amplitude write-back OFF.
Navigate to PM view. Amplitude row should show "— Disabled" for write-back.
Navigate back to Settings. Toggle should still be OFF.

Do not touch:
- The PM view connector table JSX structure
- The Settings connector row JSX structure
- Any other PM view section
- Any other Settings section
```

---

### FIX-A13 · Wire Safety Detections → Act-Gated Approvals Queue

**What's broken:** The Manipulation Detection Feed entries and the Act-Gated
pending queue are separate hardcoded arrays with no relationship. A manipulation
detection above the ACT_GATED threshold should automatically appear in Approvals.

**Prerequisite:** FIX-A01 and FIX-A11 complete.

**Do not touch:** The existing 2 seeded Act-Gated pending items. The Recently
Resolved section. The decision package expand/collapse logic.

```
Find where the Act-Gated queue items array is defined.
After FIX-A01 this should be in AppContext as actGatedQueue.

The connection: when addActGatedItem() is called from anywhere
(Growth upload in FIX-A11, or Engineer threshold breach),
the Act-Gated Approvals page should show the new item.

Verify this works after FIX-A01 and FIX-A11:

1. Navigate to Growth, upload a file with manipulation risk > 70.
2. Navigate to Act-Gated Approvals.
3. The new item should appear at the top of the PENDING APPROVAL list.

If this is not working after FIX-A01, explicitly wire it:

In ApprovalsView, replace the hardcoded pending items array with:
  const { actGatedQueue } = useAppContext()
  const pendingItems = actGatedQueue.filter(item => item.status === "pending")
  const resolvedItems = actGatedQueue.filter(item => item.status !== "pending")

The existing 2 seeded items should be in the initial actGatedQueue state
(set in FIX-A01). New items added via addActGatedItem() will appear automatically.

Also wire the Approve/Reject buttons:
When "Approve" is clicked on a pending item, call a new context action:
  resolveActGatedItem(id, "approved")
  → updates item status to "approved" in context
  → adds an audit entry: { action: "ACT_GATED_APPROVED", zone: "ACT_GATED",
      outcome: "approved", authorisedBy: "user:admin" }
  → item moves from PENDING to RECENTLY RESOLVED

When "Reject" is clicked:
  resolveActGatedItem(id, "rejected")
  → same pattern with outcome: "rejected"

Do not touch:
- The decision package expand/collapse
- The TRIBE evidence scores display
- The "Recently Resolved" section layout
```

---

### FIX-A14 · Wire Audit Log — Single Source Across Engineer + Safety Views

**What's broken:** Engineer view and Safety view have separate hardcoded audit log
arrays. Any action taken anywhere (kill switch, threshold save, connector change)
should appear in both views' audit logs because they both read from the same source.

**Prerequisite:** FIX-A01 complete. Single `auditLog` array in AppContext.

**Do not touch:** The audit log table component's columns or styling. The filter
dropdown. The Export JSON button.

```
After FIX-A01, both Engineer view and Safety view should read from
context.auditLog instead of their own local arrays.

Verify and complete this wiring:

1. EngineerView audit log: replace local array with context.auditLog
   The filter dropdown should filter context.auditLog by zone.
   Default filter should already be "All zones" from Fix Pack 1.

2. SafetyView audit trail: replace local array with context.auditLog
   Both views show the same data — this is correct and intentional.
   The audit log is a single immutable source of truth.

3. Verify that actions from FIX-A03 (kill switch), FIX-A07 (connector
   configure), FIX-A10 (threshold save) all write to context.auditLog
   via addAuditEntry() and appear in BOTH the Engineer and Safety audit
   log views.

4. "Export JSON" button in Safety view:
   Currently does nothing. Make it functional:
   On click: generate a JSON blob of context.auditLog, create a download
   link programmatically, trigger download as "cognarc-audit-log.json".
   This is 5 lines of code and makes the feature feel real.

Do not touch:
- The audit log table JSX
- The zone badge colours
- Any filter logic beyond what is already implemented
```

---

## TIER 3 — Second Video Issues (recording-only + minor UI)

*These are recording issues or minor UI fixes. No code changes needed for items
marked RECORDING ONLY.*

---

### FIX-A15 · PM View — Change Bar Chart to Line Chart

**What's wrong:** The "Onboarding Flow Cognitive Load Curve" in the PM view renders
as a bar chart. It should be a line chart consistent with all other charts.

**Do not touch:** The Designer view's load curve table. The data values. Any other
PM view section.

```
Find the PM View's "Onboarding Flow — Cognitive Load Curve" chart component.
It currently uses Recharts BarChart with coloured bars.

Replace it with a Recharts LineChart using the same data:

Steps: Welcome, Profile, Connect SDK, Configure, First Score, Complete
Load values: 28, 42, 71, 83, 55, 32

LineChart configuration:
- Single line: "Cognitive Load" (orange, strokeWidth 2, dot radius 4)
- Add a second line: "Comprehension" (teal, strokeWidth 2, dot radius 4)
  Values: 88, 79, 54, 41, 62, 84
- X-axis: step names (may need angle or shortened labels)
- Y-axis: 0-100
- Add a horizontal reference line at y=70, dashed, labelled "Load threshold"
  (red dashed, same style as the threshold lines in the Funnel Mapper)
- Tooltip showing both values on hover

Keep the note below the chart:
"Steps with load > 70 are highlighted in red. Steps with comprehension < 55
indicate likely abandonment."

The chart should look consistent with the Cognitive Funnel Mapper chart
in the Growth view — same Recharts component family, same colour scheme.

Do not touch:
- The Analytics Connector Status table
- The Recent Event Labels table
- The Connected Model Cognitive Profiles table
- Any other PM view section
```

---

### FIX-A16 · Workspace Overview — Fix Connected Surfaces Panel Truncation

**What's wrong:** The Connected Surfaces panel is cut off. The "+ Add Surface"
button and buyer surface activity indicators are not visible.

**Do not touch:** The Agent Activity Feed. The Cognitive Health section. The trend chart.

```
Find the two-column layout section in WorkspaceOverview that contains
the Agent Activity Feed (left) and Connected Surfaces (right).

The Connected Surfaces panel is truncated — not all entries are visible
and the "+ Add Surface" button is cut off.

Fix the layout:

1. If the two columns are fixed height, remove the fixed height constraint
   on the Connected Surfaces column and let it grow naturally.

2. Alternatively, add a max-height with overflow-y: auto (scrollable) to
   the Connected Surfaces panel so all entries are reachable.

3. Ensure the "+ Add Surface" button is always visible at the bottom of
   the Connected Surfaces panel (position it with sticky bottom or ensure
   it's outside any scroll container).

4. Below the surface list, add the five buyer surface activity indicator
   that should have been added by Fix Pack 1 FIX-22 if it wasn't:
   Five small pill badges in a row: Eng · PM · Growth · Design · Safety
   Teal (active) for: Eng, PM, Growth, Design
   Grey (inactive) for: Safety
   Label: "Active surfaces — last 30 days"

5. "Add Surface" click: navigate to /settings (the Settings page).

Do not touch:
- The Agent Activity Feed content
- Any other Workspace Overview section
```

---

### RECORDING-01 · Hide Bookmarks Bar Before Recording

**Type:** Recording hygiene — no code change needed.

```
RECORDING CHECKLIST (do before every demo recording):

1. Hide Chrome bookmarks bar: Ctrl+Shift+B (Windows/Linux) or Cmd+Shift+B (Mac)
2. Disable password manager prompts:
   Chrome → Settings → Autofill → Password Manager → "Offer to save passwords" → OFF
   Or use an Incognito window (Ctrl+Shift+N) — password manager is disabled by default
3. Use a clean browser profile with no personal bookmarks visible
4. Check the browser address bar shows the Vercel URL, not localhost
5. Close all other tabs before recording
```

---

### RECORDING-02 · Kill Switch Demo Script

**Type:** Recording — no code change needed. Run AFTER FIX-A03 is complete.

```
KILL SWITCH DEMO SEQUENCE (add to demo recording script):

After showing the Safety / Red Team view, before navigating to Act-Gated Approvals:

1. Scroll to top of any page so the Kill Switch is visible top-right
2. Click the Kill Switch toggle
3. Pause 1 second — let the confirmation modal appear fully
4. Click "Pause Agent" — let the viewer see the modal close
5. Pause 2 seconds — show the red toggle state and the amber banner
6. Scroll to the Agent Activity Feed or navigate to Engineer view —
   show the new ACT_GATED audit entry that was just created
7. Return to any page, click the Kill Switch again
8. Click "Resume" — show the toggle returning to grey, banner disappearing

Total time: approximately 25 seconds. This is the most important governance
demonstration in the product. Do not skip it.
```

---

### RECORDING-03 · Act-Gated Package Demo Script

**Type:** Recording — no code change needed.

```
ACT-GATED APPROVALS DEMO SEQUENCE:

1. Navigate to Act-Gated Approvals
2. Let the viewer see the 2 PENDING items and the "Decision required by" timestamps
3. Click "View package" on "Campaign copy v2 flagged for manipulation risk 78/100"
4. Pause 2 seconds — let the expanded package fully render
5. Point out (by hovering over): TRIBE Evidence scores, confidence intervals,
   Top Brain Regions row, Evidence Summary, Proposed Action
6. Scroll down to Alternatives Considered — show the predicted score deltas
7. Do NOT click Approve or Reject during the demo (preserve the state)
8. Click "View package" again to collapse it

Total time: approximately 30 seconds. This is the strongest screen in the product.
```

---

### RECORDING-04 · Evidence Drawer Demo Script

**Type:** Recording — no code change needed.

```
MANIPULATION DETECTION EVIDENCE DEMO SEQUENCE:

1. Navigate to Safety / Red Team
2. Scroll to the Manipulation Detection Feed at the top
3. Hover over the "false urgency · 79/100" entry to let the viewer read it
4. Click "View Evidence"
5. Pause 2 seconds — let the drawer slide in fully
6. Point out (by hovering): the 6-category taxonomy table, the limbic/prefrontal
   activation bar, the highlighted evidence snippets (red highlights)
7. Scroll down in the drawer to show the plain-language explanation
8. Click X to close the drawer

Total time: approximately 20 seconds.
```

---

## TIER 4 — E2E Tests (run after all code fixes are complete)

---

### TEST-01 · Install and Configure Playwright

```
Install Playwright if not already present:

pnpm add -D @playwright/test
npx playwright install chromium

Create playwright.config.ts at the project root:

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})

Create the directory: mkdir -p e2e

Add to package.json scripts:
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:headed": "playwright test --headed"
```

---

### TEST-02 · Shared State Tests

```
Create e2e/shared-state.spec.ts:

import { test, expect } from '@playwright/test'

test.describe('Shared application state', () => {

  test('evaluation queue persists across navigation', async ({ page }) => {
    await page.goto('/growth')
    // Upload a file
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: 'test-asset.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-png-data')
    })
    // Verify item appears in queue
    await expect(page.locator('text=test-asset.png')).toBeVisible()
    // Navigate away and back
    await page.click('text=Engineer')
    await page.click('text=Growth')
    // Item should still be in queue
    await expect(page.locator('text=test-asset.png')).toBeVisible()
  })

  test('connector write-back toggle syncs between Settings and PM view', async ({ page }) => {
    // Go to Settings, disable Amplitude write-back
    await page.goto('/settings')
    const amplitudeRow = page.locator('text=Amplitude').locator('..')
    const writeBackToggle = amplitudeRow.locator('button[role="switch"], input[type="checkbox"]').first()
    const initialState = await writeBackToggle.getAttribute('aria-checked') ??
                         await writeBackToggle.isChecked()
    await writeBackToggle.click()
    // Go to PM view and check connector table
    await page.goto('/pm')
    const pmAmplitudeRow = page.locator('text=Amplitude').locator('..')
    // Write-back should reflect the change
    if (initialState === 'true' || initialState === true) {
      await expect(pmAmplitudeRow.locator('text=Disabled')).toBeVisible()
    } else {
      await expect(pmAmplitudeRow.locator('text=Enabled')).toBeVisible()
    }
  })

  test('kill switch state persists across page navigation', async ({ page }) => {
    await page.goto('/')
    // Activate kill switch
    await page.click('text=KILL SWITCH')
    await page.click('text=Pause Agent')
    // Verify banner is visible
    await expect(page.locator('text=Agent actions paused')).toBeVisible()
    // Navigate to Engineer view
    await page.click('text=Engineer')
    // Banner should still be visible
    await expect(page.locator('text=Agent actions paused')).toBeVisible()
    // Kill switch toggle should still be red/active
    const toggle = page.locator('[data-testid="kill-switch-toggle"], button:has-text("KILL SWITCH")')
    // Deactivate
    await toggle.click()
    await page.click('text=Resume')
    await expect(page.locator('text=Agent actions paused')).not.toBeVisible()
  })

  test('thresholds from settings propagate to engineer view', async ({ page }) => {
    await page.goto('/settings')
    // Change cognitive load max
    const clInput = page.locator('input').filter({ hasText: '' }).nth(0)
    // Find the cognitive load max input by its label
    const clField = page.locator('label:has-text("Cognitive Load Max")').locator('..').locator('input')
    await clField.fill('75')
    await page.click('text=Save Thresholds')
    await expect(page.locator('text=Thresholds saved')).toBeVisible()
    // Navigate to Engineer view
    await page.goto('/engineer')
    // The threshold note should reflect the new value
    await expect(page.locator('text=CL max 75')).toBeVisible()
  })

})
```

---

### TEST-03 · Interconnection Tests

```
Create e2e/interconnections.spec.ts:

import { test, expect } from '@playwright/test'

test.describe('View interconnections', () => {

  test('high-manipulation Growth upload triggers Safety feed entry', async ({ page }) => {
    await page.goto('/growth')
    // Upload a file
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: 'campaign-v3.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-png')
    })
    // Wait for processing to complete (max 8 seconds)
    await page.waitForSelector('text=complete', { timeout: 8000 })
    // Navigate to Safety view
    await page.click('text=Safety / Red Team')
    // A new manipulation entry should appear for the uploaded file
    // (only if manipulation score > 40 — which it will be with the mock)
    await expect(
      page.locator('[data-testid="manipulation-feed"], .manipulation-feed')
        .locator('text=campaign-v3.png')
        .or(page.locator('text=Creative asset evaluated'))
    ).toBeVisible({ timeout: 3000 })
  })

  test('kill switch creates audit entry visible in both Engineer and Safety views', async ({ page }) => {
    await page.goto('/')
    await page.click('text=KILL SWITCH')
    await page.click('text=Pause Agent')
    // Check Engineer view audit log
    await page.click('text=Engineer')
    await expect(page.locator('text=KILL_SWITCH')).toBeVisible()
    // Check Safety view audit log
    await page.click('text=Safety / Red Team')
    await expect(page.locator('text=KILL_SWITCH')).toBeVisible()
    // Clean up
    await page.click('text=KILL SWITCH')
    await page.click('text=Resume')
  })

  test('Act-Gated queue receives items from Growth upload above threshold', async ({ page }) => {
    await page.goto('/growth')
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: 'risky-campaign.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake')
    })
    await page.waitForSelector('text=complete', { timeout: 8000 })
    // Navigate to Act-Gated Approvals
    await page.click('text=Act-Gated Approvals')
    // Should show a new pending item (manipulation > 70)
    await expect(page.locator('text=risky-campaign.png').or(
      page.locator('text=PENDING').nth(2)
    )).toBeVisible({ timeout: 3000 })
  })

  test('agent activity feed receives entries from actions across views', async ({ page }) => {
    await page.goto('/')
    const initialFeedCount = await page.locator('[data-testid="agent-feed-entry"], .agent-feed-entry').count()
    // Trigger an action in Growth
    await page.click('text=Growth')
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'new-asset.png', mimeType: 'image/png', buffer: Buffer.from('x')
    })
    await page.waitForSelector('text=complete', { timeout: 8000 })
    // Return to Overview and check feed grew
    await page.click('text=Workspace Overview')
    const newFeedCount = await page.locator('[data-testid="agent-feed-entry"], .agent-feed-entry').count()
    expect(newFeedCount).toBeGreaterThan(initialFeedCount)
  })

})
```

---

### TEST-04 · Critical Feature Tests

```
Create e2e/features.spec.ts:

import { test, expect } from '@playwright/test'

test.describe('Designer view', () => {

  test('A/B comparison — upload two variants and see results', async ({ page }) => {
    await page.goto('/designer')
    // Find the upload zones for A/B comparison
    const variantAUpload = page.locator('text=Variant A').locator('..').locator('input[type="file"]')
    const variantBUpload = page.locator('text=Variant B').locator('..').locator('input[type="file"]')
    // Upload files to both zones
    await variantAUpload.setInputFiles({ name: 'variant-a.png', mimeType: 'image/png', buffer: Buffer.from('a') })
    await variantBUpload.setInputFiles({ name: 'variant-b.png', mimeType: 'image/png', buffer: Buffer.from('b') })
    // Run Comparison button should be enabled
    const compareButton = page.locator('text=Run Cognitive Comparison')
    await expect(compareButton).toBeEnabled()
    await compareButton.click()
    // Loading state
    await expect(page.locator('text=Running TRIBE cognitive comparison')).toBeVisible()
    // Results appear
    await expect(page.locator('text=Variant A preferred')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=HIGH CONFIDENCE')).toBeVisible()
  })

  test('A/B comparison — compare button disabled until both variants uploaded', async ({ page }) => {
    await page.goto('/designer')
    const compareButton = page.locator('text=Run Cognitive Comparison')
    await expect(compareButton).toBeDisabled()
    // Upload only one variant
    const variantAUpload = page.locator('text=Variant A').locator('..').locator('input[type="file"]')
    await variantAUpload.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('a') })
    // Still disabled
    await expect(compareButton).toBeDisabled()
  })

  test('heatmap — uploading a screenshot shows overlay within 2 seconds', async ({ page }) => {
    await page.goto('/designer')
    const heatmapUpload = page.locator('text=Upload screenshot').locator('..').locator('input[type="file"]')
      .or(page.locator('[data-testid="heatmap-upload"]'))
    await heatmapUpload.setInputFiles({
      name: 'ui-screenshot.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-data')
    })
    // Processing state should show
    await expect(page.locator('text=Analyzing attention patterns')).toBeVisible({ timeout: 2000 })
    // Canvas overlay should appear after processing
    await expect(page.locator('canvas')).toBeVisible({ timeout: 4000 })
    // Legend should be visible
    await expect(page.locator('text=High attention')).toBeVisible()
  })

})

test.describe('Settings page', () => {

  test('Configure modal opens for each analytics connector', async ({ page }) => {
    await page.goto('/settings')
    for (const platform of ['Segment', 'Amplitude', 'PostHog']) {
      const row = page.locator(`text=${platform}`).locator('..').locator('..')
      await row.locator('text=Configure').click()
      await expect(page.locator(`text=Configure ${platform}`)).toBeVisible()
      await page.keyboard.press('Escape')
    }
  })

  test('OAuth connect button opens modal for Braintrust', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('text=Braintrust').locator('..').locator('text=Connect via OAuth').click()
    await expect(page.locator('text=Connect Braintrust via OAuth')).toBeVisible()
    await page.click('text=Simulate Connection')
    await expect(page.locator('text=Braintrust').locator('..').locator('text=Connected')).toBeVisible({ timeout: 3000 })
  })

  test('Add Repository button opens modal', async ({ page }) => {
    await page.goto('/settings')
    await page.click('text=Add Repository')
    await expect(page.locator('text=Connect GitHub Repository')).toBeVisible()
    await page.fill('input[placeholder*="github.com"]', 'https://github.com/test/repo')
    await page.click('text=Save Repository')
    await expect(page.locator('text=github.com/test/repo')).toBeVisible({ timeout: 3000 })
  })

  test('SDK links are clickable anchor tags', async ({ page }) => {
    await page.goto('/settings')
    const pythonSDK = page.locator('text=Python SDK')
    const tagName = await pythonSDK.evaluate(el => el.tagName.toLowerCase())
    expect(tagName).toBe('a')
    const href = await pythonSDK.getAttribute('href')
    expect(href).toBeTruthy()
    expect(href).not.toBe('#')
  })

})

test.describe('Kill switch', () => {

  test('activating shows confirmation modal', async ({ page }) => {
    await page.goto('/')
    await page.click('text=KILL SWITCH')
    await expect(page.locator('text=Pause all agent actions')).toBeVisible()
    await expect(page.locator('text=Pause Agent')).toBeVisible()
    await expect(page.locator('text=Cancel')).toBeVisible()
  })

  test('cancelling does not activate kill switch', async ({ page }) => {
    await page.goto('/')
    await page.click('text=KILL SWITCH')
    await page.click('text=Cancel')
    await expect(page.locator('text=Agent actions paused')).not.toBeVisible()
  })

  test('confirming shows amber banner and audit entry', async ({ page }) => {
    await page.goto('/')
    await page.click('text=KILL SWITCH')
    await page.click('text=Pause Agent')
    await expect(page.locator('text=Agent actions paused')).toBeVisible()
    await page.click('text=Engineer')
    await expect(page.locator('text=KILL_SWITCH')).toBeVisible()
    // Clean up
    await page.click('text=KILL SWITCH')
    await page.click('text=Resume')
  })

})

test.describe('Onboarding banner', () => {

  test('banner hides after successful connection', async ({ page }) => {
    await page.goto('/')
    // Banner should be visible initially
    await expect(page.locator('text=Connect your first LLM endpoint')).toBeVisible()
    // Fill in the form
    await page.fill('input[placeholder*="api.openai.com"]', 'https://api.openai.com/v1')
    await page.fill('input[placeholder*="sk-"]', 'sk-testkey123')
    await page.click('text=Connect & Start Monitoring')
    // Success state
    await expect(page.locator('text=Connected! Generating your first score')).toBeVisible()
    // Banner should disappear within 5 seconds
    await expect(page.locator('text=Connect your first LLM endpoint')).not.toBeVisible({ timeout: 5000 })
    // Navigate away and back — banner should stay hidden
    await page.click('text=Engineer')
    await page.click('text=Workspace Overview')
    await expect(page.locator('text=Connect your first LLM endpoint')).not.toBeVisible()
  })

})
```

---

### TEST-05 · Navigation and Rendering Tests

```
Create e2e/navigation.spec.ts:

import { test, expect } from '@playwright/test'

const routes = [
  { path: '/',          heading: 'Workspace Overview' },
  { path: '/engineer',  heading: 'Engineer View' },
  { path: '/pm',        heading: 'Product Manager View' },
  { path: '/growth',    heading: 'Growth View' },
  { path: '/designer',  heading: 'Designer' },
  { path: '/safety',    heading: 'Safety' },
  { path: '/approvals', heading: 'Act-Gated Approvals' },
  { path: '/settings',  heading: 'Settings' },
]

test.describe('All views render without errors', () => {
  for (const route of routes) {
    test(`${route.path} renders correctly`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', err => errors.push(err.message))
      await page.goto(route.path)
      await expect(page.locator(`text=${route.heading}`).first()).toBeVisible({ timeout: 5000 })
      // No console errors
      const criticalErrors = errors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('404') &&
        !e.includes('Warning:')
      )
      expect(criticalErrors).toHaveLength(0)
    })
  }
})

test.describe('PM view chart', () => {
  test('Onboarding Flow chart is a line chart, not a bar chart', async ({ page }) => {
    await page.goto('/pm')
    // A LineChart uses <path> elements for lines, BarChart uses <rect> for bars
    // After FIX-A15, there should be no <rect> elements that look like bars
    await page.waitForSelector('text=Onboarding Flow')
    const svgPaths = await page.locator('.recharts-line-curve, .recharts-line path').count()
    expect(svgPaths).toBeGreaterThan(0)
  })
})

test.describe('Act-Gated decision package', () => {
  test('View package expands to show TRIBE evidence', async ({ page }) => {
    await page.goto('/approvals')
    await page.click('text=View package').first()
    await expect(page.locator('text=TRIBE EVIDENCE')).toBeVisible()
    await expect(page.locator('text=Cognitive Load')).toBeVisible()
    await expect(page.locator('text=TOP BRAIN REGIONS')).toBeVisible()
    await expect(page.locator('text=Approve')).toBeVisible()
    await expect(page.locator('text=Reject')).toBeVisible()
  })
})

test.describe('Manipulation evidence drawer', () => {
  test('View Evidence opens the evidence drawer', async ({ page }) => {
    await page.goto('/safety')
    await page.click('text=View Evidence').first()
    await expect(page.locator('text=NEURAL EVIDENCE')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=TAXONOMY BREAKDOWN')).toBeVisible()
    await expect(page.locator('text=ACTIVATION SIGNATURE')).toBeVisible()
    // Close drawer
    await page.click('[aria-label="Close"], button:has-text("×"), button:has-text("✕")').first()
    await expect(page.locator('text=NEURAL EVIDENCE')).not.toBeVisible()
  })
})
```

---

### TEST-06 · Run All Tests

```bash
# Run the full E2E suite
pnpm test:e2e

# Run with visible browser (good for debugging)
pnpm test:e2e:headed

# Run a specific test file
npx playwright test e2e/shared-state.spec.ts

# Run a specific test by name
npx playwright test --grep "kill switch"

# Generate an HTML report
npx playwright test --reporter=html
npx playwright show-report

# Run against production URL
PLAYWRIGHT_BASE_URL=https://cognarc-dashboard.vercel.app pnpm test:e2e
```

---

## What Not to Touch

Everything confirmed working from the first recording. Do not modify:

| Component | Status |
|---|---|
| Onboarding connection flow (3-step) | ✅ Working |
| Upload → queue → processing → complete flow | ✅ Working (FIX-A06 just persists it) |
| Agent Activity Feed meaningful entries | ✅ Working |
| Audit log zone classifications | ✅ Fixed |
| CI/CD baseline deltas | ✅ Working |
| Detector annotations on load curve table | ✅ Working |
| A/B result display (scores, winner, share button) | ✅ Working (FIX-A05 adds upload mechanism) |
| Heatmap colour gradient + legend | ✅ Working (FIX-A04 makes it responsive) |
| Manipulation Detection Feed entries | ✅ Working |
| Evidence Package drawer content | ✅ Working |
| Settings page structure + sections | ✅ Working |
| Brand Trust Drift chart | ✅ Working |
| Cognitive Funnel Mapper | ✅ Working |
| Deployed Vercel URL | ✅ Working |

---

## Final Pre-Demo Checklist

```
SHARED STATE
[ ] Navigate Growth → upload file → go to Engineer → return to Growth → file still in queue
[ ] Change write-back toggle in Settings → check PM view connector table reflects it
[ ] Activate Kill Switch → navigate to Engineer → banner still showing
[ ] Deactivate Kill Switch → banner gone on all pages

DESIGNER PAGE
[ ] A/B: upload two files → Compare button enables → click it → results appear
[ ] Heatmap: upload any PNG → spinner shows → canvas overlay appears → legend visible
[ ] Heatmap overlay looks different for a portrait vs landscape image

SETTINGS PAGE
[ ] Configure button on Segment opens modal with fields
[ ] Configure button on Mixpanel (Degraded) shows reconnection option
[ ] Braintrust "Connect via OAuth" → modal → Simulate → shows Connected
[ ] W&B "Connect via API Key" → modal → enter key → shows Connected
[ ] Add Repository → modal → enter URL → new row appears
[ ] Python SDK link is a real clickable <a> tag
[ ] Save Thresholds → confirmation text appears → disappears after 3s

INTERCONNECTIONS
[ ] Growth upload (complete) → Safety manipulation feed shows new entry
[ ] Growth upload (manip > 70) → Act-Gated Approvals shows new pending item
[ ] Any action → Agent Activity Feed on Overview shows new entry
[ ] Kill switch → KILL_SWITCH entry in both Engineer and Safety audit logs
[ ] Export JSON in Safety → file downloads

RECORDING HYGIENE
[ ] Bookmarks bar hidden
[ ] Password manager disabled
[ ] Recording from cognarc-dashboard.vercel.app
[ ] Demo script includes: Kill Switch → Act-Gated package → Evidence drawer
```

---

*CognArc Dashboard Fix Pack 2 · Run after Fix Pack 1 · FIX-A01 must run first*
