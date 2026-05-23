# CognArc Dashboard — Fix Prompt Pack

> **How to use this pack**
> Each prompt is self-contained and scoped to one fix. Run them in the order listed within each tier.
> Before running any prompt, read the **"Do not touch"** line — it tells Claude Code exactly what to leave alone.
> Run `pnpm dev` and visually verify the fix before moving to the next prompt.
> Never run two prompts simultaneously. One at a time, verify, commit, move on.

---

## Stack Reference

From the recorded video the dashboard is:
- **Framework:** React 18 (Vite, `localhost:5173`)
- **Styling:** Tailwind CSS
- **Charts:** Recharts (line charts visible)
- **State:** likely `useState` / `useContext` — no Redux visible
- **Routing:** React Router (sidebar nav changes the view, URL changes to `/engineer`, `/growth` etc.)

Every prompt is written for this stack. If your stack differs, tell Claude Code before running.

---

## Pre-Flight Checklist

Before running any fix prompt, verify these exist in your codebase:

```bash
# Confirm Vite + React
cat package.json | grep -E "vite|react|tailwind|recharts"

# List view components
ls src/views/   # or src/pages/ or src/components/views/

# Find the sidebar nav component
grep -r "Engineer\|Product Manager\|Growth\|Designer\|Safety" src/ --include="*.jsx" --include="*.tsx" -l

# Find the kill switch component
grep -r "KILL SWITCH\|killSwitch\|kill-switch" src/ --include="*.jsx" --include="*.tsx" -l

# Find the audit log data
grep -r "KILL_SWITCH\|WRITEBACK_SYNC\|OBSERVE" src/ --include="*.jsx" --include="*.tsx" --include="*.ts" --include="*.js" -l
```

Run these first. The output tells you where each component lives before you ask Claude Code to touch it.

---

## P0 — Critical Fixes
### Fix before showing the product to anyone

---

### FIX-01 · Remove the "View As" Dropdown
read CLAUDE.md
**What's broken:** The `VIEW AS` dropdown in the bottom-left sidebar stays on "Workspace" and never changes anything. The sidebar nav already handles role switching correctly. Two controls exist for one job; one works, one doesn't.

**Risk level:** Low. This is a deletion, not a rebuild.

**Do not touch:** The sidebar navigation links (Workspace Overview, Engineer, Product Manager, Growth, Designer, Safety / Red Team, Act-Gated Approvals). Do not touch routing. Do not touch view components.

```
Find the component that renders the "VIEW AS" label and the dropdown below it
in the bottom section of the sidebar. It currently shows a select/dropdown
with "Workspace" as the selected value.

Remove the entire "VIEW AS" section — the label, the dropdown, and any
state or handler associated with it. Remove only this element.

Do not touch:
- The sidebar navigation links above it
- The routing logic
- Any view component
- Any other part of the sidebar

After removing it, verify the sidebar still shows all navigation links
correctly and that clicking each link still switches the view.
```
 Run `pnpm dev` and visually verify the fix before moving to the next prompt.
---

### FIX-02 · Fix Upload → Queue → Evaluation Flow

**What's broken:** Uploading a file shows a `"cogn.png" queued for evaluation` notification bar but the file never appears in the queue list below it and never receives scores. The core interaction is broken end to end.

**Risk level:** Medium. Touches state and the queue list render. The existing queue items (hero-banner-v3.png, email-body-copy.txt, social-ad-v1.mp4, landing-headline-v2.txt) must remain unchanged.

**Do not touch:** The existing queue items and their scores. The Variant Ranker section below the queue. The `+ Upload asset` button itself (just fix what happens after upload).

```
In the Growth View, find the Creative Evaluation Queue section.

Currently when a file is uploaded, a notification bar appears saying
'"filename" queued for evaluation' but the file never joins the queue list.

Fix the upload flow so that when a file is selected:

1. Immediately add it to the top of the queue list with:
   - filename (from the uploaded file)
   - timestamp (current time)
   - status badge: "queued" (grey/neutral styling matching the existing "queued" badge)
   - no scores yet (leave Load and Trust fields empty or show "—")

2. After 2000ms (simulated processing delay), update the item's status to
   "processing" (use the same blue "processing" badge style already in the queue)

3. After a further 3000ms, update the item to "complete" with mock scores:
   - Load: 61, Trust: 67, risk level: MEDIUM
   - Show the same score layout as the existing "complete" items

Use React useState to manage the queue items as an array. The existing
4 queue items are already in the component — keep them exactly as they are
and add the new item above them.

Remove the notification bar approach entirely — the queue list IS the
feedback mechanism.

Do not touch:
- The existing 4 queue items or their scores
- The Variant Ranker section
- Any other section of the Growth view
```

---

### FIX-03 · Build the Connections / Settings Page

**What's broken:** No Settings, Connections, or Integrations page exists. Users have no mechanism to connect anything. This is the most critical missing page in the product.

**Risk level:** Medium. This is an addition, not a modification. Add a new route and a new component. Do not touch existing views.

**Do not touch:** Any existing view component. Any existing route. The sidebar nav order (add "Settings" at the bottom of the existing list).

