# CognArc — Fix Pack 5
## Real Connections, Real Inputs, Live Data Flows

> **Context:** Fix Packs 1–4 and the URL Analysis pack have been applied.
> This pack addresses the fundamental "outputs without inputs" problem:
> every screen that shows results must have a visible, working mechanism
> for providing the input that generates those results.
>
> Issues addressed:
> 1. Growth: Creative Evaluation Queue missing View Report for txt/png
> 2. Growth: Variant Ranker has no upload mechanism
> 3. Safety: no visible input source, Post-Remediation items not clickable
> 4. Engineer: Prompt Regression Monitor has no prompt input mechanism
> 5. Settings: all connections are simulations — switch to real auth
> 6. Settings: LLM connect/disconnect not functional
> 7. GitHub CI/CD pipeline — webhook receiver + real PR evaluation
>
> **Sequencing:**
> FIX5-01 (Supabase schema additions) must run first.
> FIX5-02 through FIX5-06 can run in any order after that.
> FIX5-07 (GitHub webhook) depends on FIX5-06 (Settings real connections).
> FIX5-08 (real analytics OAuth) depends on FIX5-01.
> FIX5-09 (real eval platform connections) depends on FIX5-01.

---

## Pre-Flight

```bash
# Confirm Supabase is set up (Fix Pack 4)
cat package.json | grep supabase

# Find where View Report button should be in Growth view
grep -r "View Report\|viewReport" src/ --include="*.tsx" --include="*.jsx" -l

# Find the Variant Ranker component
grep -r "Variant Ranker\|VariantRanker" src/ --include="*.tsx" --include="*.jsx" -l

# Find the Post-Remediation Monitor
grep -r "Post-Remediation\|PostRemediation\|remediation" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Find the Prompt Regression Monitor
grep -r "Prompt Regression\|PromptRegression" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Find the Settings LLM Connections section
grep -r "LLM Connections\|llmConnections" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Find the GitHub CI/CD settings section
grep -r "GitHub\|CI/CD\|webhook" src/ --include="*.tsx" --include="*.jsx" -l
```

---

## FIX5-01 · Supabase Schema Additions

**Run this first. All other prompts in this pack depend on these tables.**

```sql
-- Run in Supabase → SQL Editor → New query

─────────────────────────────────────────────────────────────
Variants table (Variant Ranker uploads)
─────────────────────────────────────────────────────────────

CREATE TABLE variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL,   -- groups variants in one comparison run
  label           TEXT NOT NULL,   -- "Variant A", "Variant B", etc.
  content_type    TEXT NOT NULL,   -- "text" | "image" | "url"
  content_text    TEXT,            -- for text variants
  storage_path    TEXT,            -- for image variants (Supabase storage)
  url             TEXT,            -- for URL variants
  scores          JSONB,           -- cognitive scores after evaluation
  rank            INTEGER,         -- 1 = best, null = not yet ranked
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON variants
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

─────────────────────────────────────────────────────────────
Remediation findings table (Safety / Red Team inputs)
─────────────────────────────────────────────────────────────

CREATE TABLE remediation_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,   -- manipulation taxonomy category
  score           FLOAT NOT NULL,
  source          TEXT NOT NULL,   -- "manual" | "growth_upload" | "video_analysis" | "cicd"
  source_ref      TEXT,            -- filename, PR number, URL etc.
  status          TEXT NOT NULL DEFAULT 'open',  -- open | remediated | monitoring | clear
  remediated_at   TIMESTAMPTZ,
  last_check      TIMESTAMPTZ,
  reemergence_risk FLOAT DEFAULT 0,
  evidence        JSONB,           -- full evidence package
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE remediation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON remediation_findings
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

─────────────────────────────────────────────────────────────
Prompt registry table (Engineer view prompt inputs)
─────────────────────────────────────────────────────────────

CREATE TABLE prompt_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  prompt_id       TEXT NOT NULL,   -- stable identifier (SHA-256 of system prompt)
  name            TEXT NOT NULL,   -- human-readable name e.g. "Checkout confirmation"
  source          TEXT NOT NULL,   -- "manual" | "github" | "api"
  source_ref      TEXT,            -- file path, GitHub repo, etc.
  current_text    TEXT NOT NULL,
  baseline_text   TEXT,
  current_scores  JSONB,
  baseline_scores JSONB,
  score_history   JSONB DEFAULT '[]',  -- array of {version, scores, timestamp}
  status          TEXT NOT NULL DEFAULT 'ok',  -- ok | warn | block
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, prompt_id)
);

ALTER TABLE prompt_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON prompt_registry
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

─────────────────────────────────────────────────────────────
GitHub connections table
─────────────────────────────────────────────────────────────

CREATE TABLE github_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_url        TEXT NOT NULL,
  repo_owner      TEXT NOT NULL,
  repo_name       TEXT NOT NULL,
  installation_id TEXT,            -- GitHub App installation ID (future)
  webhook_secret  TEXT NOT NULL,   -- HMAC secret for verifying webhook payloads
  monitored_paths TEXT[] NOT NULL DEFAULT ARRAY['prompts/**/*.txt','src/copy/**/*.json'],
  status          TEXT NOT NULL DEFAULT 'connected',
  last_event_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, repo_url)
);

ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON github_connections
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

─────────────────────────────────────────────────────────────
LLM connections table (replaces workspace_settings.connectors
for LLM endpoints specifically)
─────────────────────────────────────────────────────────────

CREATE TABLE llm_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,       -- user-given name e.g. "Production GPT-4o"
  provider        TEXT NOT NULL,       -- "openai" | "anthropic" | "google" | "custom"
  endpoint_url    TEXT NOT NULL,
  api_key_hint    TEXT,                -- last 4 chars only, for display
  api_key_encrypted TEXT NOT NULL,     -- encrypted — never returned to client
  status          TEXT NOT NULL DEFAULT 'connected',
  last_tested_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE llm_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON llm_connections
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));
```

---

## FIX5-02 · Growth View — Fix Creative Evaluation Queue + Variant Ranker

**Three issues fixed here:**
1. No "View Report" button for txt and png files (only mp4 had it)
2. Variant Ranker has no upload mechanism
3. Variant Ranker results are static and pre-seeded

**Do not touch:** Brand Trust Drift Monitor. Cognitive Funnel Mapper.
Copy Health Checker. The queue item card layout for completed video files.

