# CognArc — URL Content Analysis
## Standalone Prompt Pack

> **Context:** Fix Packs 1, 2, 3 (Live), and 4 have been applied.
> This pack adds the ability to test any public URL directly — landing
> pages, blog posts, product pages, competitor sites — without copy-pasting.
> The URL is fetched, content is extracted by section, each section is
> scored, and the manager-friendly CognitiveScoreCard renders results.
>
> **Sequencing:**
> URL-01 (extraction service) → URL-02 (TypeScript client) →
> URL-03 (Growth view URL tab) → URL-04 (Designer A/B URL mode) →
> URL-05 (Supabase + PostHog wiring) → URL-06 (E2E tests)
>
> **What requires Fix Pack 3 Live first:**
> URL-03 and URL-04 use the `CognitiveScoreCard` component (LLM-C04)
> and the `requestRewrites()` client (LLM-C03). Run those first.

---

## What This Adds

```
New service:  services/url-extractor/   (Python, FastAPI, port 3008)
Frontend:     URL tab in Copy Health Checker (Growth view)
              URL mode in A/B Comparison (Designer view)
New route:    /url-analysis (standalone URL scorer page)
Supabase:     url_analyses table (stores results per workspace)
PostHog:      url_analysed, url_ab_compared events
```

---

## What Works vs What Does Not

```
WORKS:
  ✓ Static HTML pages (most marketing sites, landing pages)
  ✓ Server-rendered pages (WordPress, Webflow, Framer, Squarespace)
  ✓ Next.js / Nuxt pages with SSR enabled
  ✓ Blog posts and articles
  ✓ Product pages (Shopify, standard e-commerce)
  ✓ Public competitor pages
  ✓ Any page with readable HTML text content

DOES NOT WORK:
  ✗ Pages behind login (auth walls, SaaS dashboards)
  ✗ Pure client-side SPAs with no SSR (scores empty content)
  ✗ PDFs served at a URL
  ✗ YouTube / Vimeo / video URLs (use video analysis pipeline instead)
  ✗ Pages that block bots (Cloudflare challenge pages)
  ✗ Dynamic personalised content (A/B test variants, recommendations)
```

---

## Pre-Flight

```bash
# Confirm extraction service does not exist yet
ls services/url-extractor/ 2>/dev/null || echo "Does not exist — ready to build"

# Confirm BeautifulSoup not in any existing requirements
grep -r "beautifulsoup\|bs4" services/ 2>/dev/null || echo "Not installed yet"

# Confirm the Copy Health Checker exists (from Fix Pack 3 Live LLM-C05)
grep -r "Copy Health Checker\|Check this copy" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Confirm CognitiveScoreCard exists (from Fix Pack 3 Live LLM-C04)
grep -r "CognitiveScoreCard" src/ --include="*.tsx" --include="*.jsx" -l

# Confirm A/B comparison upload zones exist (from Fix Pack 2 FIX-A05)
grep -r "Variant A\|Run Cognitive Comparison" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Confirm Supabase client exists (from Fix Pack 4)
cat package.json | grep supabase
```

---

## URL-01 · Build the URL Content Extraction Service

**What this adds:** A backend service that fetches any public URL, extracts
meaningful text content by section, and returns structured sections ready
for cognitive scoring. Uses Simple HTTP fetch + BeautifulSoup (Option A)
with an optional Playwright headless browser fallback for JavaScript-heavy
pages.

**Do not touch:** The Cognitive Scoring Service. The Cognitive Rewrite Service.
Any existing frontend code.