```
Add a new "Settings" page to the dashboard. This is a new route and a new
component — do not modify any existing view.

Step 1 — Add the route:
Add "/settings" to the router (wherever the other routes are defined).
Add a "Settings" link at the bottom of the sidebar nav, below "Act-Gated
Approvals", using the same link styling as the existing nav items.

Step 2 — Create the Settings component with four sections:

SECTION 1: "LLM Connections"
A list of connected LLM endpoints. Show one existing mock entry:
  - Name: "Production GPT-4o", Endpoint: "api.openai.com", Status: Connected (green dot)
Below it, an "Add Endpoint" form with:
  - Text input: "Endpoint URL"
  - Text input: "API Key" (password type, masked)
  - Button: "Test Connection" — on click, show a loading state for 1500ms
    then show "Connection successful" in green text
  - Button: "Save" — adds the endpoint to the list with "Connected" status

SECTION 2: "Analytics Connectors"
Five rows, one per platform: Segment, Amplitude, Mixpanel, PostHog, GA4
Each row shows:
  - Platform name and logo placeholder (coloured circle with first letter)
  - Current status (Segment: Connected, Amplitude: Connected, Mixpanel: Degraded,
    PostHog: Connected, GA4: Connected) — match the statuses from the PM view
  - Write-back toggle (on/off) — Segment: on, Amplitude: on, Mixpanel: off,
    PostHog: on, GA4: off
  - "Configure" button (does nothing yet, just styled)

SECTION 3: "Workspace Thresholds"
Three number inputs with current values:
  - "Cognitive Load Max": 80
  - "Manipulation Risk Max": 40
  - "Comprehension Confidence Min": 50
A "Save Thresholds" button below — on click, show "Thresholds saved" confirmation
for 2 seconds then reset.

SECTION 4: "GitHub / CI/CD"
One mock connected repo row:
  - "cognarc-app" · github.com/your-org/cognarc-app · Connected (green)
An "Add Repository" button (does nothing yet, just styled).

Use the same card/section styling pattern used throughout the existing dashboard.
Tailwind only. No new dependencies.
```

---

### FIX-04 · Make the Kill Switch Visibly Work
read CLAUDE
**What's broken:** The Kill Switch toggle exists on every page but toggling it produces no visible consequence — no dialog, no state change, no audit log entry.

**Risk level:** Medium. Touches the Kill Switch component and the audit log state. The toggle must already exist as a component — find it before writing any new code.

**Do not touch:** The Kill Switch toggle's position or styling. The audit log data structure. Any view-specific component.

```
Find the Kill Switch toggle component (top-right of every page, shows
"KILL SWITCH" label with a toggle).

Currently toggling it does nothing visible.

Add the following behaviour when the toggle is switched ON:

1. Show a confirmation dialog (browser confirm() is acceptable, or a simple
   modal if the codebase already has a modal pattern):
   "Pause all agent actions across this workspace?
   Monitoring will continue. All queued actions will be cancelled."
   With "Pause Agent" (confirm) and "Cancel" buttons.

2. If confirmed:
   a. Change the toggle to active/on state with a red background
      (replace the current grey/off styling with red)
   b. Add a banner directly below the top nav bar that says:
      "⚠ Agent actions paused — monitoring continues"
      Style: amber/yellow background, full width, dismissible with an X button
   c. Add a new entry to the top of the audit log data (wherever audit log
      entries are stored — find the data array):
      {
        action: "KILL_SWITCH",
        zone: "ACT_GATED",
        outcome: "approved",
        authorisedBy: "user:admin",
        time: current time formatted as "H:MM AM/PM"
      }

3. When toggled OFF (back to inactive):
   a. Show confirmation: "Resume agent actions?"
   b. If confirmed: remove the red styling, remove the banner, add another
      audit log entry with action "KILL_SWITCH", zone "ACT_GATED",
      outcome: "deactivated"

Store kill switch state in a context or at the top-level App component
so the banner persists across page navigation.

Do not touch:
- The toggle's position or label
- Any view component's own logic
- The audit log table's column structure or styling
```

---

### FIX-05 · Fix Audit Log Zone Classifications

**What's broken:** `KILL_SWITCH` and `WRITEBACK_SYNC` are both classified as `OBSERVE` in the audit log. `KILL_SWITCH` is `ACT_GATED`. `WRITEBACK_SYNC` is `ACT_AUTO`. The Engineer view audit log also defaults to filtering OBSERVE-only, hiding all consequential activity.

**Risk level:** Low. This is a data fix and a default value change. No UI rebuild required.

**Do not touch:** The audit log component's rendering logic, styling, or zone badge colours. The Safety view audit log (which already shows all zones correctly).

```
This fix has two parts.

PART 1 — Fix the zone data:
Find where the audit log entries are defined as data (likely an array of
objects in the Engineer view component or a shared data file).

Find every entry where action is "KILL_SWITCH" and change its zone from
"OBSERVE" to "ACT_GATED".

Find every entry where action is "WRITEBACK_SYNC" and change its zone from
"OBSERVE" to "ACT_AUTO".

Verify: PROMPT_EVALUATED should stay as "OBSERVE" — that is correct.

Also add 3 new audit log entries to the Engineer view's audit data to show
zone variety (since most entries are currently OBSERVE):
  { action: "FAIL_CICD_BUILD",    zone: "ACT_AUTO",   outcome: "success",  authorisedBy: "policy v1.2", time: "9:45 AM" }
  { action: "THRESHOLD_BREACH",   zone: "RECOMMEND",  outcome: "escalated",authorisedBy: "policy v1.2", time: "9:30 AM" }
  { action: "PROMPT_REWRITE",     zone: "ACT_GATED",  outcome: "pending",  authorisedBy: "user:admin",  time: "9:15 AM" }

PART 2 — Change the Engineer view audit log default filter:
Find the audit log filter dropdown in the Engineer view. It currently
defaults to "OBSERVE". Change the default selected value to "ALL" so all
zone types are visible when the Engineer view first loads.

Do not touch:
- The zone badge colours or styling
- The Safety view audit log
- The filter dropdown's available options (just change the default)
- Any other component
```