```
─────────────────────────────────────────────────────────────
PART 1: View Report for ALL file types (txt, png, mp4)
─────────────────────────────────────────────────────────────

Find the Creative Evaluation Queue in the Growth view.
Currently "View Report →" only appears on completed video items.

Add "View Report →" to ALL completed queue items regardless of file type.
The report content varies by file type:

FOR TEXT FILES (.txt, .md, .csv treated as text):
  Show the CognitiveScoreCard component in manager mode with the
  item's scores. Below it, the full text content in a scrollable
  monospace box. Below that, the manipulation taxonomy breakdown
  (6 categories with their scores). A "Get Rewrite Suggestions"
  button at the bottom.

  Section header: "Text Cognitive Analysis"
  Show: overall health badge, radar chart, plain-English rows,
  taxonomy breakdown if manipulation > 40.

FOR IMAGE FILES (.png, .jpg, .webp):
  Show the CognitiveScoreCard in manager mode with the item's scores.
  Display the uploaded image.
  Below the image: the heatmap overlay (same canvas approach from
  Fix Pack 3 Live LLM-C04 — position-aware gradient overlay).
  Below the heatmap: what the scores mean for this image:
    "Attention is concentrated in the [upper-left / centre / etc.]
     region. Cognitive load is [high/moderate/low] — consider
     [simplifying the composition / reducing text overlay /
     increasing contrast]."
  A "Get copy rewrite" button if there is any text content in
  the image filename or associated copy.

FOR VIDEO FILES (.mp4, .mov, .webm):
  Existing video report behaviour (from Fix Pack 3 Live LLM-C07).
  No change.

IMPLEMENTATION:

Find where queue items are rendered. Add a "View Report →" button
to every item where status === "complete", regardless of file type.

The report panel expands inline below the queue item (same pattern
as the video report). Add data-testid="queue-item-report" to each
expandable panel.

─────────────────────────────────────────────────────────────
PART 2: Variant Ranker — Add Upload Mechanism
─────────────────────────────────────────────────────────────

The Variant Ranker currently shows a ranked list with hardcoded
variants. There is no way to add variants.

REPLACE the Variant Ranker section with this layout:

HEADER: "Variant Ranker"
SUBLINE: "Upload up to 8 variants. CognArc ranks them by predicted
          cognitive engagement and trust coherence."

─── UPLOAD AREA ─────────────────────────────────────────────

A variant upload panel above the ranked results:

"Add a variant" — three input method tabs:
  [Paste text]  [Upload image]  [Enter URL]

Paste text tab:
  Textarea, placeholder: "Paste your copy — headline, email, ad, CTA..."
  "Variant label" input: "Variant A" (auto-increments: A, B, C...)
  "Add Variant" button (teal outline)

Upload image tab:
  File drop zone (accepts .png .jpg .webp)
  "Variant label" input
  "Add Variant" button

Enter URL tab:
  URL input
  "Variant label" input
  "Add Variant" button

Each added variant appears as a card in a "Pending variants" section:
  [label] · [content preview — first 60 chars or filename] · [×remove]

A "Run Comparison" button (teal, full-width):
  Disabled until at least 2 variants are added
  Enabled when 2–8 variants are present
  On click: evaluate all variants and rank them

─── LOADING STATE ───────────────────────────────────────────

"Scoring [n] variants..."
A progress bar that fills as each variant is scored.
Each variant scored sequentially (POST /score for each).

─── RANKED RESULTS ──────────────────────────────────────────

After scoring, show ranked results (best first):

Each result card:
  Rank badge (1, 2, 3...) · Label · Content preview
  Score chips: Load · Trust · Manip
  Mini health badge: CLEAR / NEEDS REVIEW / FLAGGED
  "Get rewrite →" button (if NEEDS REVIEW or FLAGGED)

Below the ranked list:
  "Ranking based on: lowest cognitive load (40%) +
   highest trust coherence (40%) + lowest manipulation risk (20%)"

  "Start New Comparison" button (outline) — clears all variants
  and resets to the upload state.

─── PERSISTENCE ─────────────────────────────────────────────

When "Run Comparison" is clicked:
  Generate a session_id (UUID)
  For each variant, insert to the variants table in Supabase:
    { workspace_id, session_id, label, content_type, content_text
      or storage_path or url, scores (after evaluation), rank }

  The ranked results persist across navigation because they are
  stored in Supabase. Load the most recent session on Growth view
  mount:
    SELECT * FROM variants
    WHERE workspace_id = $1
    ORDER BY created_at DESC
    LIMIT 8  -- get the most recent session

  If recent session exists: show those results immediately.
  Show "Last comparison: [date]" above the results.
  Show "Start New Comparison" button to clear and start fresh.

Do not touch:
- Creative Evaluation Queue
- Brand Trust Drift Monitor
- Cognitive Funnel Mapper
- Copy Health Checker
```

---

## FIX5-03 · Safety / Red Team View — Add Input Source + Clickable Remediation

**Two issues:**
1. The Manipulation Detection Feed shows results with no visible input source
2. Post-Remediation Monitor items are not clickable

**Do not touch:** The Full Audit Trail. The Evidence drawer (already built).