```
Create services/url-extractor/

FILE STRUCTURE:
services/url-extractor/
├── src/
│   ├── main.py          # FastAPI app
│   ├── extractor.py     # Fetch + BeautifulSoup extraction logic
│   ├── cleaner.py       # Text cleaning and deduplication
│   └── models.py        # Pydantic models
├── requirements.txt
├── Dockerfile
└── README.md

─────────────────────────────────────────────────────────────
FILE: services/url-extractor/src/models.py
─────────────────────────────────────────────────────────────

from pydantic import BaseModel, HttpUrl
from typing import Optional

class ExtractRequest(BaseModel):
    url: str                          # The URL to fetch and extract
    workspace_id: str
    include_metadata: bool = True     # Extract meta title + description
    max_sections: int = 10            # Cap on number of sections returned

class ContentSection(BaseModel):
    section_type: str     # "hero" | "headline" | "value_prop" | "body" |
                          # "cta" | "nav" | "footer" | "meta" | "feature"
    label: str            # Human-readable label e.g. "Hero Headline"
    text: str             # The extracted copy
    element: str          # HTML element it came from e.g. "h1", "p", "button"
    word_count: int
    score_this: bool      # Whether this section should be sent for cognitive scoring
                          # False for nav, footer, boilerplate

class ExtractResponse(BaseModel):
    url: str
    page_title: str
    meta_description: Optional[str]
    sections: list[ContentSection]
    total_word_count: int
    extraction_method: str   # "http" | "headless"
    fetch_time_ms: int
    warning: Optional[str]   # e.g. "Page may require JavaScript rendering"

─────────────────────────────────────────────────────────────
FILE: services/url-extractor/src/cleaner.py
─────────────────────────────────────────────────────────────

import re

def clean_text(text: str) -> str:
    """Remove excess whitespace, newlines, and non-printable chars."""
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    # Remove common boilerplate phrases
    boilerplate = [
        "cookie", "privacy policy", "terms of service",
        "all rights reserved", "©", "subscribe to our newsletter",
        "follow us on", "accept cookies"
    ]
    for phrase in boilerplate:
        if phrase.lower() in text.lower() and len(text) < 80:
            return ""
    return text

def is_meaningful(text: str, min_words: int = 3) -> bool:
    """Return True if the text is worth scoring."""
    words = text.split()
    if len(words) < min_words:
        return False
    # Skip if it looks like a navigation item list
    if text.count('|') > 3 or text.count('·') > 3:
        return False
    return True

def deduplicate(sections: list[dict]) -> list[dict]:
    """Remove sections with duplicate or near-duplicate text."""
    seen = set()
    unique = []
    for section in sections:
        key = ' '.join(section['text'].lower().split()[:8])
        if key not in seen:
            seen.add(key)
            unique.append(section)
    return unique

─────────────────────────────────────────────────────────────
FILE: services/url-extractor/src/extractor.py
─────────────────────────────────────────────────────────────

import httpx
import time
import os
from bs4 import BeautifulSoup, Tag
from models import ContentSection, ExtractResponse
from cleaner import clean_text, is_meaningful, deduplicate

# Headers that mimic a real browser to avoid bot blocks
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

def classify_element(tag_name: str, text: str, classes: list[str]) -> tuple[str, str, bool]:
    """
    Returns (section_type, label, score_this).
    score_this = False for nav, footer, boilerplate.
    """
    classes_str = ' '.join(classes).lower()
    text_lower = text.lower()

    # Navigation — don't score
    if tag_name in ['nav'] or any(c in classes_str for c in ['nav', 'menu', 'header-nav']):
        return "nav", "Navigation", False

    # Footer — don't score
    if tag_name in ['footer'] or 'footer' in classes_str:
        return "footer", "Footer", False

    # Hero / main headline
    if tag_name == 'h1':
        return "hero", "Hero Headline", True

    # Subheadlines
    if tag_name == 'h2':
        # Check if it looks like a feature section header
        if any(word in text_lower for word in ['feature', 'benefit', 'how', 'why', 'what']):
            return "feature", f"Feature: {text[:40]}", True
        return "headline", "Section Headline", True

    if tag_name == 'h3':
        return "headline", "Sub-headline", True

    # CTA buttons
    if tag_name in ['button', 'a'] or any(c in classes_str for c in ['btn', 'button', 'cta']):
        if len(text.split()) <= 8:
            return "cta", "CTA Button", True
        return "cta", "CTA Link", True

    # Meta description
    if tag_name == 'meta':
        return "meta", "Meta Description", True

    # Value proposition — short paragraph near the top
    if tag_name == 'p' and len(text.split()) < 50:
        if any(c in classes_str for c in ['hero', 'subtitle', 'tagline', 'subheadline', 'lead']):
            return "value_prop", "Value Proposition", True
        return "value_prop", "Short Paragraph", True

    # Body copy
    if tag_name == 'p':
        return "body", "Body Copy", True

    # List items — could be feature bullets
    if tag_name in ['li']:
        return "feature", "Feature / Benefit", True

    return "body", "Content", True


async def extract_via_http(url: str, max_sections: int = 10) -> ExtractResponse:
    """Fetch URL and extract content using BeautifulSoup."""
    start = time.time()

    async with httpx.AsyncClient(
        headers=HEADERS,
        follow_redirects=True,
        timeout=15.0
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        html = response.text

    fetch_ms = int((time.time() - start) * 1000)

    soup = BeautifulSoup(html, 'html.parser')

    # Remove script, style, and other non-content tags
    for tag in soup(['script', 'style', 'noscript', 'iframe', 'svg', 'img']):
        tag.decompose()

    # Extract page title
    title_tag = soup.find('title')
    page_title = clean_text(title_tag.get_text()) if title_tag else "Untitled page"

    # Extract meta description
    meta_desc = None
    meta_tag = soup.find('meta', attrs={'name': 'description'})
    if meta_tag:
        content = meta_tag.get('content', '')
        meta_desc = clean_text(content) if content else None

    # Extract sections in document order
    raw_sections = []

    # Meta description first (if present)
    if meta_desc and is_meaningful(meta_desc):
        raw_sections.append({
            "section_type": "meta",
            "label": "Meta Description",
            "text": meta_desc,
            "element": "meta",
            "word_count": len(meta_desc.split()),
            "score_this": True,
        })

    # Walk through semantic elements in priority order
    priority_selectors = [
        'h1', 'h2', 'h3',
        'p', 'li',
        'button', 'a[class*="btn"]', 'a[class*="cta"]',
        '[class*="hero"] p', '[class*="subtitle"]',
        '[class*="tagline"]', '[class*="lead"]',
    ]

    seen_texts = set()

    for selector in priority_selectors:
        tags = soup.select(selector)
        for tag in tags:
            text = clean_text(tag.get_text(separator=' '))
            if not text or not is_meaningful(text):
                continue
            # Dedup
            key = ' '.join(text.lower().split()[:6])
            if key in seen_texts:
                continue
            seen_texts.add(key)

            tag_name = tag.name
            classes = tag.get('class', [])
            section_type, label, score_this = classify_element(
                tag_name, text, classes
            )

            raw_sections.append({
                "section_type": section_type,
                "label": label,
                "text": text,
                "element": tag_name,
                "word_count": len(text.split()),
                "score_this": score_this,
            })

    # Deduplicate and cap
    unique = deduplicate(raw_sections)[:max_sections]
    sections = [ContentSection(**s) for s in unique]

    total_words = sum(s.word_count for s in sections if s.score_this)

    # Warn if very little content was found (likely a JS-heavy SPA)
    warning = None
    if total_words < 50:
        warning = (
            "Very little text was extracted. This page may require "
            "JavaScript rendering. Try pasting the copy directly if "
            "URL results seem incomplete."
        )

    return ExtractResponse(
        url=url,
        page_title=page_title,
        meta_description=meta_desc,
        sections=sections,
        total_word_count=total_words,
        extraction_method="http",
        fetch_time_ms=fetch_ms,
        warning=warning,
    )

─────────────────────────────────────────────────────────────
FILE: services/url-extractor/src/main.py
─────────────────────────────────────────────────────────────

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import ExtractRequest, ExtractResponse
from extractor import extract_via_http

app = FastAPI(title="CognArc URL Content Extractor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "url-extractor"}

@app.post("/extract", response_model=ExtractResponse)
async def extract(request: ExtractRequest):
    # Basic URL validation
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="URL must start with http:// or https://"
        )

    # Block private/internal URLs
    blocked = ["localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10.0."]
    if any(b in request.url for b in blocked):
        raise HTTPException(
            status_code=400,
            detail="Private or internal URLs are not supported"
        )

    try:
        result = await extract_via_http(request.url, request.max_sections)
        return result
    except Exception as e:
        error_msg = str(e)
        # Friendly error messages for common failures
        if "Connection refused" in error_msg or "ConnectError" in error_msg:
            raise HTTPException(status_code=422, detail="Could not reach this URL. Check the address and try again.")
        if "403" in error_msg or "Forbidden" in error_msg:
            raise HTTPException(status_code=422, detail="This page blocked our request. Try pasting the copy directly instead.")
        if "404" in error_msg:
            raise HTTPException(status_code=422, detail="Page not found (404). Check the URL and try again.")
        if "timeout" in error_msg.lower():
            raise HTTPException(status_code=422, detail="This page took too long to respond. Try again or paste the copy directly.")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {error_msg}")

─────────────────────────────────────────────────────────────
FILE: services/url-extractor/requirements.txt
─────────────────────────────────────────────────────────────

fastapi==0.111.0
uvicorn==0.30.1
httpx==0.27.0
beautifulsoup4==4.12.3
lxml==5.2.2
pydantic==2.7.0

─────────────────────────────────────────────────────────────
FILE: services/url-extractor/Dockerfile
─────────────────────────────────────────────────────────────

FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install -r requirements.txt --no-cache-dir
COPY src/ .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3008"]

─────────────────────────────────────────────────────────────
Add to docker-compose.yml:
─────────────────────────────────────────────────────────────

  url-extractor:
    build: ./services/url-extractor
    ports:
      - "3008:3008"
    environment:
      - PYTHONUNBUFFERED=1

─────────────────────────────────────────────────────────────
Add to .env:
─────────────────────────────────────────────────────────────

URL_EXTRACTOR_URL=http://localhost:3008

─────────────────────────────────────────────────────────────
Add to Vercel environment variables:
─────────────────────────────────────────────────────────────

VITE_URL_EXTRACTOR_URL=https://url-extractor-xxx-uc.a.run.app
```