---

### FIX-06 · Remove Heatmap Disclaimer and Add Colour Overlay
read CLAUDE.md
**What's broken:** The heatmap shows an uploaded image with a yellow border and a caption reading "Simulated attention heatmap overlay. Connect TRIBE for live cortical mapping." The disclaimer is more damaging than the absence of the feature.

**Risk level:** Medium. Touches the heatmap section in the Designer view. The Onboarding Load Curve table below it must not be touched.

**Do not touch:** The Onboarding Load Curve table. The A/B comparison section above the heatmap. Any other Designer view section.

```
In the Designer view, find the "Attention / Load Heatmap Viewer" section.

Currently it shows:
- An uploaded image (the "AI Agent Architecture" diagram) with a yellow border
- A caption below: "Simulated attention heatmap overlay. Connect TRIBE for live
  cortical mapping."

Make these changes:

1. Remove the caption entirely. Delete it. No replacement text.

2. Keep the yellow border (it serves as a selection indicator).

3. Add a colour overlay on top of the image using an absolutely-positioned
   div with a CSS gradient, rendered as a semi-transparent heatmap simulation:

   Use this approach:
   - Wrap the image in a relative-positioned container
   - Add an absolutely-positioned div over the image with:
     background: radial-gradient(ellipse at 30% 25%, rgba(255,50,50,0.35) 0%,
       rgba(255,165,0,0.25) 30%, rgba(255,255,0,0.15) 55%, transparent 75%),
       radial-gradient(ellipse at 70% 60%, rgba(255,100,50,0.28) 0%,
       rgba(255,200,0,0.18) 35%, transparent 65%);
     pointer-events: none;
     border-radius: inherit;

   This creates two attention hotspot regions with a red-orange-yellow
   fade that looks like a genuine heatmap overlay without requiring TRIBE.

4. Add a small legend below the image (not a disclaimer — a feature label):
   Three colour dots with labels: 🔴 High attention  🟡 Medium  🟢 Low
   Small text, right-aligned, styled in muted grey.

Do not touch:
- The Onboarding Load Curve table
- Any upload functionality
- Any other section of the Designer view
```

---

### FIX-07 · Add Free-Tier Onboarding Connection Flow

**What's broken:** New users arrive at the dashboard with no path to connect anything. The case study's primary GTM hook is "connect any LLM endpoint in five minutes." That flow does not exist.

**Risk level:** Low. This is a new component shown only when no connections exist. Existing connected-state UI is untouched.

**Do not touch:** Any existing view. The Settings page (FIX-03). The main nav. Anything that already works.

```
Add an empty-state onboarding flow that appears when the user has no
connected LLM endpoints.

Create a new component: OnboardingBanner (or similar name).

Render it at the top of the Workspace Overview, above the Cognitive Health
section, but ONLY when a "hasConnectedEndpoint" flag is false.

Set this flag to false initially (so the banner shows in development).
After the user completes the connection flow, set it to true and hide the banner.

The banner should contain:
1. A headline: "Connect your first LLM endpoint to start monitoring"
2. A subline: "Takes 5 minutes. No code required."
3. A 3-step visual indicator:
   Step 1: "Paste your endpoint URL" (active)
   Step 2: "Add your API key" (inactive)
   Step 3: "Receive your first cognitive score" (inactive)
4. An inline form (not a modal):
   - Input: "Endpoint URL" (placeholder: "https://api.openai.com/v1")
   - Input: "API Key" (password type, placeholder: "sk-...")
   - Button: "Connect & Start Monitoring"
   - On button click: show loading state ("Testing connection...") for 1500ms,
     then show success state ("Connected! Generating your first score...") for
     2000ms, then set hasConnectedEndpoint to true and hide the banner.

Style the banner with a teal left border and a light teal background,
matching the existing callout/info box styling in the dashboard.

Do not touch:
- The Cognitive Health section
- The trend chart
- The Agent Activity Feed
- Any other component
```

---

## P1 — High Priority Fixes
### Fix before portfolio submission

---

### FIX-08 · Complete the Act-Gated Decision Package

**What's working and must stay:** The TRIBE Evidence Scores (4 numbers), Evidence Summary text, Proposed Action text, Alternatives Considered list, Approve and Reject buttons. Do not change any of these.

**What's missing:** Confidence intervals on scores, brain regions row, timestamps on pending items, cognitive scores per alternative.