```
─────────────────────────────────────────────────────────────
PART 1: Show input sources in Manipulation Detection Feed
─────────────────────────────────────────────────────────────

Find the Manipulation Detection Feed at the top of the Safety view.

Each detection entry currently shows:
  [category badge] [score] [timestamp] [excerpt] [View Evidence]

Add a source indicator to each entry, showing where the detection
came from:

  [category badge] [score] [timestamp] [SOURCE] [excerpt] [View Evidence]

SOURCE badge styling (small pill, grey background, dark text):
  "Growth upload"      — when source === "growth_upload"
  "Video analysis"     — when source === "video_analysis"
  "CI/CD gate"         — when source === "cicd"
  "URL analysis"       — when source === "url_analysis"
  "Manual submission"  — when source === "manual"

Below the feed, add a "Submit content for review" section:

  Header: "Submit content for manual review"
  Subline: "Paste any AI output, campaign copy, or model response to
            scan for manipulation patterns."

  Textarea: placeholder "Paste any content — AI output, ad copy,
            email body, model response..."
  "Scan for manipulation" button (teal)

  On click:
    Call POST /score with the pasted text and manipulation_check: true
    If any taxonomy score > 40: add a new entry to the manipulation
    feed with source: "manual"
    Also insert to remediation_findings table:
      { workspace_id, title: first 60 chars of text,
        category: highest-scoring taxonomy category,
        score: highest taxonomy score, source: "manual",
        status: "open", evidence: full score response }
    Also call addAuditEntry and addAgentFeedEntry via AppContext

  This is the answer to "where is Safety fetching results from" —
  it fetches from:
    a. Growth uploads above threshold (wired in Fix Pack 3 LLM-B08)
    b. Video analysis critical findings (wired in Fix Pack 3 LLM-C08)
    c. CI/CD gate manipulation breaches (wired in FIX5-07 below)
    d. Manual submissions (this new form)
    e. URL analysis findings (wired in URL Analysis pack)

  Add a small info callout above the feed:
  "ℹ Detections are generated automatically from connected sources
   (creative uploads, video analysis, CI/CD gate, URL analysis)
   and manual submissions below."

─────────────────────────────────────────────────────────────
PART 2: Post-Remediation Monitor — make items clickable
─────────────────────────────────────────────────────────────

Find the Post-Remediation Monitor section.
Currently it shows 2 items (CLEAR and MONITORING status) that are
not clickable.

Make each item a clickable row that expands a detail panel:

COLLAPSED STATE (each row):
  [status badge] [title] [remediated date] [last check] [reemergence risk]
  Small chevron ▼ at the right end

EXPANDED DETAIL PANEL (below the clicked row):

  Section A: Finding History
    Timeline of status changes:
      Detected → Open → Remediated → [Monitoring] → [Clear / Re-emerged]
    Each event: date + what happened
    Use a simple vertical timeline with dots and lines

  Section B: Original Evidence
    The original detection that triggered this finding:
    Category badge · Score · The text excerpt that was flagged
    "View full evidence" link → opens the Evidence drawer for this finding

  Section C: Current Monitoring Status
    For MONITORING items:
      "Last checked: [timestamp]"
      "Re-emergence risk: [score]/100"
      A mini sparkline chart showing risk trend over 5 check points
      "Next check: in [time]"
      Button: "Check now" — re-runs the detection on the latest
      content from the same source and updates the risk score

    For CLEAR items:
      "No re-emergence detected across [n] checks since [date]"
      "Monitoring continues for [30] more days"
      Button: "Mark as resolved" — removes from active monitoring

  Section D: Actions
    "Export finding report" — downloads JSON with full finding history
    "Add to audit log" — creates an explicit audit entry noting this
      finding was reviewed

PERSISTENCE:
  Load remediation_findings from Supabase on Safety view mount.
  The existing 2 hardcoded items should be migrated into Supabase
  as part of Fix Pack 4's seed data function.
  New items added via manual submission (Part 1 above) or via
  Growth uploads appear in real time via Supabase realtime subscription.

Add data-testid="remediation-row" and
data-testid="remediation-detail" for E2E tests.

Do not touch:
- The Full Audit Trail section
- The Evidence drawer
- The Manipulation Detection Feed entries themselves
```

---

## FIX5-04 · Engineer View — Prompt Regression Monitor Input Mechanism

**The issue:** The Prompt Regression Monitor shows tracked prompts with
regression status but there is no visible way to add prompts to the system.

**Do not touch:** The existing regression monitor table. The CI/CD gate
results. The audit log.

```
Find the Prompt Regression Monitor section in the Engineer view.

Currently it shows 4 hardcoded prompts with no way to add new ones.

─────────────────────────────────────────────────────────────
PART 1: Load prompts from Supabase prompt_registry table
─────────────────────────────────────────────────────────────

Replace the hardcoded prompt array with a Supabase query:

  const { data: prompts } = await supabase
    .from('prompt_registry')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

The existing 4 hardcoded prompts should be inserted into Supabase
as seed data when the workspace is first created (add to the
seedDemoData function from Fix Pack 4).

─────────────────────────────────────────────────────────────
PART 2: Add prompt input mechanism
─────────────────────────────────────────────────────────────

Add an "Add Prompt" button at the top right of the Prompt Regression
Monitor section (teal outline, small).

On click: open a modal with three tabs for how to add a prompt:

TAB 1: "Paste prompt"
  Label: "Prompt name" (text input, e.g. "Checkout confirmation")
  Textarea: "Paste your prompt text here"
    placeholder: "You are a helpful assistant. Summarise the user's
                  order for confirmation..."
  Button: "Add to monitor" (teal)

  On submit:
    Generate prompt_id = SHA-256 of the prompt text (first 200 chars)
    Call POST /score with the prompt text
    Insert to prompt_registry:
      { workspace_id, prompt_id, name, source: "manual",
        current_text: promptText, baseline_text: promptText,
        current_scores: scores, baseline_scores: scores,
        score_history: [{ version: "v1", scores, timestamp }],
        status: "ok" }
    New prompt appears in the monitor table immediately.
    Close modal. Show brief success: "Prompt added to monitor."

TAB 2: "From GitHub"
  Subline: "Connect a GitHub repository to automatically track prompt
            files. Any PR that changes a monitored file will update
            this monitor."
  If no GitHub connection exists:
    "No GitHub repository connected."
    Button: "Connect a repository →" (navigates to Settings → GitHub)
  If GitHub connections exist:
    Show a list of connected repos with their monitored paths.
    "New prompts are automatically added when a PR changes a
     monitored file."
    Button: "View connected repos →" (navigates to Settings → GitHub)

TAB 3: "From API"
  Subline: "Send prompts to the monitor programmatically using the
            CognArc API."
  Code block showing how to register a prompt via API:

    POST https://api.cognarc.com/v1/prompts
    Authorization: Bearer {your_api_key}

    {
      "name": "Checkout confirmation",
      "text": "Your prompt text here",
      "workspace_id": "{your_workspace_id}"
    }

  "Get API key →" link (navigates to Settings → API)
  (API key management is a future feature — show a placeholder)

─────────────────────────────────────────────────────────────
PART 3: Re-evaluate button per prompt
─────────────────────────────────────────────────────────────

In the expanded detail panel for each prompt row (from Fix Pack 3
Live LLM-C06), add a "Re-evaluate" button in the Actions Row:

"Re-evaluate" button:
  On click: POST /score with the current_text of this prompt
  Update prompt_registry with the new scores
  If new scores show regression (load up > threshold or CC down >
  threshold): update status to WARN or BLOCK
  Update score_history array with the new evaluation
  Show "Re-evaluated just now" confirmation

This allows a user to manually trigger a re-evaluation of any
prompt without waiting for a GitHub PR.

Do not touch:
- The clickable row expand/collapse (from Fix Pack 3 Live LLM-C06)
- The CI/CD gate results section
- The audit log
```