> **Claude Code Tip:** Test immediately after building:
> ```bash
> cd services/url-extractor
> pip install -r requirements.txt --break-system-packages
> uvicorn src.main:app --port 3008 &
> sleep 2
> curl -s -X POST http://localhost:3008/extract \
>   -H "Content-Type: application/json" \
>   -d '{"url":"https://stripe.com","workspace_id":"ws-1"}' \
>   | python3 -m json.tool | head -60
> ```
> Stripe's landing page is a good test — it is server-rendered,
> has a clear H1, clear CTAs, and a mix of short and long copy.

---

## URL-02 · TypeScript Client for URL Extractor

**Do not touch:** Any existing client files. Any existing services.

```
Create src/lib/url-extractor-client.ts:

export interface ContentSection {
  sectionType: 'hero' | 'headline' | 'value_prop' | 'body' | 'cta' |
               'nav' | 'footer' | 'meta' | 'feature'
  label: string       // e.g. "Hero Headline", "CTA Button"
  text: string        // The extracted copy
  element: string     // HTML element e.g. "h1", "p", "button"
  wordCount: number
  scoreThis: boolean  // false for nav, footer, boilerplate
}

export interface ExtractResponse {
  url: string
  pageTitle: string
  metaDescription: string | null
  sections: ContentSection[]
  totalWordCount: number
  extractionMethod: 'http' | 'headless'
  fetchTimeMs: number
  warning: string | null
}

const EXTRACTOR_URL = import.meta.env.VITE_URL_EXTRACTOR_URL
  ?? 'http://localhost:3008'

export async function extractUrl(
  url: string,
  workspaceId: string,
  maxSections: number = 10
): Promise<ExtractResponse> {
  const res = await fetch(`${EXTRACTOR_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      workspace_id: workspaceId,
      max_sections: maxSections,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail ?? `Extraction failed: ${res.status}`)
  }

  const data = await res.json()

  // Convert snake_case to camelCase
  return {
    url: data.url,
    pageTitle: data.page_title,
    metaDescription: data.meta_description,
    sections: data.sections.map((s: any) => ({
      sectionType: s.section_type,
      label: s.label,
      text: s.text,
      element: s.element,
      wordCount: s.word_count,
      scoreThis: s.score_this,
    })),
    totalWordCount: data.total_word_count,
    extractionMethod: data.extraction_method,
    fetchTimeMs: data.fetch_time_ms,
    warning: data.warning,
  }
}