```
In the Act-Gated Approvals page, find the decision package that expands
when "View package" is clicked (the one showing "TRIBE EVIDENCE — COGNITIVE
SCORES" with the four numbers: 68 Cognitive Load, 54 Comprehension, 41 Trust,
78 Manipulation).

Make these additions only — do not change anything that already exists:

1. Below each of the four score numbers, add a small confidence interval
   in muted grey text:
   - Cognitive Load 68: add "± 7" below it
   - Comprehension 54: add "± 9" below it
   - Trust 41: add "± 6" below it
   - Manipulation 78: add "± 5" below it

2. After the TRIBE EVIDENCE section, add a new row:
   Label: "TOP BRAIN REGIONS"
   Value: "Prefrontal cortex · Anterior cingulate · Limbic system"
   Use the same label/value styling as "EVIDENCE SUMMARY" and "PROPOSED ACTION".

3. On the pending approval cards in the list (the ones showing "PENDING"
   badge, title, and "Requested: [date]"), add a "Decision required by:"
   line below the requested date:
   - Campaign copy v2 item: "Decision required by: 5/20/2026, 2:13 PM"
   - Onboarding flow item: "Decision required by: 5/20/2026, 1:23 PM"

4. In the "ALTERNATIVES CONSIDERED" section, add predicted score deltas
   after each alternative option:
   - "Deploy with soft-block warning" → add: "Predicted Load: 68, Manip: 45"
   - "Request human review only" → add: "Predicted Load: 68, Manip: 78 (unchanged)"
   - "Auto-remediate urgency language" → add: "Predicted Load: 52, Manip: 31"
   Show these as small muted text below each alternative label.

Do not touch:
- The Approve and Reject buttons
- The Evidence Summary text
- The Proposed Action text
- The PENDING / APPROVED badge styling
- The "Recently Resolved" section
```

---

### FIX-09 · Add Manipulation Detection Feed to Safety View
read CLAUDE.md
**What's missing:** The Safety / Red Team view has no live Manipulation Detection Feed. It shows only an audit trail. The feed is the primary real-time feature for red teams.

**Do not touch:** The Full Audit Trail section. The Post-Remediation Monitor section. Any other Safety view element.

```
In the Safety / Red Team view, add a new "Manipulation Detection Feed"
section at the TOP of the view, before the post-remediation monitor section.

The feed should show 5 mock detection entries. Each entry is a row with:
- A taxonomy category badge (coloured pill):
  Use these colours for each category:
  false_urgency: red background
  authority_mimicry: orange background
  sycophantic_drift: amber background
  obfuscation: blue background
  social_proof_fabrication: purple background
- Score: e.g. "84/100" in bold
- Timestamp: relative time e.g. "2 min ago", "11 min ago"
- A short excerpt of the triggering output in monospace, truncated to
  ~60 chars with ellipsis
- A "View Evidence" link (right-aligned) — clicking it opens the Evidence
  Package drawer (see FIX-10)

Use these 5 mock entries:
1. false_urgency · 84 · "2 min ago" · "Act now — experts unanimously agree. Limited time only..."
2. authority_mimicry · 71 · "11 min ago" · "As verified by leading medical institutions, this approach..."
3. sycophantic_drift · 58 · "23 min ago" · "You're absolutely right, and your instinct here is spot on..."
4. obfuscation · 63 · "41 min ago" · "The multifaceted synergistic framework leverages dynamic..."
5. false_urgency · 79 · "1 hr ago" · "Only 3 spots remaining. This offer expires at midnight tonight..."

Add a section header: "Manipulation Detection Feed" with a green pulsing
dot (CSS animation) to indicate live monitoring. Label the dot "Live".

Do not touch:
- The Full Audit Trail section
- The Post-Remediation Monitor section
- The audit log data
```

---

### FIX-10 · Build the Neural Evidence Package Drawer
read CLAUDE.md
**What's missing:** Clicking a manipulation detection shows nothing. The evidence package is the feature that makes red team findings scientifically defensible.

**Do not touch:** The manipulation detection feed items themselves. The audit trail. Any other component.

```
Add a slide-in drawer (from the right side of the screen) that opens when
"View Evidence" is clicked on any manipulation detection entry in the
Manipulation Detection Feed (FIX-09).

The drawer should be 480px wide, overlay the content (not push it),
with a dark overlay behind it. An X button in the top-right corner closes it.

Drawer content — use the data from whichever detection was clicked,
but for the mock, use entry #1 (false_urgency, score 84):

SECTION 1: "NEURAL EVIDENCE — COGNITIVE SCORES"
Four numbers in the same style as the Act-Gated decision package:
  Cognitive Load: 71   Comprehension: 38   Trust: 29   Manipulation: 84

SECTION 2: "TAXONOMY BREAKDOWN"
A table with all 6 categories and their scores:
  false_urgency:            84  (highlighted in red — this is the trigger)
  authority_mimicry:        12
  ambiguity_exploitation:   23
  social_proof_fabrication:  8
  sycophantic_drift:         6
  obfuscation:              15

SECTION 3: "ACTIVATION SIGNATURE"
Two rows:
  Limbic activation:      0.82  (shown as a filled progress bar, red)
  Prefrontal engagement:  0.31  (shown as a filled progress bar, blue)
  A label below: "High limbic / low prefrontal ratio = manipulation signal"

SECTION 4: "EVIDENCE SNIPPETS"
The triggering phrases highlighted:
  "Act now" — highlighted in red
  "experts unanimously agree" — highlighted in red
  "Limited time only" — highlighted in red
Plain text between the highlights shown normally.

SECTION 5: "PLAIN-LANGUAGE EXPLANATION"
"TRIBE detected false urgency patterns in this output. The high limbic
activation combined with low prefrontal engagement indicates the output
is designed to trigger emotional response and bypass rational evaluation.
Two manipulation taxonomy categories exceeded the 70/100 threshold."

SECTION 6: "RECOMMENDED ACTIONS" (three bullet points)
- Review and rewrite the urgency language before deployment
- Flag this output pattern for red team review
- Add this pattern to the post-remediation monitoring queue

Use the same card/section styling as the Act-Gated decision package.
Tailwind only. No new animation libraries — use CSS transitions for
the drawer slide-in (transform + transition-transform).
```