---

## FIX5-05 · Settings — LLM Connections (Real Connect/Disconnect)

**The issue:** The Settings LLM Connections section shows "Production GPT-4o"
as connected but there is no real connect or disconnect flow.

**Do not touch:** Analytics Connectors section. Eval Platform Integrations.
Workspace Thresholds. GitHub / CI/CD section.

```
Find the LLM Connections section in the Settings view.

─────────────────────────────────────────────────────────────
PART 1: Load real connections from Supabase
─────────────────────────────────────────────────────────────

Replace the hardcoded "Production GPT-4o" entry with a Supabase query:

  const { data: connections } = await supabase
    .from('llm_connections')
    .select('id, name, provider, endpoint_url, api_key_hint, status, last_tested_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

Note: api_key_encrypted is NEVER fetched to the frontend.
Only api_key_hint (last 4 chars) is shown.

─────────────────────────────────────────────────────────────
PART 2: Add Endpoint — real save to Supabase
─────────────────────────────────────────────────────────────

Find the "ADD ENDPOINT" form (Endpoint URL + API Key + Test/Save buttons).

"Test Connection" flow:
  When clicked:
  a. Show loading: "Testing connection..."
  b. Call a serverless function or the api-gateway service:
       POST /api/test-llm-connection
       Body: { endpoint_url, api_key }
     This function makes a minimal API call to the endpoint
     (e.g. list models or a lightweight completion) and returns
     { success: true/false, latency_ms, provider_detected }
  c. On success: show "✓ Connection successful ([latency]ms)"
     Auto-populate the "Name" field if empty:
     Provider detection: if endpoint contains "openai" → "OpenAI GPT-4o"
     if "anthropic" → "Claude", if "googleapis" → "Gemini", else "Custom"
  d. On failure: show the specific error:
     "Authentication failed — check your API key"
     "Endpoint unreachable — check the URL"
     "Rate limit exceeded — try again in a moment"

"Save" flow:
  When clicked after a successful test:
  a. Encrypt the API key server-side (via edge function or api-gateway)
     NEVER store plaintext API keys in Supabase from the client
     The encryption happens in the api-gateway service:
       POST /api/save-llm-connection
       Body: { workspace_id, name, endpoint_url, api_key }
     Server encrypts api_key with AES-256 using ENCRYPTION_KEY env var
     Stores: api_key_encrypted (AES-256 ciphertext), api_key_hint (last 4 chars)
  b. On success: new connection appears in the list, form clears
  c. Call addAuditEntry: { action: "LLM_CONNECTED", zone: "ACT_AUTO" }

─────────────────────────────────────────────────────────────
PART 3: Disconnect — real removal
─────────────────────────────────────────────────────────────

Each LLM connection row needs a "Disconnect" button.

Add it to each connection row:
  [green dot] [name] [endpoint] [status] [last tested] [Disconnect]

"Disconnect" button (red outline, small):
  On click: show confirmation modal:
    "Disconnect [name]?
     CognArc will stop using this endpoint for cognitive evaluation.
     Existing results are not affected."
    Buttons: "Disconnect" (red) | "Cancel"
  On confirm:
    DELETE from llm_connections WHERE id = $1 AND workspace_id = $2
    Remove from UI list
    Call addAuditEntry: { action: "LLM_DISCONNECTED", zone: "ACT_AUTO" }
    If this was the only connection and onboarding banner
    hasConnectedEndpoint is true: reset it to false so the banner
    reappears (user has no connected endpoint)

─────────────────────────────────────────────────────────────
PART 4: Test Connection button per existing row
─────────────────────────────────────────────────────────────

Each saved connection row should also have a "Test" button:
  On click: re-run the connection test and update last_tested_at
  Show "✓ Healthy" or "✗ Failed" inline for 3 seconds

Do not touch:
- Analytics Connectors section
- Eval Platform Integrations
- Workspace Thresholds
- GitHub section
```

---

## FIX5-06 · Settings — Real OAuth for Analytics Connectors

**The issue:** The Configure buttons do nothing real. Analytics connector
statuses are hardcoded. Write-back toggles don't persist.

**Note on true OAuth:** Full OAuth requires a backend callback handler and
registered OAuth apps at each analytics platform. This prompt implements
the real OAuth flow for Segment (webhook-based, simpler) and Amplitude
(API key-based). PostHog and GA4 follow the same API key pattern.
True OAuth for Mixpanel requires a registered app.

**Do not touch:** LLM Connections section. Eval Platform Integrations.
Workspace Thresholds. GitHub section.