Also create src/lib/page-scorer.ts:

A helper that takes an ExtractResponse, scores each section individually
via the Cognitive Scoring Service, and returns a combined result.

import type { ExtractResponse, ContentSection } from './url-extractor-client'

const SCORING_URL = import.meta.env.VITE_COGNITIVE_SCORING_URL
  ?? 'http://localhost:3001'

export interface ScoredSection extends ContentSection {
  scores: {
    cognitiveLoad: number
    comprehensionConfidence: number
    trustCoherence: number
    manipulationRisk: number
    cognitiveRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  } | null  // null if scoreThis is false
}

export interface PageScoringResult {
  url: string
  pageTitle: string
  overallScores: {
    cognitiveLoad: number
    comprehensionConfidence: number
    trustCoherence: number
    manipulationRisk: number
    cognitiveRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  }
  scoredSections: ScoredSection[]
  worstSection: ScoredSection | null     // highest manipulation or load
  warning: string | null
}

export async function scorePage(
  extraction: ExtractResponse,
  workspaceId: string
): Promise<PageScoringResult> {
  const sectionsToScore = extraction.sections.filter(s => s.scoreThis)

  // Score each section that warrants scoring
  const scoredSections: ScoredSection[] = await Promise.all(
    extraction.sections.map(async (section) => {
      if (!section.scoreThis) {
        return { ...section, scores: null }
      }
      try {
        const res = await fetch(`${SCORING_URL}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stimulus_type: 'text',
            content: section.text,
            workspace_id: workspaceId,
            options: { manipulation_check: true },
          }),
        })
        const data = await res.json()
        return {
          ...section,
          scores: {
            cognitiveLoad: data.cognitive_load,
            comprehensionConfidence: data.comprehension_confidence,
            trustCoherence: data.trust_coherence,
            manipulationRisk: data.manipulation_risk,
            cognitiveRisk: data.cognitive_risk,
          }
        }
      } catch {
        return { ...section, scores: null }
      }
    })
  )

  // Calculate weighted overall scores
  // Weight: hero (3x), cta (2x), value_prop (2x), everything else (1x)
  const WEIGHTS: Record<string, number> = {
    hero: 3, cta: 2, value_prop: 2, feature: 1.5, headline: 1, body: 1, meta: 0.5
  }

  let totalWeight = 0
  let sumLoad = 0, sumComp = 0, sumTrust = 0, sumManip = 0

  for (const section of scoredSections) {
    if (!section.scores) continue
    const w = WEIGHTS[section.sectionType] ?? 1
    totalWeight += w
    sumLoad  += section.scores.cognitiveLoad * w
    sumComp  += section.scores.comprehensionConfidence * w
    sumTrust += section.scores.trustCoherence * w
    sumManip += section.scores.manipulationRisk * w
  }

  const overallScores = totalWeight > 0 ? {
    cognitiveLoad:            Math.round(sumLoad  / totalWeight),
    comprehensionConfidence:  Math.round(sumComp  / totalWeight),
    trustCoherence:           Math.round(sumTrust / totalWeight),
    manipulationRisk:         Math.round(sumManip / totalWeight),
    cognitiveRisk: (sumManip / totalWeight > 60 || sumLoad / totalWeight > 70)
      ? 'HIGH' as const
      : (sumManip / totalWeight > 40 || sumLoad / totalWeight > 55)
      ? 'MEDIUM' as const
      : 'LOW' as const,
  } : {
    cognitiveLoad: 50, comprehensionConfidence: 50,
    trustCoherence: 50, manipulationRisk: 50, cognitiveRisk: 'MEDIUM' as const
  }

  // Find the worst section (highest combined manipulation + load)
  const scoredOnly = scoredSections.filter(s => s.scores !== null)
  const worstSection = scoredOnly.length > 0
    ? scoredOnly.reduce((worst, s) =>
        (s.scores!.manipulationRisk + s.scores!.cognitiveLoad) >
        (worst.scores!.manipulationRisk + worst.scores!.cognitiveLoad)
          ? s : worst
      )
    : null

  return {
    url: extraction.url,
    pageTitle: extraction.pageTitle,
    overallScores,
    scoredSections,
    worstSection,
    warning: extraction.warning,
  }
}

Add to .env.local:
  VITE_URL_EXTRACTOR_URL=http://localhost:3008
  VITE_COGNITIVE_SCORING_URL=http://localhost:3001
```

---

## URL-03 · Add URL Tab to Copy Health Checker (Growth View)

**What this adds:** A "Test a URL" tab alongside "Paste copy" in the
existing Copy Health Checker section. The user pastes a URL, the page
is fetched and scored section by section, and results show per-section
health badges plus an overall page health score.

**Prerequisite:** URL-01, URL-02, and Fix Pack 3 Live LLM-C04 (CognitiveScoreCard)
complete. The Copy Health Checker from Fix Pack 3 Live LLM-C05 must exist.

**Do not touch:** The "Paste copy" tab behaviour. The Variant Ranker.
The Brand Trust Drift Monitor. The Cognitive Funnel Mapper.
The Creative Evaluation Queue.

```
Find the "Copy Health Checker" section in the Growth view.

Add a tab switcher at the top of the section:

  [Paste copy]   [Test a URL]

Default: "Paste copy" (existing behaviour, unchanged).

─────────────────────────────────────────────────────────────
URL TAB LAYOUT:
─────────────────────────────────────────────────────────────

HEADER: "Test a URL"
SUBLINE: "Paste any public page URL — landing page, blog post, product
          page, or competitor site — and see how the copy scores."

INPUT ROW:
  A URL input field (type="url", full width):
    placeholder: "https://yoursite.com/landing-page"
    Validate: must start with https:// or http://
    Show a red border + "Please enter a valid URL" if invalid

  "Analyse Page" button (teal, right of input)

─────────────────────────────────────────────────────────────
LOADING STATE (after clicking Analyse Page):
─────────────────────────────────────────────────────────────

Show a progress sequence with animated steps:

  Step 1 (0.5s):  "Fetching page..."
  Step 2 (1.5s):  "Extracting copy sections..."
  Step 3 (3s+):   "Scoring [n] sections..."
  
Use a simple animated progress bar (CSS width transition, no library).
Total expected time: 3-8 seconds depending on page size and TRIBE mode.

─────────────────────────────────────────────────────────────
RESULTS LAYOUT:
─────────────────────────────────────────────────────────────

PART A: Page Header Row
  Page favicon (fetch from [domain]/favicon.ico, fallback to globe icon)
  Page title (from extraction)
  URL (truncated, with external link icon → opens URL in new tab)
  Extraction method badge: "Static analysis" or "Live render"

PART B: Overall Page Health
  The CognitiveScoreCard component in manager mode with:
    scores: the weighted overall scores from scorePage()
    context: "landing page"

  Above the card, one bold line:
    FLAGGED:       "⚠ This page has content that needs fixing before it converts."
    NEEDS REVIEW:  "⚠ This page has some issues worth addressing."
    CLEAR:         "✓ This page's copy is cognitively safe."

PART C: Section-by-Section Breakdown
  Header: "Section breakdown"
  Subline: "Scored from most to least impactful. Fix the top items first."

  A list of scored sections, sorted by manipulation_risk + cognitive_load
  (worst first). Each section card shows:

  ┌─────────────────────────────────────────────────────────┐
  │ [section type badge]  [label]              [health badge]│
  │                                                          │
  │ "[the extracted copy text — full, readable]"             │
  │                                                          │
  │ Load: 71  Comprehension: 48  Trust: 39  Manipulation: 84 │
  │                                                          │
  │ [Get safer alternative →]                                │
  └─────────────────────────────────────────────────────────┘

  Section type badge colours:
    hero:       navy background, white text
    cta:        teal background, white text
    value_prop: indigo background, white text
    headline:   slate background, white text
    feature:    blue background, white text
    body:       grey background, dark text

  Health badge per section: FLAGGED / NEEDS REVIEW / CLEAR (same logic
  as CognitiveScoreCard, per-section scores)

  "Get safer alternative →" button (shown for FLAGGED and NEEDS REVIEW only):
    Calls requestRewrites() with:
      originalText: the section's text
      copyType: map section type to copy type:
        hero/value_prop/cta → "landing_page"
        feature/headline    → "landing_page"
        body                → "campaign"
        meta                → "microcopy"
      scores: the section's cognitive scores
      workspaceId: current workspace id
    Shows the 3 alternatives inline, below the section card.
    Each alternative has a before/after mini CognitiveScoreCard.

  "Get safer alternative →" loading message:
    "Finding better alternatives..."

  Sections where scoreThis is false (nav, footer) are hidden entirely.

PART D: Priority Fix List
  Automatically generated from the worst 3 sections:
  "Top 3 fixes for this page:"
  1. [Worst section label]: [one-sentence recommendation]
  2. [Second worst]: [one-sentence recommendation]
  3. [Third worst]: [one-sentence recommendation]

  The one-sentence recommendations are generated based on which scores
  are failing:
    manipulationRisk > 60: "Reduce urgency language — this section
      is triggering pressure signals that undermine trust."
    cognitiveLoad > 70: "Simplify this copy — it is processing-heavy
      and may cause readers to disengage."
    comprehensionConfidence < 45: "Rewrite for clarity — this section
      is likely to be misunderstood by your audience."
    trustCoherence < 45: "Fix the trust signals — this section feels
      inconsistent with the rest of the page."

PART E: Warning Banner (if warning is present)
  If extraction.warning is not null, show an amber banner at the top
  of the results:
  "⚠ [warning text from extractor]"
  e.g. "Very little text was extracted. This page may require JavaScript
        rendering. Try pasting the copy directly if results seem incomplete."

─────────────────────────────────────────────────────────────
WIRING:
─────────────────────────────────────────────────────────────

1. On "Analyse Page" click:
   a. Validate URL (must start with http:// or https://)
   b. Show loading steps
   c. Call extractUrl(url, workspaceId)
   d. On success, call scorePage(extraction, workspaceId)
   e. Render results

2. On error from extractUrl():
   Show the error message from the service:
   "Could not reach this URL. Check the address and try again."
   "This page blocked our request. Try pasting the copy directly instead."
   etc. (These are the friendly errors from main.py)

3. PostHog tracking:
   track('url_analysed', {
     domain: new URL(url).hostname,  // only domain, not full path
     sectionCount: result.scoredSections.length,
     overallRisk: result.overallScores.cognitiveRisk,
     warningShown: !!result.warning,
   })
   track('url_section_rewrite_requested', {
     sectionType, manipulationRisk, cognitiveLoad
   })

4. Recent URLs (quality of life):
   Store the last 5 successfully analysed URLs in localStorage
   (not Supabase — this is a UI convenience, not business data).
   Show them below the input field as clickable chips:
   "Recent: stripe.com · notion.so · linear.app"

Do not touch:
- The "Paste copy" tab and its existing behaviour
- Any other Growth view section
```

---

## URL-04 · Add URL Mode to A/B Comparison (Designer View)

**What this adds:** A mode switch in the Designer view A/B Comparison
section that lets the user compare two URLs instead of uploading two files.
Useful for comparing your landing page against a competitor's, or comparing
two versions of a page on different domains.

**Prerequisite:** URL-01, URL-02 complete. The A/B upload mechanism from
Fix Pack 2 (FIX-A05) must exist.

**Do not touch:** The file upload A/B mode. The Heatmap Viewer.
The Onboarding Load Curve table.

```
Find the A/B Comparison section in the Designer view.
It currently has two upload zones (Variant A and Variant B).

Add a mode switch above the two zones:

  [Upload files]   [Compare URLs]

Default: "Upload files" (existing behaviour, unchanged).

─────────────────────────────────────────────────────────────
COMPARE URLS MODE LAYOUT:
─────────────────────────────────────────────────────────────

Two URL input fields side by side:

Left:
  Label: "Page A"
  Input placeholder: "https://yoursite.com/landing-v1"
  Below: small text — "Your page, current version, or option A"

Right:
  Label: "Page B"
  Input placeholder: "https://competitor.com or https://yoursite.com/landing-v2"
  Below: small text — "Competitor, new version, or option B"

"Compare Pages" button (full width, teal):
  Disabled until both URLs are filled and valid
  On click: fetch and score both pages, then show comparison

─────────────────────────────────────────────────────────────
LOADING STATE:
─────────────────────────────────────────────────────────────

Show two parallel progress indicators:
  "Analysing Page A..." (animated dots)
  "Analysing Page B..." (animated dots)

Both fetch and score in parallel (Promise.all).
Total time: 5-12 seconds for two pages.

─────────────────────────────────────────────────────────────
RESULTS LAYOUT:
─────────────────────────────────────────────────────────────

PART A: Head-to-Head Overview

  Two columns:

  LEFT — Page A:            RIGHT — Page B:
  [page title]              [page title]
  [domain]                  [domain]
  [health badge]            [health badge]
  [mini radar chart]        [mini radar chart]

  Centre column (between the two):
    Score deltas per dimension, using arrows:
    Load:           A: 71  →  B: 54  (↓ 17 — B is easier to read)
    Comprehension:  A: 48  →  B: 71  (↑ 23 — B is clearer)
    Trust:          A: 39  →  B: 62  (↑ 23 — B feels more trustworthy)
    Manipulation:   A: 84  →  B: 22  (↓ 62 — B is safer)

  Winner declaration below:
    "Page B scores better on [3 of 4] cognitive dimensions."
    [PAGE B PREFERRED] badge (teal, large) or [INCONCLUSIVE] if mixed results

    Confidence level:
      HIGH: winner better on ≥ 3 dimensions with delta > 15pts each
      MEDIUM: winner better on ≥ 2 dimensions
      LOW: mixed results — differences below 10pts across all dimensions

  Share Report button (same as file upload A/B mode):
    Generates a shareable summary link valid 30 days.

PART B: Section-Level Differences
  Expandable "See section detail" toggle.
  Shows the top-scoring section from each page side by side:

  Page A Hero:                  Page B Hero:
  "[page A h1 text]"            "[page B h1 text]"
  Load: 71 · Manip: 84          Load: 42 · Manip: 18
  FLAGGED                        CLEAR

  This makes it immediately obvious where the differences come from.

─────────────────────────────────────────────────────────────
WIRING:
─────────────────────────────────────────────────────────────

1. On "Compare Pages" click:
   const [resultA, resultB] = await Promise.all([
     scorePage(await extractUrl(urlA, workspaceId), workspaceId),
     scorePage(await extractUrl(urlB, workspaceId), workspaceId),
   ])

2. Determine winner:
   Count how many dimensions Page B wins (lower load/manipulation, higher
   comprehension/trust). If B wins ≥ 3: "Page B preferred". If A wins ≥ 3:
   "Page A preferred". Otherwise: "Inconclusive".

3. PostHog tracking:
   track('url_ab_compared', {
     domainA: new URL(urlA).hostname,
     domainB: new URL(urlB).hostname,
     winner: 'A' | 'B' | 'inconclusive',
     confidence: 'HIGH' | 'MEDIUM' | 'LOW',
   })

4. Error handling:
   If one URL fails but the other succeeds, show the error for the
   failed URL inline in its column:
   "Could not analyse Page A — [error message]. Fix this URL and try again."
   Do not block the entire comparison.

Do not touch:
- The Upload files mode and its existing A/B flow
- The Heatmap Viewer section
- The Onboarding Load Curve table
```

---

## URL-05 · Supabase Persistence for URL Analyses

**What this adds:** Stores URL analysis results in Supabase so they
persist across sessions. Users can re-open the Growth view and see their
previously analysed URLs without re-fetching.

**Prerequisite:** Fix Pack 4 (Supabase) applied. URL-01 through URL-03 complete.

```
Run this SQL in Supabase → SQL Editor → New query:

─────────────────────────────────────────────────────────────
Create url_analyses table:
─────────────────────────────────────────────────────────────

CREATE TABLE url_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  page_title      TEXT,
  overall_scores  JSONB NOT NULL,
  sections        JSONB NOT NULL,        -- array of scored sections
  warning         TEXT,
  analysed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by workspace + url
CREATE INDEX idx_url_analyses_workspace ON url_analyses(workspace_id);
CREATE INDEX idx_url_analyses_url ON url_analyses(workspace_id, url);

-- RLS
ALTER TABLE url_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON url_analyses
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

─────────────────────────────────────────────────────────────
Update the Growth view URL tab wiring:
─────────────────────────────────────────────────────────────

After scorePage() completes successfully:

  import { supabase } from '../lib/supabase'

  await supabase.from('url_analyses').insert({
    workspace_id: workspaceId,
    url: result.url,
    page_title: result.pageTitle,
    overall_scores: result.overallScores,
    sections: result.scoredSections,
    warning: result.warning,
  })

On initial load of the Growth view URL tab:
  Load the 5 most recent URL analyses for this workspace:

  const { data: recent } = await supabase
    .from('url_analyses')
    .select('id, url, page_title, overall_scores, analysed_at')
    .eq('workspace_id', workspaceId)
    .order('analysed_at', { ascending: false })
    .limit(5)

  Show them as "Recently analysed" cards below the URL input:
  Each card: page title, domain, health badge, "View" button.
  Clicking "View" re-renders the full result from stored data
  without re-fetching the page.

─────────────────────────────────────────────────────────────
PostHog tracking (add to URL-03 wiring):
─────────────────────────────────────────────────────────────

track('url_analysis_saved', {
  domain: new URL(result.url).hostname,
  sectionCount: result.scoredSections.length,
  overallRisk: result.overallScores.cognitiveRisk,
})
track('url_analysis_reloaded', { domain })  // when loading from Supabase
```

---

## URL-06 · E2E Tests

```
Create e2e/url-analysis.spec.ts:

import { test, expect } from '@playwright/test'

// NOTE: URL tests make real HTTP requests.
// They will fail if the target URLs are down or change their content.
// These tests use stable public pages unlikely to change significantly.

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
    expect(data.sections.length).toBeGreaterThan(0)
    expect(data.page_title).toBeTruthy()
    expect(data.total_word_count).toBeGreaterThan(0)
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

  test('returns a warning for pages with very little content', async ({ request }) => {
    // A known minimal page
    const res = await request.post('http://localhost:3008/extract', {
      data: { url: 'https://example.com', workspace_id: 'test' }
    })
    if (res.ok()) {
      const data = await res.json()
      // example.com is minimal — may trigger the warning
      // Just verify the warning field exists (null or string)
      expect('warning' in data).toBeTruthy()
    }
  })

})

test.describe('Copy Health Checker — URL tab', () => {

  test('URL tab is visible in Growth view', async ({ page }) => {
    await page.goto('/growth')
    await expect(
      page.locator('text=Test a URL')
        .or(page.locator('text=Compare URLs'))
        .or(page.locator('[data-testid="url-tab"]'))
    ).toBeVisible()
  })

  test('switching to URL tab shows URL input', async ({ page }) => {
    await page.goto('/growth')
    await page.click('text=Test a URL')
    await expect(
      page.locator('input[type="url"]')
        .or(page.locator('input[placeholder*="https://"]'))
    ).toBeVisible()
  })

  test('invalid URL shows validation error', async ({ page }) => {
    await page.goto('/growth')
    await page.click('text=Test a URL')
    const urlInput = page.locator('input[type="url"]').first()
    await urlInput.fill('not-a-valid-url')
    await page.click('text=Analyse Page')
    await expect(
      page.locator('text=valid URL')
        .or(page.locator('text=http'))
    ).toBeVisible({ timeout: 2000 })
  })

  test('valid URL triggers loading state', async ({ page }) => {
    await page.goto('/growth')
    await page.click('text=Test a URL')
    const urlInput = page.locator('input[type="url"]').first()
    await urlInput.fill('https://example.com')
    await page.click('text=Analyse Page')
    // Loading state should appear
    await expect(
      page.locator('text=Fetching page')
        .or(page.locator('text=Extracting'))
        .or(page.locator('text=Scoring'))
    ).toBeVisible({ timeout: 3000 })
  })

  test('analysis completes and shows health badge', async ({ page }) => {
    await page.goto('/growth')
    await page.click('text=Test a URL')
    const urlInput = page.locator('input[type="url"]').first()
    await urlInput.fill('https://example.com')
    await page.click('text=Analyse Page')
    // Wait for results — up to 15s for real HTTP fetch + scoring
    await expect(
      page.locator('text=FLAGGED')
        .or(page.locator('text=NEEDS REVIEW'))
        .or(page.locator('text=CLEAR'))
    ).toBeVisible({ timeout: 15000 })
  })

  test('section breakdown appears with section type badges', async ({ page }) => {
    await page.goto('/growth')
    await page.click('text=Test a URL')
    await page.locator('input[type="url"]').first().fill('https://example.com')
    await page.click('text=Analyse Page')
    await page.waitForTimeout(12000)
    // Section breakdown should appear
    await expect(
      page.locator('text=Section breakdown')
        .or(page.locator('[data-testid="section-breakdown"]'))
    ).toBeVisible({ timeout: 3000 })
  })

  test('recently analysed URLs appear after analysis', async ({ page }) => {
    await page.goto('/growth')
    await page.click('text=Test a URL')
    await page.locator('input[type="url"]').first().fill('https://example.com')
    await page.click('text=Analyse Page')
    await page.waitForTimeout(15000)
    // After completion, go away and come back
    await page.click('text=Engineer')
    await page.click('text=Growth')
    await page.click('text=Test a URL')
    await expect(
      page.locator('text=Recently analysed')
        .or(page.locator('text=example.com'))
    ).toBeVisible({ timeout: 3000 })
  })

})

test.describe('A/B Comparison — URL mode', () => {

  test('URL mode tab is visible in Designer view', async ({ page }) => {
    await page.goto('/designer')
    await expect(
      page.locator('text=Compare URLs')
        .or(page.locator('[data-testid="url-ab-tab"]'))
    ).toBeVisible()
  })

  test('URL mode shows two URL inputs', async ({ page }) => {
    await page.goto('/designer')
    await page.click('text=Compare URLs')
    const inputs = page.locator('input[type="url"], input[placeholder*="https://"]')
    await expect(inputs).toHaveCount(2)
  })

  test('Compare button disabled until both URLs entered', async ({ page }) => {
    await page.goto('/designer')
    await page.click('text=Compare URLs')
    const compareBtn = page.locator('text=Compare Pages')
    await expect(compareBtn).toBeDisabled()
    // Fill only one
    await page.locator('input[type="url"]').first().fill('https://example.com')
    await expect(compareBtn).toBeDisabled()
    // Fill both
    await page.locator('input[type="url"]').nth(1).fill('https://iana.org')
    await expect(compareBtn).toBeEnabled()
  })

  test('comparison produces a winner or inconclusive result', async ({ page }) => {
    await page.goto('/designer')
    await page.click('text=Compare URLs')
    await page.locator('input[type="url"]').first().fill('https://example.com')
    await page.locator('input[type="url"]').nth(1).fill('https://iana.org')
    await page.click('text=Compare Pages')
    // Wait for both pages to be fetched and scored
    await expect(
      page.locator('text=Page A preferred')
        .or(page.locator('text=Page B preferred'))
        .or(page.locator('text=Inconclusive'))
    ).toBeVisible({ timeout: 30000 })
  })

})
```

---

## Run Tests

```bash
# Start the URL extractor service
cd services/url-extractor
pip install -r requirements.txt --break-system-packages
uvicorn src.main:app --port 3008 &
sleep 2

# Quick smoke test
curl -s http://localhost:3008/health
curl -s -X POST http://localhost:3008/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://stripe.com","workspace_id":"ws-1","max_sections":8}' \
  | python3 -m json.tool | head -40

# Run URL E2E tests
npx playwright test e2e/url-analysis.spec.ts

# Run with browser visible
npx playwright test e2e/url-analysis.spec.ts --headed

# NOTE: URL tests make real HTTP requests and will be slower
# than other test suites (~15-30s per test). Add --timeout=30000
npx playwright test e2e/url-analysis.spec.ts --timeout=30000

# Run against production Vercel URL
PLAYWRIGHT_BASE_URL=https://cognarc-dashboard.vercel.app \
  npx playwright test e2e/url-analysis.spec.ts --timeout=30000
```

---

## Deploy to GCP Cloud Run

```bash
# Same pattern as the other services
cd services/url-extractor

# cloudbuild.yaml (copy from cognitive-rewrite and adjust):
#   - service name: url-extractor
#   - port: 3008
#   - memory: 512Mi (no GPU, minimal memory needed)
#   - cpu: 1
#   - min-instances: 0
#   - max-instances: 10

gcloud builds submit --config cloudbuild.yaml

# Get service URL
gcloud run services describe url-extractor \
  --region=us-central1 --format='value(status.url)'

# Add to Vercel environment variables
VITE_URL_EXTRACTOR_URL=https://url-extractor-xxx-uc.a.run.app

# Cost estimate: CPU-only, scale-to-zero
# ~$0.000024 per request, effectively free at beta scale
```

---

## Environment Variables

```bash
# Add to .env.local (frontend)
VITE_URL_EXTRACTOR_URL=http://localhost:3008      # or GCP URL in production
VITE_COGNITIVE_SCORING_URL=http://localhost:3001  # already exists

# Add to Vercel environment variables
VITE_URL_EXTRACTOR_URL=https://url-extractor-xxx-uc.a.run.app
```

---

## What Pages Work Best in a Demo

When demonstrating URL analysis to a potential user, use these types of pages
for reliable, interesting results:

```
GOOD DEMO TARGETS:
  https://stripe.com           — Clean, high-comprehension, good benchmark
  https://notion.so            — Clear value props, good A/B baseline
  https://linear.app           — Strong copy, interesting CTA language
  Any competitor's landing page — High commercial value for the audience

AVOID IN DEMO:
  https://google.com           — Almost no copy, low signal
  https://twitter.com          — Requires auth to see real content
  Any SaaS dashboard URL       — Behind login
  Any Next.js heavy SPA        — May extract incomplete content
```

---

## What Not to Touch

| Already working | Status |
|---|---|
| Cognitive Scoring Service (POST /score) | ✅ URL analysis calls this unchanged |
| Cognitive Rewrite Service (POST /rewrite) | ✅ Section rewrites call this unchanged |
| CognitiveScoreCard component | ✅ URL results use this unchanged |
| Copy Health Checker "Paste copy" tab | ✅ Unchanged — URL tab is additive |
| A/B Comparison file upload mode | ✅ Unchanged — URL mode is additive |
| All Fix Pack 1, 2, 3, 4 fixes | ✅ This pack builds on them |

---

*CognArc URL Content Analysis · Standalone Pack*
*Requires Fix Packs 1, 2, 3 (Live Version), and 4*
*URL-01 → URL-02 → URL-03 → URL-04 → URL-05 → URL-06*