---

### FIX-11 · Add Cognitive Funnel Mapper to Growth View
read CLAUDE.md
**What's missing:** The Cognitive Funnel Mapper is completely absent from the Growth view. It is one of the most commercially compelling features in the product.

**Do not touch:** The Creative Evaluation Queue. The Variant Ranker. Any existing Growth view section.

```
Add a "Cognitive Funnel Mapper" section to the Growth View, below the
Variant Ranker section.

The section has two parts:

PART 1: A funnel step list (left side or top, depending on layout)
Show 5 funnel steps as a horizontal step indicator or a simple table:
  Step 1: Ad Creative      · Load: 34 · Trust: 81 · Risk: LOW
  Step 2: Landing Page     · Load: 52 · Trust: 74 · Risk: MEDIUM
  Step 3: Sign-Up Flow     · Load: 71 · Trust: 58 · Risk: MEDIUM  ← peak load
  Step 4: Onboarding       · Load: 83 · Trust: 41 · Risk: HIGH    ← trust gap
  Step 5: First Value Moment · Load: 44 · Trust: 69 · Risk: LOW

PART 2: A line chart using Recharts (since the codebase already uses it)
Show two lines:
  - Cognitive Load (orange, matching the existing trend chart colours)
  - Trust Coherence (teal/green, matching existing colours)
X-axis: the 5 funnel step names
Y-axis: 0–100

Add two reference annotations on the chart:
  - A red dashed vertical line at "Sign-Up Flow" labelled "Load peak"
  - An amber dashed vertical line at "Onboarding" labelled "Trust gap"

Add a section header: "Cognitive Funnel Mapper"
Add a subline: "Weekly cadence — last updated 5/18/2026"

Add a summary insight below the chart in a callout box:
"⚠ Trust drops 17 points at the Onboarding step. Users are being asked
to connect integrations before the product has demonstrated value."

Use the same Recharts LineChart component and styling already used in
the Workspace Overview trend chart. Import from recharts — do not add
a new charting library.

Do not touch:
- The Creative Evaluation Queue
- The Variant Ranker
- Any other section
```

---

### FIX-12 · Populate Agent Activity Feed with Meaningful Entries
read CLAUDE.md
**What's broken:** The Agent Activity Feed shows one entry: "Evaluated prompt hash 8f3a..." with an OBSERVE badge. This tells a viewer nothing about what the agent does.

**Do not touch:** The feed's component structure or styling. The "1 pending approval" badge. The Connected Surfaces section beside it.

```
Find the Agent Activity Feed component in the Workspace Overview.

Replace the current single entry ("Evaluated prompt hash 8f3a...") with
these 7 entries, in this order (newest first):

1. Zone: ACT_GATED   · "Campaign copy v2 flagged — manipulation risk 78/100. Decision package ready." · "2 min ago"
2. Zone: OBSERVE     · "Evaluated 847 outputs this hour. All within configured thresholds." · "12 min ago"
3. Zone: ACT_AUTO    · "Cognitive load breach in PR #247. Build failed. Engineer notified." · "23 min ago"
4. Zone: RECOMMEND   · "Onboarding step 4 load score 89/100. Resequencing recommendation generated." · "41 min ago"
5. Zone: OBSERVE     · "Brand trust coherence stable across 12 campaign assets evaluated today." · "1 hr ago"
6. Zone: ACT_GATED   · "Prompt #42 regression detected: CL +18pts vs baseline. Awaiting approval." · "2 hrs ago"
7. Zone: ACT_AUTO    · "Analytics write-back completed: 12,847 events enriched with cognitive labels." · "3 hrs ago"

Use the existing zone badge colours (the component already has them —
just use the same badge component/class for each zone type).

Each entry should show:
- Zone badge on the left
- Description text in the middle
- Relative timestamp on the right

Do not touch:
- The "1 pending approval" badge or its link
- The Connected Surfaces section
- The component's styling or layout
```

---

### FIX-13 · Add Brand Trust Drift Chart to Growth View
read CLAUDE.md
**What's missing:** No longitudinal trust monitoring visible in the Growth view. The case study explicitly names Brand Trust Drift Monitor as a core Growth feature.

**Do not touch:** Creative Evaluation Queue. Variant Ranker. Cognitive Funnel Mapper (FIX-11). Any existing section.

```
Add a "Brand Trust Drift Monitor" section to the Growth View, between
the Variant Ranker and the Cognitive Funnel Mapper sections.

Use Recharts (already in the codebase) to render an AreaChart showing
trust coherence scores over the last 14 days.

Mock data — 14 data points, one per day from 5/5/2026 to 5/18/2026:
[72, 74, 71, 69, 68, 65, 63, 61, 64, 62, 60, 58, 57, 55]

Chart configuration:
- Single area line: "Trust Coherence" in teal
- Fill the area below with a light teal (opacity 0.15)
- Add a horizontal reference line at y=65 labelled "Alert threshold" in amber/dashed
- X-axis: show only 5/5, 5/8, 5/11, 5/14, 5/18 as labels
- Y-axis: 0–100

Below the chart, show a status row:
  "Current: 55  ·  7-day delta: −7  ·  Trend: ↓ Declining"
  The "↓ Declining" text in red.

Add an alert callout below the status row:
  "⚠ Trust coherence has declined 17 points over 14 days.
   Review recent campaign assets for manipulation patterns."
  Style: amber background, amber left border.

Section header: "Brand Trust Drift Monitor"
Subline: "Longitudinal trust coherence across evaluated campaign assets"

Do not touch anything else in the Growth view.
```