```
Find the Analytics Connectors section in the Settings view.

─────────────────────────────────────────────────────────────
PART 1: Load connector state from Supabase workspace_settings
─────────────────────────────────────────────────────────────

The connectors JSONB in workspace_settings should drive all connector
display state. Replace hardcoded connector statuses with:

  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('connectors')
    .eq('workspace_id', workspaceId)
    .single()

  const connectors = settings?.connectors ?? {}

Default connector state (set when workspace is created):
  {
    "segment":   { status: "not_connected", writeBack: false },
    "amplitude": { status: "not_connected", writeBack: false },
    "mixpanel":  { status: "not_connected", writeBack: false },
    "posthog":   { status: "not_connected", writeBack: false },
    "ga4":       { status: "not_connected", writeBack: false }
  }

─────────────────────────────────────────────────────────────
PART 2: Segment — webhook connection (real)
─────────────────────────────────────────────────────────────

Segment uses webhooks, not OAuth. The Configure modal for Segment:

  Title: "Configure Segment"
  Status: [current status badge]

  If not connected:
    Step 1: "Add this webhook URL to your Segment source:"
    Code block (copy button):
      https://[your-api-gateway-url]/webhooks/segment/[workspace_id]
    Step 2: "Enter your Segment webhook signing secret:"
    Input: "Webhook signing secret" (password type)
    Button: "Save & Verify"

    On Save & Verify:
      Save the signing secret encrypted in workspace_settings.connectors.segment
      Send a test ping to Segment's API to verify the secret format is valid
      Update status to "connected" in Supabase

  If connected:
    Show: "Webhook URL: https://[api-gateway]/webhooks/segment/[workspace_id]"
    Show: "Signing secret: ••••••[last4]"
    Write-back toggle (persists to Supabase on change)
    Test connection button
    Disconnect button

─────────────────────────────────────────────────────────────
PART 3: Amplitude — API key connection (real)
─────────────────────────────────────────────────────────────

Configure modal for Amplitude:

  Title: "Configure Amplitude"

  If not connected:
    Input: "API Key" (from Amplitude dashboard → Project Settings)
    Input: "Secret Key" (from Amplitude dashboard → Project Settings)
    Button: "Connect Amplitude"

    On Connect:
      POST to api-gateway: /api/verify-amplitude-connection
        Body: { api_key, secret_key }
      API gateway makes a lightweight call to Amplitude's API to verify
        (GET https://amplitude.com/api/2/events/list with the key)
      On success:
        Save api_key encrypted + api_key_hint to workspace_settings.connectors.amplitude
        Update status: "connected"
        Show: "✓ Connected to Amplitude"

  If connected:
    Show API key hint: "••••••[last4]"
    Write-back toggle
    "Test connection" button
    "Disconnect" button → clears API key from Supabase

─────────────────────────────────────────────────────────────
PART 4: PostHog — API key connection (same pattern as Amplitude)
─────────────────────────────────────────────────────────────

Configure modal for PostHog:

  Input: "Project API Key" (from PostHog → Project Settings → API Keys)
  Input: "Host" (default: https://us.i.posthog.com, editable for self-hosted)
  Button: "Connect PostHog"

  Verification: POST /api/verify-posthog-connection
    API gateway calls: GET https://[host]/api/projects/
    with Authorization: Bearer [api_key]

─────────────────────────────────────────────────────────────
PART 5: GA4 — Measurement Protocol connection
─────────────────────────────────────────────────────────────

Configure modal for GA4:

  Input: "Measurement ID" (G-XXXXXXXXXX format)
  Input: "API Secret" (from GA4 → Admin → Measurement Protocol API secrets)
  Button: "Connect GA4"

  No verification possible (GA4 Measurement Protocol is write-only).
  Just save and show connected status.

─────────────────────────────────────────────────────────────
PART 6: Mixpanel —  show clear state
─────────────────────────────────────────────────────────────

Mixpanel requires a registered OAuth app. Until that is set up:
  Show status: "Connection setup required"
  Configure modal shows:
    "Full Mixpanel OAuth integration requires a registered Mixpanel
     app. In the meantime, you can use Mixpanel's Ingestion API
     directly."
  Input: "Project Token" (from Mixpanel → Project Settings)
  Button: "Save Token" (stores without verification)

─────────────────────────────────────────────────────────────
PART 7: Write-back toggle — real persistence
─────────────────────────────────────────────────────────────

Every write-back toggle must persist to Supabase when changed:

  const handleWriteBackToggle = async (platform: string, enabled: boolean) => {
    await supabase.from('workspace_settings')
      .update({
        connectors: {
          ...currentConnectors,
          [platform]: { ...currentConnectors[platform], writeBack: enabled }
        }
      })
      .eq('workspace_id', workspaceId)
    // AppContext already syncs from Supabase realtime
  }

This also means the PM view connector table (which reads from AppContext
which reads from Supabase) will reflect write-back changes automatically.

Do not touch:
- LLM Connections section
- Eval Platform Integrations
- Workspace Thresholds
- GitHub section
```

---

## FIX5-07 · GitHub CI/CD — Real Webhook Pipeline

**This is the largest prompt in the pack. Read it fully before running.**

**What this builds:**
1. A webhook receiver endpoint in the api-gateway service
2. Real GitHub file fetching via GitHub API
3. Real cognitive scoring of changed prompt files
4. Real GitHub PR comment posting
5. Real GitHub check status (pass/fail)
6. Prompt Regression Monitor updates in Supabase

**Prerequisites:** FIX5-01, FIX5-06, api-gateway service running.