---

### FIX-14 · Add Eval Platform Integration Panel to Settings
read CLAAUDE.md
**What's missing:** No eval platform connection UI exists. Run this after FIX-03 (Settings page) is complete.

**Prerequisite:** FIX-03 must be complete before running this prompt.

**Do not touch:** The three existing Settings sections (LLM Connections, Analytics Connectors, Workspace Thresholds, GitHub / CI/CD).

```
In the Settings page created by FIX-03, add a fifth section:
"Eval Platform Integrations"

Position it between the "Analytics Connectors" section and the
"Workspace Thresholds" section.

Show four platform rows:

1. Braintrust
   Status: Not connected
   Button: "Connect via OAuth" (teal outline button)
   Subline: "Cognitive scores appear as first-class scorer columns"

2. Langfuse
   Status: Not connected
   Button: "Connect via OAuth"
   Subline: "Scores visible in trace evaluation view"

3. Weights & Biases
   Status: Not connected
   Button: "Connect via API Key"
   Subline: "Cognitive scorer in W&B Weave evaluations"

4. Arize Phoenix
   Status: Not connected
   Button: "Connect via API Key"
   Subline: "Cognitive dimensions in Phoenix eval dashboard"

Below the four rows, add a grey info box:
"Cognitive Scorer API endpoint:
 https://api.cognarc.com/v1/score
 Compatible with any platform that supports custom scorers.
 OpenAPI spec · Python SDK · TypeScript SDK"

Use the same row styling as the Analytics Connectors section above it.
Do not touch any other section of the Settings page.
```

---

### FIX-15 · Deploy to a Real URL
read CLAUDE.md
**What's broken:** The demo was recorded from `localhost:5173`. This signals the product has never been deployed.

**Risk level:** Zero — this is deployment configuration, not code.

```
Deploy this Vite + React app to Vercel.

Step 1 — Check the build works locally:
  pnpm build
  pnpm preview
  Verify the preview loads correctly at localhost:4173.

Step 2 — Deploy to Vercel:
  If Vercel CLI is not installed: pnpm add -g vercel
  Run: vercel
  Follow the prompts:
    - Link to existing project or create new
    - Framework: Vite (auto-detected)
    - Build command: pnpm build (or npm run build)
    - Output directory: dist
    - No environment variables needed for the frontend-only build

Step 3 — Verify the deployment:
  Visit the .vercel.app URL Vercel provides.
  Click through all six nav items and verify they render.
  Check the Kill Switch is visible.
  Check the Act-Gated Approvals page loads.

Step 4 — Record all future demo footage from the Vercel URL, not localhost.

If Vercel is not suitable, Netlify is an identical process:
  netlify deploy --prod --dir=dist
```

---

## P2 — Medium Priority Fixes
### Fix before productization

---

### FIX-16 · Add Manipulation Category Breakdown to Safety Audit Trail

**Do not touch:** The audit trail component structure. The zone badge colours. The Safety view's other sections.

```
In the Safety / Red Team view, find the Full Audit Trail table.

For rows where the action is "CONTENT_FLAG", add a compact taxonomy
breakdown below the action name in that table row.

Show it as a single line of small monospace text:
  FU: [score]  SP: [score]  AE: [score]  AM: [score]  SD: [score]  OB: [score]

Use these values for the visible CONTENT_FLAG entries:
  Entry 1 (8:38 AM, rejected): FU:84  SP:8  AE:23  AM:71  SD:6  OB:15
  Entry 2 (7:38 AM, rejected): FU:12  SP:71  AE:8  AM:19  SD:44  OB:9

Where a category score exceeds 70, render it in red. All others in grey.

Category abbreviations:
  FU = false urgency
  SP = social proof fabrication
  AE = ambiguity exploitation
  AM = authority mimicry
  SD = sycophantic drift
  OB = obfuscation

Add a legend line at the top of the audit trail:
"For CONTENT_FLAG entries: FU · SP · AE · AM · SD · OB (scores >70 in red)"
Style it in small muted grey text.

Do not touch any other row types or any other section.
```

---

### FIX-17 · Add Baseline Delta to CI/CD Gate Results

**Do not touch:** The PR cards' existing content (PASS/WARN/FAIL badge, PR number, branch name, risk score, timestamp). Just add the delta.

```
In the Engineer view, find the CI/CD Gate — Recent Evaluations section.

For each PR evaluation card, add a baseline delta indicator next to
the risk score.

Current state: each card shows a risk score (e.g. "82") on the right.

Add a delta value next to the score:
  PR #247 (FAIL): "82" → show "+18 vs baseline" in red text below the score
  PR #246 (PASS): "34" → show "-12 vs baseline" in green text below the score
  PR #245 (PASS): "28" → show "-3 vs baseline" in green text below the score
  PR #244 (WARN): "61" → show "+11 vs baseline" in amber text below the score

Format: small text, positioned directly below the risk score number.
Positive delta (regression) = red. Negative delta (improvement) = green.
Amber for warning-level regressions.

Do not touch:
- The PASS/WARN/FAIL badge
- The PR number, title, or branch name
- The triggering rule text (e.g. "manipulation_risk > 50")
- The timestamp
- The Prompt Regression Monitor section above it
```

---

### FIX-18 · Add A/B Comparison Share Link and Confidence Level

**Do not touch:** The variant scores, the winner recommendation, the Onboarding Load Curve below it.

```
In the Designer view, find the A/B comparison result section
(the one showing "Variant A preferred" with score deltas).

Add two elements:

1. A confidence badge next to "Variant A preferred":
   - The score delta for this comparison exceeds 15pts on 2 dimensions,
     so confidence is HIGH.
   - Render a pill badge: "HIGH CONFIDENCE" with a green background,
     positioned inline next to "Variant A preferred".

2. A "Share Report" button (teal outline, small) below the comparison result:
   - On click: copy a mock URL to clipboard:
     "https://cognarc.app/reports/ab-comparison-demo-001"
   - After click: change button text to "Link copied!" for 2 seconds,
     then revert to "Share Report".
   - Below the button, show small grey text:
     "Shareable link · Valid for 30 days"

Do not touch:
- The score numbers or deltas
- The winner recommendation text
- The Onboarding Load Curve table below
- Any upload functionality
```

---

### FIX-19 · Add Detector Annotations to Onboarding Load Curve

**Do not touch:** The table's structure, column headers, or existing values. Just add annotations to specific rows.

```
In the Designer view, find the "Onboarding Flow Analyzer — Step-by-Step
Load Curve" table.

The table has columns: STEP · COGNITIVE LOAD · COMPREHENSION · DROP-OFF %

Add inline warning badges to specific rows based on their data:

Row "Connect SDK" (Load: 71, Comprehension: 54, Drop-off: -22%):
  Add badge: "⚠ Comprehension Gap" in amber next to the step name.
  Reason: Comprehension < 55.

Row "Configure" (Load: 83, Comprehension: 41, Drop-off: -39%):
  Add badge: "⚠ Choice Overload" in red next to the step name.
  Add badge: "⚠ Comprehension Gap" in amber next to the step name.
  Reason: Load > 83 AND Comprehension < 55.

Row "Profile" (Load: 42):
  Add badge: "⚠ Trust Timing" in orange next to the step name.
  Reason: This step requests profile/personal data — flag as a potential
  trust timing mismatch (the product is asking for data before establishing value).

Badge style: small pill, coloured background, white text, positioned
inline after the step name text.

Keep the existing table note at the bottom:
"Steps with load > 70 are highlighted in red. Steps with comprehension < 55
indicate likely abandonment."
Add a second note line:
"⚠ Comprehension Gap: CC < 55  ·  ⚠ Choice Overload: CL > 83  ·  ⚠ Trust Timing: data requested before value demonstrated"

Do not touch:
- The column headers
- The score values
- The heatmap section above it
- Any other Designer view section
```

---

### FIX-20 · Add Rewrite Suggestions to CI/CD Gate Failures

**Do not touch:** The existing PR card content. The Prompt Regression Monitor above it.

```
In the Engineer view, find the CI/CD Gate — Recent Evaluations section.

For PR cards with FAIL or WARN status (PR #247 FAIL, PR #244 WARN),
add a collapsible "Suggested Rewrites" section below the triggering
rule text.

Default state: collapsed. Show a small chevron link: "▼ View suggested rewrites (3)"

When expanded (on click), show a numbered list of 3 rewrite options:

For PR #247 (FAIL — cognitive_load > 75, comprehension_confidence < 55):
  1. "You can complete this setup in a few steps." · Predicted Load: 52 · CC: 71 · Risk: LOW
  2. "Let's walk through the configuration together." · Predicted Load: 48 · CC: 76 · Risk: LOW
  3. "Configure your workspace (3 steps)." · Predicted Load: 44 · CC: 79 · Risk: LOW

For PR #244 (WARN — manipulation_risk > 50):
  1. "See how teams are using this feature." · Predicted Load: 41 · CC: 72 · Risk: LOW
  2. "Used by product teams to improve onboarding." · Predicted Load: 38 · CC: 75 · Risk: LOW
  3. "Learn how this works with a quick example." · Predicted Load: 36 · CC: 78 · Risk: LOW

Each rewrite option shows:
- A number badge (1, 2, 3)
- The rewrite text in quotes
- Predicted scores inline (small, muted)
- A "Use this" button (does nothing yet, just styled) on the right

When collapsed, the chevron changes to "▲ Hide suggested rewrites".

Use useState for the collapsed/expanded state per PR card.
Do not touch the PASS cards (no rewrites shown for passing PRs).
```

---

### FIX-21 · Add Event-to-Cognition Sample to PM View

**Do not touch:** The Alignment Score panel. The 30-Day Alignment chart. The Analytics Connector Status table. Any other PM view section.