```
─────────────────────────────────────────────────────────────
PART 1: GitHub App or PAT setup (choose one)
─────────────────────────────────────────────────────────────

For the beta, use Personal Access Token (PAT) — simpler to set up.
GitHub App is the production path but requires app registration.

PAT requires these scopes:
  repo (read file contents, read PR info)
  pull_requests (post comments, set check status)

The user provides their PAT when connecting a repo in Settings.
CognArc stores it encrypted in github_connections.webhook_secret.

─────────────────────────────────────────────────────────────
PART 2: Settings GitHub section — real connection flow
─────────────────────────────────────────────────────────────

Find the GitHub / CI/CD section in Settings.

Replace the static "cognarc-app" connected row with a real flow.

"+ Add Repository" modal (this was built as a placeholder in Fix Pack 2
FIX-A09 — replace the placeholder save with real logic):

  Fields:
    "Repository URL": https://github.com/owner/repo
    "Personal Access Token": (password input)
    "Monitored paths": prompts/**/*.txt, src/copy/**/*.json
      (comma-separated, editable)
    "Webhook secret": (auto-generated, shown read-only)
      Generate with: crypto.randomUUID() + Date.now()

  "Connect Repository" button:

  On click:
    a. Parse owner and repo name from the URL
    b. Call POST /api/github/setup-webhook:
       { repo_owner, repo_name, pat, webhook_secret, monitored_paths }

       The api-gateway handler:
         1. Calls GitHub API to verify the PAT has repo access:
            GET https://api.github.com/repos/{owner}/{repo}
            Authorization: token {pat}
         2. Creates a webhook on the repo:
            POST https://api.github.com/repos/{owner}/{repo}/hooks
            {
              "name": "web",
              "active": true,
              "events": ["pull_request"],
              "config": {
                "url": "https://[api-gateway-url]/webhooks/github",
                "content_type": "json",
                "secret": webhook_secret
              }
            }
         3. On success: insert to github_connections in Supabase
         4. Returns: { success: true, webhook_id, repo_full_name }

    c. On success: show the repo in the connected list:
       "owner/repo · [n] monitored paths · Connected · Webhook active"
    d. Call addAuditEntry: { action: "GITHUB_REPO_CONNECTED", zone: "ACT_AUTO" }

  Each connected repo row has:
    Repo name · Status · Last event · "Configure" button · "Disconnect" button

  "Configure": opens modal to edit monitored paths
  "Disconnect": removes webhook from GitHub + deletes from Supabase

─────────────────────────────────────────────────────────────
PART 3: Webhook receiver in api-gateway
─────────────────────────────────────────────────────────────

Create services/api-gateway/src/routes/webhooks/github.ts
(or the equivalent in whichever language/framework api-gateway uses)

POST /webhooks/github

Handler logic:

  1. Verify webhook signature:
     const sig = req.headers['x-hub-signature-256']
     const payload = req.rawBody
     // Look up webhook_secret from github_connections by repo full name
     const expectedSig = 'sha256=' + hmacSha256(payload, webhookSecret)
     if (!timingSafeEqual(sig, expectedSig)) return 401

  2. Parse the pull_request event:
     const { action, pull_request, repository } = req.body
     if (!['opened', 'synchronize', 'reopened'].includes(action)) return 200
     // Only process PRs being opened or updated

  3. Get the workspace for this repo:
     SELECT workspace_id FROM github_connections
     WHERE repo_owner = $1 AND repo_name = $2

  4. Get the list of changed files in the PR:
     GET https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}/files
     Authorization: token {encrypted_pat}  ← decrypt from Supabase

  5. Filter to monitored paths:
     const monitoredPaths = connection.monitored_paths
     const filesToEvaluate = changedFiles.filter(f =>
       monitoredPaths.some(pattern => minimatch(f.filename, pattern))
     )
     if (filesToEvaluate.length === 0) return 200

  6. For each file to evaluate:
     a. Fetch file content from GitHub:
          GET https://api.github.com/repos/{owner}/{repo}/contents/{path}
          ?ref={pr_head_sha}
        Decode base64 content
     b. POST /score with the file content
     c. Load baseline scores from prompt_registry (if exists)
     d. Calculate delta vs baseline
     e. Determine status: OK / WARN / BLOCK based on workspace thresholds
     f. Upsert to prompt_registry:
          { workspace_id, prompt_id (SHA-256 of content),
            name (filename), source: "github",
            source_ref: "owner/repo:path",
            current_text, current_scores,
            baseline_text (if first time), baseline_scores (if first time),
            score_history (append new entry),
            status, updated_at }

  7. Post PR comment with results:
     POST https://api.github.com/repos/{owner}/{repo}/issues/{pr_number}/comments
     {
       "body": buildPRComment(fileResults, workspaceThresholds)
     }

     buildPRComment format:
     ```
     ## CognArc Cognitive Evaluation

     | File | CL | ΔCL | CC | ΔCC | Manipulation | Status |
     |------|----|----|----|----|-------------|--------|
     | prompts/checkout.txt | 67 | +18 | 54 | -17 | 71 | 🔴 BLOCK |
     | prompts/welcome.txt  | 42 | +3  | 81 | -2  | 22 | ✅ OK   |

     **2 files evaluated · 1 blocked · 1 passed**

     Thresholds: CL max 80 · Manip max 40 · CC min 50
     [View in CognArc →](https://cognarc-dashboard.vercel.app/engineer)
     ```

  8. Set GitHub check status:
     POST https://api.github.com/repos/{owner}/{repo}/statuses/{sha}
     {
       "state": anyBlock ? "failure" : anyWarn ? "pending" : "success",
       "description": anyBlock
         ? "Cognitive evaluation failed — manipulation or load threshold exceeded"
         : "All cognitive thresholds passed",
       "context": "CognArc / cognitive-evaluation",
       "target_url": "https://cognarc-dashboard.vercel.app/engineer"
     }

  9. Write to audit log and agent feed:
     addAuditEntry: { action: "CICD_EVALUATED", zone: "ACT_AUTO",
       outcome: anyBlock ? "blocked" : "passed",
       metadata: { pr_number, files_evaluated, files_blocked } }
     addAgentFeedEntry: appropriate zone + description

  10. If any file BLOCKED: add to act_gated_queue:
     { title: "PR #[n] blocked — [filename] manipulation risk [score]/100",
       type: "THRESHOLD_BREACH", status: "pending" }

─────────────────────────────────────────────────────────────
PART 4: CI/CD Gate results panel — load from Supabase
─────────────────────────────────────────────────────────────

In the Engineer view CI/CD Gate section:

Replace the hardcoded PR results with a Supabase query.
Each webhook invocation writes a cicd_evaluation record.
Add a new table:

  CREATE TABLE cicd_evaluations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo          TEXT NOT NULL,
    pr_number     INTEGER NOT NULL,
    pr_title      TEXT NOT NULL,
    branch        TEXT,
    status        TEXT NOT NULL,   -- pass | warn | fail
    risk_score    FLOAT,
    breach_reason TEXT,
    baseline_delta JSONB,          -- { cl_delta, cc_delta }
    evaluated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE cicd_evaluations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "workspace_data" ON cicd_evaluations
    FOR ALL USING (workspace_id IN (
      SELECT id FROM workspaces WHERE user_id = auth.uid()
    ));

Load in Engineer view:
  SELECT * FROM cicd_evaluations
  WHERE workspace_id = $1
  ORDER BY evaluated_at DESC
  LIMIT 10

The 4 existing hardcoded PR results should be seeded into this table
as demo data (add to seedDemoData function).

Do not touch:
- The suggested rewrites expand/collapse
- The Prompt Regression Monitor table
- The audit log
```

---

## FIX5-08 · Settings — Real Eval Platform Connections

**The issue:** Braintrust shows "Connected" but "Connect via OAuth"
for Langfuse does nothing real. API key connections for W&B and Arize
do nothing real.

**Do not touch:** LLM Connections. Analytics Connectors. GitHub. Thresholds.

```
Find the Eval Platform Integrations section in Settings.

─────────────────────────────────────────────────────────────
Braintrust — already shows Connected (Simulate Connection was used)
─────────────────────────────────────────────────────────────

Replace the simulated connection with a real API key flow:

  "Disconnect" button → clears from workspace_settings.connectors.braintrust

  "Reconnect" → opens modal:
    Input: "Braintrust API Key" (from braintrustdata.com → Settings → API Keys)
    Button: "Connect Braintrust"

    On connect:
      POST /api/verify-braintrust-connection
      API gateway: GET https://api.braintrustdata.com/v1/project
        with Authorization: Bearer {api_key}
      On success: save encrypted key, mark connected.

─────────────────────────────────────────────────────────────
Langfuse — real OAuth (or API key alternative)
─────────────────────────────────────────────────────────────

Langfuse does not have a standard OAuth flow for third-party integrations.
Use API key instead (cleaner for a beta):

  "Connect" modal:
    Input: "Public Key" (from langfuse.com → Project Settings)
    Input: "Secret Key"
    Input: "Host" (default: https://cloud.langfuse.com, editable for self-hosted)
    Button: "Connect Langfuse"

    Verification:
      POST /api/verify-langfuse-connection
      API gateway: GET https://cloud.langfuse.com/api/public/health
        with basic auth (public_key:secret_key)

─────────────────────────────────────────────────────────────
Weights & Biases — API key (real)
─────────────────────────────────────────────────────────────

  "Connect via API Key" modal:
    Input: "W&B API Key" (from wandb.ai → Settings → API keys)
    Input: "Entity" (your W&B username or team name, optional)
    Button: "Connect W&B"

    Verification:
      POST /api/verify-wandb-connection
      API gateway: GET https://api.wandb.ai/graphql
        query { viewer { entity } }
        with Authorization: Basic base64(api_key)

─────────────────────────────────────────────────────────────
Arize Phoenix — API key (real)
─────────────────────────────────────────────────────────────

  "Connect via API Key" modal:
    Input: "Arize API Key" (from app.arize.com → Settings → API Keys)
    Input: "Space ID"
    Button: "Connect Arize"

    Verification:
      POST /api/verify-arize-connection
      API gateway calls Arize Health API with the key.

─────────────────────────────────────────────────────────────
All connections — persist to Supabase
─────────────────────────────────────────────────────────────

For each successfully verified connection:
  Update workspace_settings.connectors.[platform]:
    { status: "connected", api_key_hint: last4,
      api_key_encrypted: encrypted, connected_at: now }

  Call addAuditEntry:
    { action: "EVAL_PLATFORM_CONNECTED", zone: "ACT_AUTO",
      outcome: "success", metadata: { platform } }

  Update the UI to show "Connected" badge + "Disconnect" button.

For Disconnect:
  Update workspace_settings.connectors.[platform].status to "not_connected"
  Clear the encrypted key
  Call addAuditEntry: { action: "EVAL_PLATFORM_DISCONNECTED" }

─────────────────────────────────────────────────────────────
SDK links — already fixed in Fix Pack 3 Live
─────────────────────────────────────────────────────────────

The OpenAPI spec, Python SDK, and TypeScript SDK links are already
real anchor tags pointing to GitHub URLs (from Fix Pack 3 Live LLM-C06).
No change needed here.
```

---

## E2E Tests

```
Create e2e/fix-pack-5.spec.ts:

import { test, expect } from '@playwright/test'

test.describe('Growth View — Creative Evaluation Queue', () => {

  test('completed txt file shows View Report button', async ({ page }) => {
    await page.goto('/growth')
    const txtRow = page.locator('text=email-body-copy.txt').locator('..')
    const completeStatus = await txtRow.locator('text=complete').isVisible()
    if (completeStatus) {
      await expect(txtRow.locator('text=View Report')).toBeVisible()
    }
  })

  test('completed png file shows View Report button', async ({ page }) => {
    await page.goto('/growth')
    const pngRow = page.locator('text=hero-banner-v3.png').locator('..')
    const completeStatus = await pngRow.locator('text=complete').isVisible()
    if (completeStatus) {
      await expect(pngRow.locator('text=View Report')).toBeVisible()
    }
  })

  test('View Report for txt expands with CognitiveScoreCard', async ({ page }) => {
    await page.goto('/growth')
    const viewReport = page.locator('text=email-body-copy.txt')
      .locator('..').locator('text=View Report →')
    if (await viewReport.isVisible()) {
      await viewReport.click()
      await expect(
        page.locator('text=FLAGGED')
          .or(page.locator('text=NEEDS REVIEW'))
          .or(page.locator('text=CLEAR'))
      ).toBeVisible({ timeout: 3000 })
    }
  })

})

test.describe('Growth View — Variant Ranker', () => {

  test('variant upload mechanism is visible', async ({ page }) => {
    await page.goto('/growth')
    await expect(
      page.locator('text=Add a variant')
        .or(page.locator('text=Paste text'))
        .or(page.locator('[data-testid="add-variant"]'))
    ).toBeVisible()
  })

  test('Run Comparison disabled until 2 variants added', async ({ page }) => {
    await page.goto('/growth')
    const runBtn = page.locator('text=Run Comparison')
    if (await runBtn.isVisible()) {
      await expect(runBtn).toBeDisabled()
    }
  })

  test('adding 2 text variants enables Run Comparison', async ({ page }) => {
    await page.goto('/growth')
    // Add first variant
    await page.click('text=Paste text')
    await page.locator('textarea').fill('Start your journey today.')
    await page.click('text=Add Variant')
    // Add second variant
    await page.locator('textarea').fill('Act now — limited time offer!')
    await page.click('text=Add Variant')
    // Run Comparison should be enabled
    await expect(page.locator('text=Run Comparison')).toBeEnabled({ timeout: 2000 })
  })

})

test.describe('Safety View — Post-Remediation Monitor', () => {

  test('remediation items are clickable', async ({ page }) => {
    await page.goto('/safety')
    const rows = page.locator('[data-testid="remediation-row"]')
    if (await rows.count() > 0) {
      await expect(rows.first()).toHaveCSS('cursor', 'pointer')
    }
  })

  test('clicking a remediation item expands detail panel', async ({ page }) => {
    await page.goto('/safety')
    const rows = page.locator('[data-testid="remediation-row"]')
    if (await rows.count() > 0) {
      await rows.first().click()
      await expect(
        page.locator('[data-testid="remediation-detail"]').first()
      ).toBeVisible({ timeout: 2000 })
    }
  })

  test('manual submission form is visible', async ({ page }) => {
    await page.goto('/safety')
    await expect(
      page.locator('text=Submit content for review')
        .or(page.locator('text=Scan for manipulation'))
    ).toBeVisible()
  })

  test('manual submission triggers detection feed entry', async ({ page }) => {
    await page.goto('/safety')
    const textarea = page.locator('textarea[placeholder*="Paste any content"]')
    if (await textarea.isVisible()) {
      await textarea.fill(
        'Act now! Limited time offer. Experts unanimously agree this is your last chance.'
      )
      await page.click('text=Scan for manipulation')
      await expect(
        page.locator('text=Manual submission')
          .or(page.locator('text=false_urgency'))
      ).toBeVisible({ timeout: 5000 })
    }
  })

})

test.describe('Engineer View — Prompt Regression Monitor', () => {

  test('Add Prompt button is visible', async ({ page }) => {
    await page.goto('/engineer')
    await expect(
      page.locator('text=Add Prompt')
        .or(page.locator('[data-testid="add-prompt-button"]'))
    ).toBeVisible()
  })

  test('Add Prompt modal opens with three tabs', async ({ page }) => {
    await page.goto('/engineer')
    await page.click('text=Add Prompt')
    await expect(page.locator('text=Paste prompt')).toBeVisible()
    await expect(page.locator('text=From GitHub')).toBeVisible()
    await expect(page.locator('text=From API')).toBeVisible()
  })

  test('pasting and adding a prompt adds it to the monitor', async ({ page }) => {
    await page.goto('/engineer')
    await page.click('text=Add Prompt')
    await page.fill('input[placeholder*="Prompt name"]', 'Test prompt')
    await page.fill('textarea', 'You are a helpful assistant. Be concise.')
    await page.click('text=Add to monitor')
    await expect(page.locator('text=Test prompt')).toBeVisible({ timeout: 5000 })
  })

})

test.describe('Settings — LLM Connections', () => {

  test('Disconnect button visible for connected endpoints', async ({ page }) => {
    await page.goto('/settings')
    const connectedRow = page.locator('text=Connected').first().locator('..')
    if (await connectedRow.isVisible()) {
      await expect(connectedRow.locator('text=Disconnect')).toBeVisible()
    }
  })

  test('Test Connection button shows result', async ({ page }) => {
    await page.goto('/settings')
    const testBtn = page.locator('text=Test').first()
    if (await testBtn.isVisible()) {
      await testBtn.click()
      await expect(
        page.locator('text=Healthy')
          .or(page.locator('text=Failed'))
          .or(page.locator('text=Testing'))
      ).toBeVisible({ timeout: 5000 })
    }
  })

})

test.describe('Settings — Analytics Connectors', () => {

  test('Configure modal opens for Segment with webhook URL', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('text=Segment').locator('..').locator('text=Configure').click()
    await expect(page.locator('text=Configure Segment')).toBeVisible()
    await expect(
      page.locator('text=webhook')
        .or(page.locator('text=Webhook'))
    ).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('Configure modal opens for Amplitude with API key fields', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('text=Amplitude').locator('..').locator('text=Configure').click()
    await expect(page.locator('text=Configure Amplitude')).toBeVisible()
    await expect(page.locator('input[type="password"], input[placeholder*="API"]').first())
      .toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('write-back toggle state persists after navigation', async ({ page }) => {
    await page.goto('/settings')
    const amplitudeRow = page.locator('text=Amplitude').locator('..')
    const toggle = amplitudeRow.locator('button[role="switch"], input[type="checkbox"]').first()
    const before = await toggle.isChecked()
    await toggle.click()
    await page.click('text=Engineer')
    await page.click('text=Settings')
    const toggleAfter = page.locator('text=Amplitude').locator('..')
      .locator('button[role="switch"], input[type="checkbox"]').first()
    const after = await toggleAfter.isChecked()
    expect(after).toBe(!before)
    // Reset
    await toggleAfter.click()
  })

})

test.describe('Settings — GitHub CI/CD', () => {

  test('Add Repository opens modal with PAT field', async ({ page }) => {
    await page.goto('/settings')
    await page.click('text=Add Repository')
    await expect(page.locator('text=Connect GitHub Repository')).toBeVisible()
    await expect(
      page.locator('input[placeholder*="github.com"]')
        .or(page.locator('input[placeholder*="https://github"]'))
    ).toBeVisible()
    await expect(
      page.locator('input[placeholder*="ghp_"]')
        .or(page.locator('input[type="password"]'))
    ).toBeVisible()
  })

})
```

---

## Run Tests

```bash
# Run this pack's tests
npx playwright test e2e/fix-pack-5.spec.ts

# Run with visible browser
npx playwright test e2e/fix-pack-5.spec.ts --headed

# Run a specific describe block
npx playwright test e2e/fix-pack-5.spec.ts --grep "Variant Ranker"
npx playwright test e2e/fix-pack-5.spec.ts --grep "GitHub"

# Full suite
pnpm test:e2e
```

---

## What Not to Touch

| Already working | Status |
|---|---|
| Creative Evaluation Queue upload flow | ✅ Extend only — add View Report |
| Video report (mp4) | ✅ Unchanged |
| Evidence drawer | ✅ Referenced from remediation detail, not rebuilt |
| CognitiveScoreCard component | ✅ Used in queue reports, not rebuilt |
| Kill Switch | ✅ Unchanged |
| Act-Gated decision package | ✅ Receives new items from CI/CD, not rebuilt |
| All Fix Pack 1–4 fixes | ✅ This pack builds on them |

---

## GitHub Pipeline — Summary

```
Developer edits a prompt file → opens PR
          ↓
GitHub fires pull_request webhook to:
  https://[api-gateway]/webhooks/github
          ↓
api-gateway verifies HMAC signature
          ↓
Fetches changed files from GitHub API
          ↓
Filters to monitored paths from .cognarc.yml
          ↓
POSTs each file to Cognitive Scoring Service
          ↓
Compares scores against workspace thresholds (from Supabase)
          ↓
Compares scores against prompt baseline (from prompt_registry)
          ↓
Posts PR comment with score table
Sets GitHub check status (pass/fail/pending)
          ↓
Updates prompt_registry in Supabase
          ↓
If BLOCK: creates Act-Gated pending item
          ↓
Engineer view CI/CD Gate + Prompt Regression Monitor
update in real time via Supabase realtime subscription
```

---

*CognArc Fix Pack 5 · Real Connections, Real Inputs, Live Data Flows*
*FIX5-01 must run first · FIX5-07 requires FIX5-06 complete*