```
In the Product Manager view, add a new section called "Recent Event Labels"
below the Analytics Connector Status table.

This section demonstrates the Event-to-Cognition Translation Layer
by showing a sample of recently labelled behavioral events.

Show a table with columns:
  RAW EVENT  |  COGNITIVE LABEL  |  PLATFORM  |  TIME

Populate with 7 mock rows:
  "Rage click on Submit button"         → "Confusion / violated expectation"       · Amplitude · 2:18 PM
  "Field re-entry × 4 (email field)"   → "Working memory overload"                · Segment   · 2:15 PM
  "Session abandonment post-modal"      → "Trust erosion trigger"                  · PostHog   · 2:11 PM
  "Dwell 47s — no scroll (pricing pg)" → "Cognitive load stall"                   · Amplitude · 2:08 PM
  "Scroll reversal at step 3"           → "Comprehension failure"                  · Segment   · 1:59 PM
  "High scroll velocity, 0 clicks"      → "Low attention engagement"               · GA4       · 1:54 PM
  "Repeated visit: onboarding page"     → "Unresolved comprehension"               · PostHog   · 1:47 PM

The "COGNITIVE LABEL" column text should be coloured:
  "Confusion", "Trust erosion", "Overload", "Stall", "Failure" → red/amber
  "Low attention", "Unresolved" → amber

Add a subline above the table:
"Labels applied within 200ms of event occurrence · Writing back to Amplitude + Segment"

Section header: "Recent Event Labels"

Do not touch any existing PM view section.
```

---

### FIX-22 · Expand the Connected Surfaces Panel

**Do not touch:** The Agent Activity Feed beside it. The Cognitive Health section above. Any other Workspace Overview section.

```
In the Workspace Overview, find the "Connected Surfaces" panel
(currently showing just "Web App" and appears cut off).

Expand it to show all connected surfaces clearly:

Show 4 connected surface rows:
  🟢  Web App          · SDK active · Last event: 2 min ago
  🟢  GitHub Repo      · cognarc-app · CI/CD gate active
  🟢  Amplitude        · Write-back enabled · 8,421 events today
  🟡  Mixpanel         · Degraded · 0 events today

Add a fifth row as a placeholder:
  ➕  Add Surface       · (grey, clickable, navigates to Settings page)

Add five small buyer surface activity icons below the list,
one per buyer type, in a horizontal row:
  [Eng] [PM] [Growth] [Design] [Safety]
  Style: small pill badges. Active ones in teal, inactive in grey.
  Current state: Eng, PM, Growth, Design all active (teal). Safety inactive (grey).
  Add a label below: "Active buyer surfaces (last 30 days)"

Do not touch:
- The Agent Activity Feed
- The Cognitive Health section
- The trend chart
```

---

## Verification Checklist

Run through this after completing all P0 and P1 fixes, before recording a new demo.

```
GOVERNANCE
[ ] Kill Switch toggle shows confirmation dialog when clicked
[ ] Kill Switch activation adds ACT_GATED entry to audit log
[ ] Kill Switch banner appears across dashboard when active
[ ] KILL_SWITCH in audit log shows ACT_GATED zone (not OBSERVE)
[ ] WRITEBACK_SYNC in audit log shows ACT_AUTO zone (not OBSERVE)
[ ] Engineer view audit log defaults to ALL zones visible

UPLOAD / CONNECTION
[ ] Uploading a file in Growth view adds it to queue immediately
[ ] Queue item progresses: queued → processing → complete with scores
[ ] Settings page accessible from sidebar nav
[ ] Settings page has LLM connection form that shows success state
[ ] View As dropdown is gone from the sidebar

HEATMAP
[ ] Heatmap shows colour gradient overlay on uploaded image
[ ] No disclaimer text visible below the heatmap
[ ] Small legend (High/Medium/Low attention) visible

SAFETY VIEW
[ ] Manipulation Detection Feed visible at top of Safety view
[ ] Feed shows 5 entries with taxonomy category badges
[ ] "View Evidence" link opens the Evidence Package drawer
[ ] Evidence drawer shows 6-category taxonomy scores
[ ] Evidence drawer shows activation signature (limbic/prefrontal)
[ ] Evidence drawer shows evidence snippets with highlights

GROWTH VIEW
[ ] Cognitive Funnel Mapper section visible
[ ] Funnel chart shows two lines (Load and Trust)
[ ] Peak load and trust gap annotations on the chart
[ ] Brand Trust Drift Monitor shows 14-day area chart
[ ] Alert callout visible below trust chart

ACT-GATED APPROVALS
[ ] Confidence intervals visible below each TRIBE score
[ ] "Top Brain Regions" row present
[ ] "Decision required by" timestamp on pending items
[ ] Predicted cognitive scores next to each alternative

AGENT ACTIVITY FEED
[ ] Feed shows 7 varied entries with all four zone types
[ ] No hash codes visible — all entries have plain-language descriptions

DEPLOYMENT
[ ] App accessible at a public URL (not localhost)
[ ] All nav items work on the deployed URL
```

---

## What Not to Touch

A reminder of what is working correctly and must not be changed:

| Component | Location | Why it's correct |
|---|---|---|
| Four-panel Cognitive Health | Workspace Overview | Clean layout, correct data |
| 30-Day Trend Chart | Workspace Overview | Correct Recharts implementation |
| Analytics Connector Status Table | PM View | Well-structured, matches case study |
| Onboarding Load Curve table | Designer View | Correct structure (add annotations in FIX-19 only) |
| Prompt Regression Monitor | Engineer View | Correct columns and data |
| Variant Ranker | Growth View | Correct ranking logic |
| Zone-coloured audit badges | All audit logs | Visual system is correct (data is wrong — fix in FIX-05) |
| Act-Gated Approve/Reject buttons | Act-Gated page | Correct — add to them in FIX-08, never replace |
| Safety View full audit trail | Safety View | Zone variety and Export JSON correct |
| Post-Remediation Monitor | Safety View | Concept correct — expand entries in FIX-09 area |

---

*CognArc Dashboard Fix Prompt Pack · For Development Use · Run one prompt at a time · Verify before proceeding*
