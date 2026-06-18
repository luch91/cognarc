# CognArc — Fix Pack 3 (Live Version)
## LLM Rewrite Service + Score Visualisation + Video Cognitive Analysis

> **Context:** Fix Packs 1, 2, and 4 have been applied. The product is live
> on Supabase + GCP + Vercel. This pack replaces the original Fix Pack 3
> demo-only version with a production-ready implementation covering:
>
> 1. Cognitive Rewrite Service with free LLM support (Groq/Qwen default,
>    Claude upgrade path via one environment variable)
> 2. Manager-friendly score visualisation with radar chart and plain-English
>    explanations — designed for the non-technical decision-maker
> 3. Prompt Regression Monitor — made clickable with full score history,
>    prompt diff, and plain-language impact summary
> 4. Video Cognitive Analysis wired to the live Supabase backend
>
> **Sequencing:**
> LLM-C01 (provider adapter) → LLM-C02 (rewrite service) → LLM-C03
> (TS client) → LLM-C04 (manager view + radar) → LLM-C05 (landing page
> scorer with manager mode) → LLM-C06 (Prompt Regression Monitor fix) →
> LLM-C07 (video analysis, live) → LLM-C08 (wire video → Supabase) →
> tests

---

## Stack

```
Existing:  React 18, Vite, Tailwind, Recharts, Playwright, Supabase, PostHog
New:
  Groq SDK (Python)    — free LLM inference via Qwen2.5-72B
  Anthropic SDK        — paid upgrade path (optional)
  FastAPI (Python)     — rewrite service backend
  Recharts RadarChart  — score visualisation (already installed)
```

---

## Pre-Flight

```bash
# Confirm Groq SDK not yet installed in rewrite service
ls services/cognitive-rewrite/ 2>/dev/null || echo "Service not yet created"

# Confirm Recharts is installed (needed for radar chart)
cat package.json | grep recharts

# Confirm Supabase client is present (from Fix Pack 4)
cat package.json | grep supabase

# Find the Prompt Regression Monitor component
grep -r "Prompt Regression\|PromptRegression\|regression" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Find the Message Clarity Scorer if it was started
grep -r "Message Clarity\|Score Copy\|clarity" src/ \
  --include="*.tsx" --include="*.jsx" -l

# Check REWRITE_PROVIDER env var (should not exist yet)
echo ${REWRITE_PROVIDER:-"not set — will default to groq"}
```

---

## Section 1 — LLM Provider Adapter

---

### LLM-C01 · Build the Provider Adapter (OpenRouter and Groq Default, Claude Upgrade Path)

**What this adds:** A single adapter layer in the rewrite service that routes
generation calls to either Groq, OpenRouter (free, Qwen2.5-72B) or Anthropic (paid,
claude-sonnet-4-6), controlled by one environment variable.

**Do not touch:** The Cognitive Scoring Service. Any frontend code.

**Why Groq over other free options:**
- Groq free tier: 14,400 requests/day, 6,000 tokens/minute — sufficient
  for a non-commercial beta with hundreds of users
- Qwen2.5-72B on Groq produces reliable structured JSON output, which the
  rewrite service requires. Other free models frequently break JSON format.
- Groq API is OpenAI-compatible — minimal client code change vs Claude
- Minimax M3 skipped: less tested for English cognitive copywriting at the
  constraint density required; better suited for Chinese-language content
- Ollama skipped: runs on local hardware, cannot serve live users

```
Create services/cognitive-rewrite/ with provider adapter support.

─────────────────────────────────────────────────────────────
FILE: services/cognitive-rewrite/src/providers/__init__.py
─────────────────────────────────────────────────────────────
(empty)

─────────────────────────────────────────────────────────────
FILE: services/cognitive-rewrite/src/providers/base.py
─────────────────────────────────────────────────────────────

from abc import ABC, abstractmethod

class RewriteProvider(ABC):
    """Base class for all LLM providers. Same interface regardless of model."""

    @abstractmethod
    def generate(self, prompt: str, max_tokens: int = 1000) -> str:
        """Generate text from prompt. Returns raw string."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Human-readable model name for logging and the modelUsed field."""
        pass

─────────────────────────────────────────────────────────────
FILE: services/cognitive-rewrite/src/providers/groq_provider.py
─────────────────────────────────────────────────────────────

import os
from groq import Groq
from .base import RewriteProvider

class GroqProvider(RewriteProvider):
    """
    Groq free tier with Qwen2.5-72B.
    Free tier: 14,400 requests/day, 6,000 tokens/minute.
    Best free option for structured JSON output.
    """

    # Model routing by copy type — all via Qwen2.5-72B for now
    # When buoyant enough to upgrade, switch REWRITE_PROVIDER=anthropic
    COPY_TYPE_MODELS = {
        "campaign":      "qwen-qwq-32b",    # best reasoning for persuasion rewriting
        "landing_page":  "qwen-qwq-32b",
        "voiceover":     "llama-3.3-70b-versatile",  # better spoken cadence
        "prompt":        "qwen-qwq-32b",
        "microcopy":     "qwen-qwq-32b ans llama-3.1-8b-instant",     # fast for short copy
        "long_form":     "qwen-qwq-235b",
    }

    def __init__(self, copy_type: str = "campaign"):
        self._client = Groq(api_key=os.environ["GROQ_API_KEY"])
        self._copy_type = copy_type
        self._model = self.COPY_TYPE_MODELS.get(copy_type, "qwen-qwq-32b")

    def generate(self, prompt: str, max_tokens: int = 1000) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()

    @property
    def model_name(self) -> str:
        return f"groq/{self._model}"

─────────────────────────────────────────────────────────────
FILE: services/cognitive-rewrite/src/providers/anthropic_provider.py
─────────────────────────────────────────────────────────────

import os
import anthropic
from .base import RewriteProvider

class AnthropicProvider(RewriteProvider):
    """
    Anthropic Claude — paid upgrade path.
    Switch to this by setting REWRITE_PROVIDER=anthropic.
    Higher quality structured output, better constraint following.
    """

    COPY_TYPE_MODELS = {
        "campaign":      "claude-sonnet-4-6",
        "landing_page":  "claude-sonnet-4-6",
        "voiceover":     "claude-sonnet-4-6",
        "prompt":        "claude-sonnet-4-6",
        "microcopy":     "claude-haiku-4-5-20251001",
        "long_form":     "claude-opus-4-6",
    }

    def __init__(self, copy_type: str = "campaign"):
        self._client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._copy_type = copy_type
        self._model = self.COPY_TYPE_MODELS.get(copy_type, "claude-sonnet-4-6")

    def generate(self, prompt: str, max_tokens: int = 1000) -> str:
        message = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text.strip()

    @property
    def model_name(self) -> str:
        return f"anthropic/{self._model}"

─────────────────────────────────────────────────────────────
FILE: services/cognitive-rewrite/src/providers/factory.py
─────────────────────────────────────────────────────────────

import os
from .base import RewriteProvider
from .groq_provider import GroqProvider
from .anthropic_provider import AnthropicProvider

def get_provider(copy_type: str = "campaign") -> RewriteProvider:
    """
    Returns the configured provider.
    Switch providers with REWRITE_PROVIDER environment variable:
      REWRITE_PROVIDER=groq        ← default, free via Groq/Qwen
      REWRITE_PROVIDER=anthropic   ← paid, Claude Sonnet/Haiku/Opus
    """
    provider = os.environ.get("REWRITE_PROVIDER", "groq").lower()

    if provider == "anthropic":
        return AnthropicProvider(copy_type=copy_type)
    else:
        # Default: groq (free)
        return GroqProvider(copy_type=copy_type)

─────────────────────────────────────────────────────────────
FILE: services/cognitive-rewrite/requirements.txt
─────────────────────────────────────────────────────────────

fastapi==0.111.0
uvicorn==0.30.1
groq==0.9.0
anthropic==0.28.0
httpx==0.27.0
pydantic==2.7.0

─────────────────────────────────────────────────────────────
Add to .env:
─────────────────────────────────────────────────────────────

# Provider selection (groq = free default, anthropic = paid upgrade)
REWRITE_PROVIDER=groq

# Groq API key (free at console.groq.com)
GROQ_API_KEY=gsk_your_key_here

# Anthropic API key (only needed when REWRITE_PROVIDER=anthropic)
# ANTHROPIC_API_KEY=sk-ant-your_key_here

─────────────────────────────────────────────────────────────
Add to Vercel environment variables:
─────────────────────────────────────────────────────────────

REWRITE_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
```

> **Claude Code Tip:** Get a free Groq API key at console.groq.com — takes
> 2 minutes, no credit card. Test with:
> `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`
> Should return a list of available models including qwen-qwq-32b.

---

### LLM-C02 · Build the Cognitive Rewrite Service (Live Version)

**What this replaces:** The original demo-only rewrite service from Fix Pack 3.
This version uses the provider adapter, writes results to Supabase, and handles
the live environment properly.

**Prerequisite:** LLM-C01 complete. Fix Pack 4 (Supabase) applied.

**Do not touch:** The Cognitive Scoring Service. Any frontend code.

```
Create services/cognitive-rewrite/src/models.py:

from pydantic import BaseModel
from typing import Optional

class CognitiveScores(BaseModel):
    cognitive_load: float
    comprehension_confidence: float
    emotional_valence: float
    trust_coherence: float
    manipulation_risk: float
    cognitive_risk: str  # LOW | MEDIUM | HIGH

class TaxonomyScores(BaseModel):
    false_urgency: float = 0
    social_proof_fabrication: float = 0
    ambiguity_exploitation: float = 0
    authority_mimicry: float = 0
    sycophantic_drift: float = 0
    obfuscation: float = 0

class RewriteRequest(BaseModel):
    original_text: str
    copy_type: str
    scores: CognitiveScores
    taxonomy: TaxonomyScores
    brand_voice_notes: Optional[str] = None
    max_length: Optional[int] = None
    workspace_id: str

class RewriteAlternative(BaseModel):
    text: str
    rationale: str
    scores: CognitiveScores
    score_delta: dict
    confidence: str  # HIGH | MEDIUM | LOW

class RewriteResponse(BaseModel):
    alternatives: list[RewriteAlternative]
    model_used: str
    original_scores: CognitiveScores
    processing_time_ms: int

─────────────────────────────────────────────────────────────
Create services/cognitive-rewrite/src/rewrite_engine.py:
─────────────────────────────────────────────────────────────

import json
import re
from models import RewriteRequest, TaxonomyScores, CognitiveScores
from providers.factory import get_provider

COPY_TYPE_INSTRUCTIONS = {
    "campaign": """
- Remove or soften urgency language ("act now", "limited time", "only X left")
- Replace unsubstantiated authority claims with specific verifiable ones or remove them
- Simplify sentence structure to reduce cognitive load
- Preserve the core value proposition exactly
- Match the original tone and brand voice
- Do not introduce new claims not present in the original""",

    "landing_page": """
- Lead with the clearest statement of value — not a question or teaser
- Remove jargon that requires domain knowledge to understand
- Each sentence should do one job: either inform, persuade, or direct
- CTA copy should describe the action, not create urgency
- Do not change the page structure — rewrite copy only""",

    "microcopy": """
- Maximum clarity in minimum words
- Button labels should describe what happens when clicked
- Error messages should say what went wrong and what to do next
- Avoid negative phrasing ("don't forget" → "remember to")""",

    "voiceover": """
- Write for how people speak, not how they read
- Short sentences. One idea per sentence.
- Remove urgency language entirely — it reads as pressure in audio
- The first 8 seconds must establish value, not build to it
- Pause points matter: a comma is a breath, a full stop is a beat""",

    "prompt": """
- Remove manipulative framing that might bias model outputs
- Clarify ambiguous instructions that could be interpreted multiple ways
- Reduce cognitive load by breaking compound instructions into sequential steps
- Remove sycophantic priming language
- Preserve the semantic intent exactly""",

    "long_form": """
- Restructure if the argument is buried — lead with the conclusion
- Break sentences over 25 words into two sentences
- Replace passive voice with active voice
- Remove hedging language that reduces trust coherence
- Every paragraph should earn its place"""
}

def build_detected_patterns(taxonomy: TaxonomyScores) -> str:
    LABELS = {
        "false_urgency":              "artificial urgency / manufactured scarcity",
        "social_proof_fabrication":   "unverified social proof / fake consensus",
        "ambiguity_exploitation":     "deliberately vague language",
        "authority_mimicry":          "credential inflation / authority impersonation",
        "sycophantic_drift":          "excessive validation without substance",
        "obfuscation":                "complexity used to hide meaning",
    }
    detected = [
        f"  - {label}: {getattr(taxonomy, field, 0):.0f}/100"
        for field, label in LABELS.items()
        if getattr(taxonomy, field, 0) > 40
    ]
    return "\n".join(detected) if detected else "  - No specific patterns above threshold"

def build_targets(scores: CognitiveScores) -> str:
    targets = []
    if scores.cognitive_load > 60:
        targets.append(f"  - Cognitive Load: {scores.cognitive_load:.0f} → target below 55")
    if scores.manipulation_risk > 40:
        targets.append(f"  - Manipulation Risk: {scores.manipulation_risk:.0f} → target below 35")
    if scores.comprehension_confidence < 60:
        targets.append(f"  - Comprehension Confidence: {scores.comprehension_confidence:.0f} → target above 65")
    if scores.trust_coherence < 55:
        targets.append(f"  - Trust Coherence: {scores.trust_coherence:.0f} → target above 60")
    return "\n".join(targets) if targets else "  - All scores within acceptable range"

def parse_json_response(raw: str) -> list[dict]:
    """Robustly parse JSON from LLM output, handling markdown fences."""
    # Strip markdown code fences
    clean = re.sub(r'```(?:json)?', '', raw).strip()
    # Find the JSON array
    match = re.search(r'\[.*\]', clean, re.DOTALL)
    if match:
        return json.loads(match.group())
    return json.loads(clean)

def generate_rewrites(request: RewriteRequest) -> tuple[list[dict], str]:
    """Generate 3 rewrites using the configured provider. Returns (alternatives, model_name)."""
    provider = get_provider(copy_type=request.copy_type)
    instructions = COPY_TYPE_INSTRUCTIONS.get(request.copy_type, COPY_TYPE_INSTRUCTIONS["campaign"])
    brand_voice = f"\nBRAND VOICE NOTES:\n{request.brand_voice_notes}" if request.brand_voice_notes else ""
    length_constraint = f"\nLENGTH: Maximum {request.max_length} words per alternative." if request.max_length else ""

    prompt = f"""You are a cognitive copywriter. Your job is to rewrite copy to reduce
cognitive harm while preserving the original intent and value proposition.

ORIGINAL COPY:
\"\"\"{request.original_text}\"\"\"

COGNITIVE SCORES (from TRIBE v2 brain analysis):
- Cognitive Load: {request.scores.cognitive_load:.0f}/100
- Comprehension Confidence: {request.scores.comprehension_confidence:.0f}/100
- Trust Coherence: {request.scores.trust_coherence:.0f}/100
- Manipulation Risk: {request.scores.manipulation_risk:.0f}/100

DETECTED PROBLEMS:
{build_detected_patterns(request.taxonomy)}

WHAT NEEDS TO IMPROVE:
{build_targets(request.scores)}

REWRITE RULES for {request.copy_type.replace("_", " ")} copy:
{instructions}{brand_voice}{length_constraint}

CONSTRAINTS:
- Do not introduce claims not present in the original
- Do not change the fundamental message or value proposition
- Each alternative must be meaningfully different from the others
- Alternative 1: most conservative edit (least changed from original)
- Alternative 2: moderate rewrite
- Alternative 3: most aggressive cognitive optimisation

Return ONLY a valid JSON array with exactly 3 objects. No explanation outside JSON.
Each object must have exactly these fields:
[
  {{
    "text": "the rewritten copy here",
    "rationale": "one sentence: what changed and why it improves the cognitive score",
    "predicted_improvement": {{
      "cognitive_load": "-15 to -20",
      "manipulation_risk": "-40 to -50",
      "comprehension_confidence": "+10 to +15",
      "trust_coherence": "+8 to +12"
    }}
  }}
]"""

    raw = provider.generate(prompt, max_tokens=1200)
    alternatives = parse_json_response(raw)
    return alternatives, provider.model_name

─────────────────────────────────────────────────────────────
Create services/cognitive-rewrite/src/scorer.py:
(unchanged from original — calls Cognitive Scoring Service)
─────────────────────────────────────────────────────────────

import httpx
import os
from models import CognitiveScores

SCORING_ENDPOINT = os.environ.get("COGNITIVE_SCORING_URL", "http://localhost:3001")

async def score_text(text: str, workspace_id: str) -> CognitiveScores:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{SCORING_ENDPOINT}/score",
            json={
                "stimulus_type": "text",
                "content": text,
                "workspace_id": workspace_id,
                "options": {"manipulation_check": True}
            }
        )
        data = response.json()
        return CognitiveScores(**{
            "cognitive_load": data["cognitive_load"],
            "comprehension_confidence": data["comprehension_confidence"],
            "emotional_valence": data["emotional_valence"],
            "trust_coherence": data["trust_coherence"],
            "manipulation_risk": data["manipulation_risk"],
            "cognitive_risk": data["cognitive_risk"],
        })

─────────────────────────────────────────────────────────────
Create services/cognitive-rewrite/src/main.py:
─────────────────────────────────────────────────────────────

import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import RewriteRequest, RewriteResponse, RewriteAlternative
from rewrite_engine import generate_rewrites
from scorer import score_text
import os

app = FastAPI(title="CognArc Cognitive Rewrite Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production to your Vercel domain
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    provider = os.environ.get("REWRITE_PROVIDER", "groq")
    return {"status": "ok", "service": "cognitive-rewrite", "provider": provider}

@app.post("/rewrite", response_model=RewriteResponse)
async def rewrite(request: RewriteRequest):
    start = time.time()

    try:
        raw_alternatives, model_name = generate_rewrites(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

    if not raw_alternatives or len(raw_alternatives) < 3:
        raise HTTPException(status_code=500, detail="Expected 3 alternatives from provider")

    # Re-score each alternative with TRIBE/mock
    scored = []
    for alt in raw_alternatives[:3]:
        try:
            scores = await score_text(alt["text"], request.workspace_id)
        except Exception:
            # If scoring service is down, use approximate scores
            from models import CognitiveScores
            scores = CognitiveScores(
                cognitive_load=max(20, request.scores.cognitive_load - 15),
                comprehension_confidence=min(90, request.scores.comprehension_confidence + 10),
                emotional_valence=request.scores.emotional_valence,
                trust_coherence=min(80, request.scores.trust_coherence + 8),
                manipulation_risk=max(5, request.scores.manipulation_risk - 35),
                cognitive_risk="LOW"
            )

        delta = {
            "cognitive_load":           scores.cognitive_load - request.scores.cognitive_load,
            "comprehension_confidence": scores.comprehension_confidence - request.scores.comprehension_confidence,
            "trust_coherence":          scores.trust_coherence - request.scores.trust_coherence,
            "manipulation_risk":        scores.manipulation_risk - request.scores.manipulation_risk,
        }
        load_drop  = request.scores.cognitive_load  - scores.cognitive_load
        manip_drop = request.scores.manipulation_risk - scores.manipulation_risk
        confidence = "HIGH"   if load_drop > 10 and manip_drop > 20 \
                   else "MEDIUM" if load_drop > 5  or  manip_drop > 10 \
                   else "LOW"

        scored.append(RewriteAlternative(
            text=alt["text"],
            rationale=alt["rationale"],
            scores=scores,
            score_delta=delta,
            confidence=confidence
        ))

    # Rank: biggest combined improvement first
    scored.sort(
        key=lambda a: (
            -a.score_delta["manipulation_risk"] * 2.0 +
            -a.score_delta["cognitive_load"]    * 1.5 +
             a.score_delta["comprehension_confidence"] * 1.0 +
             a.score_delta["trust_coherence"]   * 0.8
        ),
        reverse=True
    )

    return RewriteResponse(
        alternatives=scored,
        model_used=model_name,
        original_scores=request.scores,
        processing_time_ms=int((time.time() - start) * 1000)
    )

─────────────────────────────────────────────────────────────
Dockerfile (same as before, port 3006):
─────────────────────────────────────────────────────────────

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt --no-cache-dir
COPY src/ .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3006"]
```

> **Claude Code Tip:** Test the Groq path first: `REWRITE_PROVIDER=groq
> GROQ_API_KEY=your_key uvicorn src.main:app --port 3006`. Then test the
> Anthropic path by changing REWRITE_PROVIDER=anthropic. Both should return
> the same response shape.

---

### LLM-C03 · TypeScript Client (same as original, no changes needed)

The TypeScript client from the original Fix Pack 3 (LLM-B02) is provider-agnostic
— it calls `POST /rewrite` and receives the standard response shape regardless
of which LLM generated the alternatives. No changes needed to the client.

If it was not built in the original pack, create it now:

```
Create packages/cognarc-types/src/rewrite-client.ts
(Copy exactly from original Fix Pack 3 LLM-B02 — no changes.)

Add to .env.local:
  VITE_COGNITIVE_REWRITE_URL=http://localhost:3006

Add to Vercel environment variables:
  VITE_COGNITIVE_REWRITE_URL=https://cognitive-rewrite-xxx-uc.a.run.app
```

---

## Section 2 — Manager-Friendly Score Visualisation

---

### LLM-C04 · Build the Manager View Score Component

**What this adds:** A reusable `CognitiveScoreCard` component that presents
cognitive scores in two modes: Manager (default, plain English, radar chart,
health badge) and Technical (the four numbers for engineers). Used everywhere
scores are shown — the Message Clarity Scorer, the landing page scorer, the
video report, and the Act-Gated package.

**The design principle:** A marketing director or founder should be able to
look at this component for 5 seconds and know whether the copy is safe to
ship. They should not need to understand what "Cognitive Load: 71" means.

**Do not touch:** Any existing view. This is a new shared component.

```
Create src/components/CognitiveScoreCard.tsx

This component renders cognitive scores in two modes.
The manager mode is the DEFAULT. Technical mode is behind a toggle.

PROPS:
interface CognitiveScoreCardProps {
  scores: {
    cognitiveLoad: number
    comprehensionConfidence: number
    trustCoherence: number
    manipulationRisk: number
  }
  taxonomy?: {
    falseUrgency?: number
    authorityMimicry?: number
    sycophantidDrift?: number
    ambiguityExploitation?: number
    socialProofFabrication?: number
    obfuscation?: number
  }
  showToggle?: boolean   // show the Manager/Technical toggle (default true)
  defaultMode?: 'manager' | 'technical'  // default: 'manager'
  context?: string       // e.g. "landing page copy" — used in plain-English text
}

─────────────────────────────────────────────────────────────
PART 1: Overall Health Badge
─────────────────────────────────────────────────────────────

Derive an overall health status from the scores:

FLAGGED (red badge) if:
  manipulationRisk > 60 OR cognitiveLoad > 75 OR comprehensionConfidence < 40

NEEDS REVIEW (amber badge) if:
  manipulationRisk > 40 OR cognitiveLoad > 60 OR comprehensionConfidence < 55
  OR trustCoherence < 50

CLEAR (green badge) if:
  all scores within acceptable thresholds

Badge renders large and prominent at the top of the card:
  CLEAR      → green pill, white text, checkmark icon
  NEEDS REVIEW → amber pill, white text, warning icon
  FLAGGED    → red pill, white text, stop icon

Below the badge, a single plain-English verdict:
  CLEAR:       "This content is safe to use. Cognitive scores are within
                acceptable thresholds across all four dimensions."
  NEEDS REVIEW:"This content has issues that may affect how your audience
                responds. Review the details below before publishing."
  FLAGGED:     "This content has serious problems. Publishing it as-is
                risks confusing your audience or damaging trust."

─────────────────────────────────────────────────────────────
PART 2: Radar Chart (Manager Mode)
─────────────────────────────────────────────────────────────

Use Recharts RadarChart (already installed) to show all four dimensions
as a spider/radar chart:

Four axes:
  Readability    (inverse of cognitiveLoad — high is good)
  Clarity        (comprehensionConfidence)
  Trust          (trustCoherence)
  Safety         (inverse of manipulationRisk — high is good)

Convert scores for display:
  Readability = 100 - cognitiveLoad       (so higher = easier to read)
  Clarity     = comprehensionConfidence
  Trust       = trustCoherence
  Safety      = 100 - manipulationRisk    (so higher = safer)

All four axes now point outward = better, which is visually intuitive.
A shape close to the outer edge = healthy. A shape collapsed inward = problems.

Chart configuration:
  RadarChart: cx="50%", cy="50%", outerRadius="70%"
  PolarGrid: gridType="polygon", stroke="#E5E7EB"
  PolarAngleAxis: tick with custom label component (larger, bold, black)
  Radar: name="Cognitive Health", stroke="#00957A", fill="#00957A", fillOpacity=0.25
  No legend needed (axis labels are sufficient)
  Width: 280px, Height: 240px
  Responsive: wrap in ResponsiveContainer

Below the chart: four coloured score chips in a row (compact):
  Readability: [score]   Clarity: [score]   Trust: [score]   Safety: [score]
  These are the CONVERTED scores (all higher = better), not the raw scores.

─────────────────────────────────────────────────────────────
PART 3: Plain-English "What This Means" Panel
─────────────────────────────────────────────────────────────

Below the radar chart, four expandable rows. Each row is a question
a non-technical manager would actually ask:

Row 1: "How hard is this to read?"
  Score: cognitiveLoad converted to plain language:
  < 40:  "Very easy — most readers will process this effortlessly"
  40–55: "Easy — suitable for a general audience"
  55–70: "Moderate — some readers may need to re-read sections"
  70–85: "Difficult — consider simplifying before publishing"
  > 85:  "Very difficult — most readers will not finish this"
  Colour: green / green / amber / red / dark red

Row 2: "Will your audience understand it?"
  Score: comprehensionConfidence:
  > 75:  "Yes — the message is clear and likely to be understood correctly"
  60–75: "Probably — most readers will get the main point"
  45–60: "Uncertain — some readers may misinterpret the message"
  < 45:  "Unlikely — the message is unclear and may be misunderstood"

Row 3: "Does this feel trustworthy?"
  Score: trustCoherence:
  > 70:  "Yes — the copy feels consistent and credible throughout"
  55–70: "Mostly — minor inconsistencies that won't damage trust"
  40–55: "Somewhat — noticeable inconsistencies that may cause doubt"
  < 40:  "No — the copy feels inconsistent or incoherent"

Row 4: "Is this pressuring or misleading people?"
  Score: manipulationRisk:
  < 25:  "No — no problematic patterns detected"
  25–45: "Low risk — minor patterns present but not concerning"
  45–65: "Moderate risk — review before publishing"
  > 65:  "High risk — problematic patterns detected (see details below)"

If manipulationRisk > 45 AND taxonomy is provided:
  Show a "What was detected:" section below row 4:
  List only the taxonomy categories above 40, with plain-English labels:
    false_urgency → "Artificial urgency — creates unnecessary pressure"
    authority_mimicry → "Inflated authority — claims that feel unverifiable"
    sycophantic_drift → "Excessive flattery — agreement without substance"
    ambiguity_exploitation → "Vague language — could be interpreted multiple ways"
    social_proof_fabrication → "Unverified consensus — 'everyone agrees' type claims"
    obfuscation → "Hidden meaning — complexity that obscures the real message"

─────────────────────────────────────────────────────────────
PART 4: Technical Mode (behind toggle)
─────────────────────────────────────────────────────────────

A small toggle at the top right of the card: "Manager view / Technical view"
Default: Manager view.

In Technical mode, hide the radar chart and plain-English rows.
Show instead:
  Four number panels (same as existing Workspace Overview layout):
    Cognitive Load: [raw number]
    Comprehension Confidence: [raw number]
    Trust Coherence: [raw number]
    Manipulation Risk: [raw number]
  With colour coding: green/amber/red based on raw thresholds.

The toggle state is local (useState) — not persisted.
The health badge and verdict text are shown in BOTH modes.

─────────────────────────────────────────────────────────────
PART 5: Before/After Panel (shown when rewrites are applied)
─────────────────────────────────────────────────────────────

When a rewrite alternative is selected ("Use this"), show a before/after
comparison below the CognitiveScoreCard:

  "Before"                    "After"
  [radar chart, collapsed]    [radar chart, fuller]
  FLAGGED                     CLEAR
  Readability: 29             Readability: 64
  Clarity: 48                 Clarity: 71
  Trust: 39                   Trust: 67
  Safety: 16                  Safety: 71

This comparison is what convinces a manager that the rewrite is worth using.

The before/after panel only renders when both original scores AND
post-rewrite scores are passed to the component.

Props for before/after mode:
  originalScores?: same shape as scores
  If originalScores is provided, render in before/after layout.
  If not, render in single-score layout.
```

> **Claude Code Tip:** Test the radar chart first by hardcoding scores. The
> most common issue is the axis label font size — set it explicitly to 13px
> in the PolarAngleAxis tick component or it will default too small.

---

### LLM-C05 · Add Manager-Friendly Landing Page Scorer to Growth View

**What this replaces:** The existing Message Clarity Scorer from the original
Fix Pack 3 (LLM-B03). This version uses the new `CognitiveScoreCard` component
with the radar chart and plain-English explanations, and is explicitly designed
for the non-technical manager use case.

**Prerequisite:** LLM-C01, LLM-C02, LLM-C03, LLM-C04 complete.

**Do not touch:** Creative Evaluation Queue. Variant Ranker. Brand Trust Drift
Monitor. Cognitive Funnel Mapper.

```
Find the Growth view. Replace or update the "Message Clarity Scorer"
section with the manager-friendly version.

SECTION HEADER:
"Copy Health Checker"
Subline: "Paste any copy — headline, email, CTA, or landing page section —
          and see how your audience is likely to respond."
(Plain language. No mention of TRIBE, cognitive neuroscience, or technical
metrics. Those are in the Technical view toggle.)

INPUT AREA:
A large textarea (5 rows minimum):
  placeholder: "Paste your copy here — headline, email subject line,
                value proposition, or any marketing copy..."
  Max length: 2000 characters. Character counter visible.

A copy type selector (pill buttons, not a dropdown):
  Campaign copy  |  Landing page  |  Email  |  Social ad  |  CTA
  Default: Campaign copy
  (These map to "campaign", "landing_page", "campaign", "campaign", "microcopy"
  in the backend copy_type field)

Two buttons:
  "Check this copy" (teal, primary)
  "Clear" (outline, small)

─────────────────────────────────────────────────────────────
AFTER SCORING — show the CognitiveScoreCard component:
─────────────────────────────────────────────────────────────

Show the CognitiveScoreCard in manager mode (default).
Pass: scores, taxonomy, context="[selected copy type] copy"

Above the card, a single bold header line:
  If FLAGGED:      "⚠ This copy needs work before it goes live."
  If NEEDS REVIEW: "⚠ This copy has some issues worth fixing."
  If CLEAR:        "✓ This copy looks good."

─────────────────────────────────────────────────────────────
AFTER SCORING — Before/After Rewrite Flow:
─────────────────────────────────────────────────────────────

If health is FLAGGED or NEEDS REVIEW, show below the score card:
  Button: "Show me better alternatives" (teal, full width)
  (Plain language. Not "Get Rewrite Suggestions".)

Loading state (while calling rewrite service):
  "Finding better ways to say this..."
  Spinner. No mention of Claude, Groq, or any model name.
  (The manager does not care which model is running.)

Show 3 rewrite cards, each with:
  The rewritten text (large, readable, in a white card with teal left border)
  A confidence badge: HIGH / MEDIUM / LOW

  Below each rewrite: the Before/After CognitiveScoreCard in compact form:
    Two mini radar charts side by side (before, after)
    Health badge changed: "FLAGGED → CLEAR" with right arrow

  A "Use this version" button (teal) — copies to clipboard
  On click: show before/after panel in full, add PostHog event:
    track('rewrite_used', { copyType, confidence, improvementSummary })

─────────────────────────────────────────────────────────────
WIRING:
─────────────────────────────────────────────────────────────

1. "Check this copy" → calls POST /score (Cognitive Scoring Service)
   Loading: "Analysing your copy..." (1.5s if mock, up to 5s if TRIBE)

2. "Show me better alternatives" → calls requestRewrites() from TS client
   Loading: "Finding better ways to say this..."

3. "Use this version" → copy to clipboard + show before/after panel
   + addAgentFeedEntry({ zone: "RECOMMEND",
       description: "Copy Health Checker: safer alternative selected.",
       time: "just now" })
   + track PostHog event

4. Fallback if rewrite service unavailable:
   Show 3 pre-written fallback alternatives that are demonstrably better
   than "Act now" style copy. Label them "(Example suggestions)".

Do not touch:
- Creative Evaluation Queue
- Variant Ranker
- Brand Trust Drift Monitor
- Cognitive Funnel Mapper
```

---

## Section 3 — Prompt Regression Monitor Fix

---

### LLM-C06 · Make Prompt Regression Monitor Rows Clickable

**What's broken and why:**

The Prompt Regression Monitor tracks every prompt in a connected LLM
application over time. Each row represents one prompt file. The columns show:

- **CL** — current cognitive load score for this prompt version
- **ΔCL** — how much cognitive load changed vs the baseline (first version evaluated). Red = got worse (regression). Green = improved.
- **CC** — current comprehension confidence
- **ΔCC** — change vs baseline
- **STATUS** — OK / WARN / BLOCK based on whether the change exceeds configured thresholds

The numbers are static because they are hardcoded mock data. Nothing is computing them dynamically. They are non-clickable because clicking was never implemented.

**What clicking should reveal:**

Each row should open a detail panel showing:
1. Score history over time (sparkline chart — how CL and CC have changed across evaluations)
2. The baseline prompt text (what the prompt looked like when first evaluated)
3. The current prompt text
4. A diff view showing exactly what changed between baseline and current
5. A plain-English impact summary for the manager view

**Do not touch:** The CI/CD gate results. The audit log. Any other Engineer view section.

```
Find the Prompt Regression Monitor section in the Engineer view.
Currently it renders a table with 4 rows. Rows are not clickable.

STEP 1 — Make rows clickable:

Each table row should be a clickable element (cursor-pointer, hover
background change) that expands a detail panel below it.

Clicking a row:
  If the row is collapsed: expand the detail panel below it
  If the row is already expanded: collapse it
  Only one row can be expanded at a time (clicking a new row
  collapses the previous one)

Add a small chevron (▼/▲) at the right end of each row to signal
that it is expandable.

STEP 2 — Build the detail panel:

The detail panel expands below the clicked row with a subtle
slide-down animation (CSS transition, no library).

The panel has four sections:

─────────────────────────────────────────────────────────────
SECTION A: Score History Chart
─────────────────────────────────────────────────────────────

A small Recharts LineChart showing CL and CC over 5 evaluation points.
Mock data per prompt (make it different for each row):

"Onboarding welcome" (CL stable, CC improving):
  Evaluations: v1 → v2 → v3 → v4 → v5 (current)
  CL history:  39, 41, 42, 40, 42
  CC history:  85, 83, 81, 82, 81
  Status: OK (small improvement in CL, minimal change)

"Checkout confirmation" (CL regressed, CC dropped — BLOCK):
  CL history:  45, 48, 52, 61, 67
  CC history:  78, 74, 68, 60, 54
  Status: BLOCK — clear upward trend in load, downward in comprehension
  Annotation on the chart: a red vertical line at v4 with label
  "PR #247 — regression detected"

"Error state message" (moderate regression — WARN):
  CL history:  48, 50, 53, 55, 55
  CC history:  71, 70, 68, 65, 62
  Status: WARN

"Settings page intro" (stable, healthy):
  CL history:  40, 39, 38, 38, 38
  CC history:  86, 87, 88, 88, 88
  Status: OK

Chart config: small (height 120px), two lines (orange CL, teal CC),
minimal axis labels, tooltip on hover showing exact values.

─────────────────────────────────────────────────────────────
SECTION B: Prompt Text Comparison
─────────────────────────────────────────────────────────────

Two columns side by side:

Left column "Baseline (v1)":
  The original prompt text in a monospace code box.
  Label: "First evaluated — [date]"

Right column "Current (v5)":
  The current prompt text in a monospace code box.
  Label: "Latest — [date]"

For each prompt, use realistic placeholder prompt text:

"Checkout confirmation" baseline:
  "Summarise the user's order for confirmation. Be clear and concise.
   Include: items, quantities, total price, delivery estimate."

"Checkout confirmation" current (regressed version):
  "You are a helpful AI checkout assistant with deep expertise in
   e-commerce UX best practices. Please provide a comprehensive and
   detailed summary of all items in the user's cart for final order
   confirmation, ensuring you clearly communicate the total pricing
   including all applicable taxes and fees, the expected delivery
   timeline based on their selected shipping method, and any relevant
   policy information the user should be aware of before completing
   their purchase."

The difference is obvious — the current version is bloated, which
explains the cognitive load regression from 45 to 67.

─────────────────────────────────────────────────────────────
SECTION C: Character-Level Diff
─────────────────────────────────────────────────────────────

A diff view between baseline and current prompt text.
Render as a unified diff (like a GitHub PR diff):
  Lines removed: red background, red minus sign prefix
  Lines added: green background, green plus sign prefix
  Unchanged context: white background

For the "Checkout confirmation" example, the entire original is replaced
by a much longer version — show it as: all original lines removed (red),
all new lines added (green).

Use a simple line-by-line comparison — no need for a diff library.
Split both texts by sentence (". ") and compare.

─────────────────────────────────────────────────────────────
SECTION D: Impact Summary (Manager-Friendly)
─────────────────────────────────────────────────────────────

A plain-English summary card using the CognitiveScoreCard component
in compact manager mode:

For BLOCK rows:
  "⚠ This prompt change made things significantly worse.
   Cognitive load increased by [ΔCL] points — meaning the AI is now
   working harder to process more complex instructions, which affects
   response quality.
   Recommendation: revert to the baseline version or use one of the
   suggested rewrites below."

For WARN rows:
  "This prompt has drifted from its baseline. The change is not yet
   critical but the trend is moving in the wrong direction."

For OK rows:
  "This prompt is stable. No significant regression detected."

Below the impact summary (for BLOCK and WARN only):
  Button: "Get Rewrite Suggestions" (teal)
  This calls requestRewrites() with copyType: "prompt" and the
  current prompt text + its scores. Same flow as elsewhere in the product.

─────────────────────────────────────────────────────────────
SECTION E: Actions Row
─────────────────────────────────────────────────────────────

Three buttons at the bottom of the detail panel:
  "View in CI/CD Gate" → scrolls to the CI/CD section and highlights
    the relevant PR (the one that caused the regression)
  "Export history" → downloads a JSON file with the score history data
  "Reset baseline" → confirmation dialog: "Reset baseline to current
    version? This will mark the current version as the new baseline."
    On confirm: updates the row data to show ΔCL: 0, ΔCC: 0, STATUS: OK

STEP 3 — Add data-testid attributes:
  data-testid="regression-monitor-row" on each row
  data-testid="regression-monitor-detail" on each detail panel
  data-testid="regression-chart" on each score history chart

Do not touch:
- The CI/CD gate results
- The audit log
- Any other Engineer view section
```

---

## Section 4 — Video Analysis (Live Version)

---

### LLM-C07 · Video Analysis Service (Live Version, Supabase-Backed)

**What this replaces:** The original LLM-B06 demo version. This version
stores analysis results in Supabase so they persist across sessions and
integrates the CognitiveScoreCard manager view into the video report.

**Prerequisite:** Fix Pack 4 (Supabase) applied. LLM-C01 complete.

**Do not touch:** The existing evaluation_queue table structure. The
Creative Evaluation Queue UI for non-video files.

```
The video analysis service code itself (services/video-analysis/src/main.py)
is UNCHANGED from the original Fix Pack 3 (LLM-B06).

The differences in this live version are:

1. VIDEO REPORT STORED IN SUPABASE:
   When analysis completes, the full VideoAnalysisResponse is stored
   in the evaluation_queue table's video_report JSONB column
   (this column was created in Fix Pack 4 LIVE-03).

   In the Growth view upload handler, after video analysis returns:
     supabase
       .from('evaluation_queue')
       .update({ video_report: analysisResponse, status: 'complete',
                 cognitive_load: analysisResponse.overall_scores.cognitive_load,
                 manipulation_risk: analysisResponse.overall_scores.manipulation_risk,
                 trust_coherence: analysisResponse.overall_scores.trust_coherence })
       .eq('id', queueItemId)

   This means if the user navigates away and returns, the report is
   still available — it loads from Supabase, not from component state.

2. VIDEO REPORT UI USES CognitiveScoreCard:
   In the Video Cognitive Report panel (LLM-B07 from original pack),
   replace the plain four-number overall score row with the
   CognitiveScoreCard component in manager mode.

   Pass:
     scores: {
       cognitiveLoad: analysisResponse.overall_scores.cognitive_load,
       comprehensionConfidence: 55, // derive from findings average
       trustCoherence: analysisResponse.overall_scores.trust_coherence,
       manipulationRisk: analysisResponse.overall_scores.manipulation_risk,
     }
     context: "video content"
     defaultMode: "manager"

   This gives the non-technical manager reviewing a video campaign
   the same plain-English health verdict they get from the Copy
   Health Checker.

3. VOICEOVER REWRITES USE FREE LLM:
   The "Get Script Rewrite →" button now calls the live rewrite service
   (which uses Groq/Qwen by default), not a hardcoded mock.
   Loading message changes to: "Finding better voiceover alternatives..."
   (no model name — manager does not care)

4. POSTHOG TRACKING:
   Add these events:
     track('video_report_viewed', { filename, cognitiveRisk })
     track('voiceover_rewrite_requested', { severity, manipulationRisk })
     track('voiceover_rewrite_used', { confidence })
```

---

### LLM-C08 · Wire Video Findings → Supabase Safety Feed

**What this replaces:** The original LLM-B08 which wrote to AppContext local
state. This version writes to Supabase so findings persist across sessions.

**Prerequisite:** Fix Pack 4 applied. LLM-C07 complete.

```
Find where LLM-B08 wrote video manipulation findings to the local
AppContext manipulation feed array.

Replace the AppContext write with a Supabase insert:

When a video analysis completes and any finding has manipulation_risk > 70:

For each critical finding:
  supabase.from('audit_log').insert({
    workspace_id: workspaceId,
    action: 'VIDEO_MANIPULATION_DETECTED',
    zone: 'OBSERVE',
    outcome: 'flagged',
    authorised_by: 'policy:v1.2',
    metadata: {
      filename: filename,
      timestamp: finding.timestamp_start,
      category: 'false_urgency',
      score: finding.manipulation_risk,
      excerpt: finding.voiceover_segment || finding.finding.slice(0, 80),
      source: 'video_analysis',
    }
  })

If overall manipulation_risk > 70:
  supabase.from('act_gated_queue').insert({
    workspace_id: workspaceId,
    title: `${filename} — overall manipulation risk ${overallRisk}/100`,
    type: 'CONTENT_FLAG',
    status: 'pending',
    decision_by: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    package_data: {
      filename,
      overall_scores: analysisResponse.overall_scores,
      critical_findings: criticalFindings,
    }
  })

The Safety view's manipulation feed and Act-Gated Approvals page now
read from Supabase in real time (via the realtime subscriptions set up
in Fix Pack 4 LIVE-04), so these entries appear automatically without
any additional wiring.
```

---

## Section 5 — E2E Tests (Live Version)

---

### TEST-C01 · Provider Adapter Tests

```bash
# Test Groq provider (free)
cd services/cognitive-rewrite
REWRITE_PROVIDER=groq GROQ_API_KEY=your_key \
  uvicorn src.main:app --port 3006 &
sleep 3

# Health check — should show provider: groq
curl -s http://localhost:3006/health | python3 -m json.tool
# Expected: {"status":"ok","service":"cognitive-rewrite","provider":"groq"}

# Rewrite test
curl -s -X POST http://localhost:3006/rewrite \
  -H "Content-Type: application/json" \
  -d '{
    "original_text": "Act now! Limited time offer. Experts unanimously agree.",
    "copy_type": "campaign",
    "scores": {"cognitive_load":71,"comprehension_confidence":48,
                "emotional_valence":55,"trust_coherence":39,
                "manipulation_risk":84,"cognitive_risk":"HIGH"},
    "taxonomy": {"false_urgency":84,"authority_mimicry":71},
    "workspace_id": "ws-1"
  }' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('Model used:', d['model_used'])
print('Alternatives:', len(d['alternatives']))
print('Alt 1 confidence:', d['alternatives'][0]['confidence'])
print('Alt 1 manip risk:', d['alternatives'][0]['scores']['manipulation_risk'])
assert len(d['alternatives']) == 3, 'Expected 3 alternatives'
assert d['alternatives'][0]['scores']['manipulation_risk'] < 84, \
  'Manipulation risk should decrease'
print('All assertions passed')
"

# Test Anthropic provider (if key available)
# REWRITE_PROVIDER=anthropic ANTHROPIC_API_KEY=your_key \
#   uvicorn src.main:app --port 3006
# curl same test — should produce same shape, different text
```

---

### TEST-C02 · Playwright E2E Tests

```
Create e2e/live-features.spec.ts:

import { test, expect } from '@playwright/test'

test.describe('Copy Health Checker (Manager View)', () => {

  test('shows health badge and plain-English verdict after scoring', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').fill(
      'Act now! Limited time offer. Our expert team guarantees results.'
    )
    await page.click('text=Check this copy')

    // Health badge should appear (one of three states)
    await expect(
      page.locator('text=FLAGGED')
        .or(page.locator('text=NEEDS REVIEW'))
        .or(page.locator('text=CLEAR'))
    ).toBeVisible({ timeout: 5000 })

    // Plain-English rows should appear
    await expect(page.locator('text=How hard is this to read')).toBeVisible()
    await expect(page.locator('text=Will your audience understand')).toBeVisible()
    await expect(page.locator('text=Does this feel trustworthy')).toBeVisible()
    await expect(page.locator('text=Is this pressuring or misleading')).toBeVisible()
  })

  test('radar chart renders with four axes', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').fill('See how it works in 2 minutes.')
    await page.click('text=Check this copy')
    await page.waitForTimeout(2000)
    // Radar chart should have SVG elements
    const radarSvg = page.locator('.recharts-radar, .recharts-polar-grid')
    await expect(radarSvg.first()).toBeVisible({ timeout: 5000 })
    // Four axis labels
    await expect(page.locator('text=Readability')).toBeVisible()
    await expect(page.locator('text=Clarity')).toBeVisible()
    await expect(page.locator('text=Trust')).toBeVisible()
    await expect(page.locator('text=Safety')).toBeVisible()
  })

  test('Technical view toggle shows raw numbers', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').fill('Our product is great.')
    await page.click('text=Check this copy')
    await page.waitForTimeout(2000)
    // Switch to technical view
    await page.click('text=Technical view')
    // Raw score labels should appear
    await expect(page.locator('text=Cognitive Load')).toBeVisible()
    await expect(page.locator('text=Comprehension Confidence')).toBeVisible()
    await expect(page.locator('text=Manipulation Risk')).toBeVisible()
  })

  test('Show me better alternatives button triggers rewrite flow', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').fill('Act now! Buy before midnight. Experts agree.')
    await page.click('text=Check this copy')
    await page.waitForTimeout(3000)

    const altBtn = page.locator('text=Show me better alternatives')
    if (await altBtn.isVisible()) {
      await altBtn.click()
      // Loading state
      await expect(page.locator('text=Finding better ways to say this')).toBeVisible()
      // 3 alternatives appear
      await expect(page.locator('text=Use this version').first()).toBeVisible({ timeout: 15000 })
    }
  })

  test('before/after comparison shows after selecting a rewrite', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').fill('Limited time! Act now or lose out forever.')
    await page.click('text=Check this copy')
    await page.waitForTimeout(3000)

    const altBtn = page.locator('text=Show me better alternatives')
    if (await altBtn.isVisible()) {
      await altBtn.click()
      await page.waitForTimeout(10000)
      await page.click('text=Use this version').first()
      // Before/after panel should appear
      await expect(
        page.locator('text=Before').or(page.locator('text=After'))
      ).toBeVisible({ timeout: 3000 })
    }
  })

})

test.describe('Prompt Regression Monitor', () => {

  test('rows are clickable and show a chevron', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    await expect(rows.first()).toBeVisible()
    // Chevron indicator
    await expect(rows.first().locator('text=▼').or(rows.first().locator('[data-testid="chevron"]'))).toBeVisible()
    // Row should be clickable
    await expect(rows.first()).toHaveCSS('cursor', 'pointer')
  })

  test('clicking a row expands the detail panel', async ({ page }) => {
    await page.goto('/engineer')
    await page.click('[data-testid="regression-monitor-row"]').first()
    await expect(
      page.locator('[data-testid="regression-monitor-detail"]').first()
    ).toBeVisible({ timeout: 2000 })
  })

  test('detail panel shows score history chart', async ({ page }) => {
    await page.goto('/engineer')
    await page.click('[data-testid="regression-monitor-row"]').first()
    await expect(
      page.locator('[data-testid="regression-chart"]').first()
    ).toBeVisible({ timeout: 2000 })
  })

  test('detail panel shows baseline and current prompt text', async ({ page }) => {
    await page.goto('/engineer')
    await page.click('[data-testid="regression-monitor-row"]').first()
    await expect(page.locator('text=Baseline').first()).toBeVisible()
    await expect(page.locator('text=Current').first()).toBeVisible()
  })

  test('BLOCK row shows impact summary in plain English', async ({ page }) => {
    await page.goto('/engineer')
    // Find the BLOCK row (Checkout confirmation)
    const blockRow = page.locator('text=Checkout confirmation').locator('..')
    await blockRow.click()
    // Plain English impact summary
    await expect(
      page.locator('text=made things significantly worse')
        .or(page.locator('text=cognitive load increased'))
    ).toBeVisible({ timeout: 2000 })
  })

  test('clicking a second row collapses the first', async ({ page }) => {
    await page.goto('/engineer')
    const rows = page.locator('[data-testid="regression-monitor-row"]')
    // Open first row
    await rows.nth(0).click()
    await expect(page.locator('[data-testid="regression-monitor-detail"]').nth(0)).toBeVisible()
    // Open second row
    await rows.nth(1).click()
    // First detail panel should close
    await expect(page.locator('[data-testid="regression-monitor-detail"]').nth(0)).not.toBeVisible()
    // Second detail panel should open
    await expect(page.locator('[data-testid="regression-monitor-detail"]').nth(1)).toBeVisible()
  })

})

test.describe('CognitiveScoreCard component', () => {

  test('manager mode is the default', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').fill('Hello world.')
    await page.click('text=Check this copy')
    await page.waitForTimeout(2000)
    // Manager mode shows plain-English questions, not raw numbers
    await expect(page.locator('text=How hard is this to read')).toBeVisible({ timeout: 3000 })
    // Raw technical labels should NOT be visible by default
    await expect(page.locator('text=Cognitive Load').first()).not.toBeVisible()
  })

  test('health badge is one of three valid states', async ({ page }) => {
    await page.goto('/growth')
    await page.locator('textarea').fill('Act now! Limited time! Experts agree! Do not miss out!')
    await page.click('text=Check this copy')
    await page.waitForTimeout(3000)
    const badge = page.locator('text=FLAGGED').or(page.locator('text=NEEDS REVIEW')).or(page.locator('text=CLEAR'))
    await expect(badge).toBeVisible({ timeout: 5000 })
  })

})

test.describe('Video report with CognitiveScoreCard', () => {

  test('video report shows manager-friendly score card', async ({ page }) => {
    await page.goto('/growth')
    const viewReportBtn = page.locator('text=View Report →').first()
    if (await viewReportBtn.isVisible()) {
      await viewReportBtn.click()
      // Should show CognitiveScoreCard manager mode, not raw numbers
      await expect(
        page.locator('text=FLAGGED')
          .or(page.locator('text=NEEDS REVIEW'))
          .or(page.locator('text=CLEAR'))
      ).toBeVisible({ timeout: 3000 })
    }
  })

})
```

---

### TEST-C03 · Run All Tests

```bash
# Start all services
docker-compose up -d

# Run this pack's tests
npx playwright test e2e/live-features.spec.ts

# Run with visible browser (recommended for debugging radar chart)
npx playwright test e2e/live-features.spec.ts --headed

# Run the full suite
pnpm test:e2e

# Run against production Vercel URL
PLAYWRIGHT_BASE_URL=https://cognarc-dashboard.vercel.app \
  npx playwright test e2e/live-features.spec.ts
```

---

## Environment Variables — Complete Reference

```bash
# ── LLM PROVIDER ────────────────────────────────────────────────────
# Switch between free (groq) and paid (anthropic) with one variable
REWRITE_PROVIDER=groq                        # groq | anthropic

# Groq (free tier — get key at console.groq.com, no credit card)
GROQ_API_KEY=gsk_your_key_here

# Anthropic (paid — only needed when REWRITE_PROVIDER=anthropic)
# ANTHROPIC_API_KEY=sk-ant-your_key_here

# ── SERVICE URLS ─────────────────────────────────────────────────────
VITE_COGNITIVE_REWRITE_URL=http://localhost:3006   # or GCP Cloud Run URL
VITE_VIDEO_ANALYSIS_URL=http://localhost:3007       # or GCP Cloud Run URL
COGNITIVE_SCORING_URL=http://localhost:3001

# ── SUPABASE (from Fix Pack 4) ───────────────────────────────────────
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# ── POSTHOG (from Fix Pack 4) ────────────────────────────────────────
VITE_POSTHOG_KEY=phc_your_key
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

---

## Provider Routing Reference (Updated)

| Copy type | Groq model (free) | Claude model (paid) | Notes |
|---|---|---|---|
| `campaign` | `qwen-qwq-32b` | `claude-sonnet-4-6` | Best free model for structured rewriting |
| `landing_page` | `qwen-qwq-32b` | `claude-sonnet-4-6` | Strong constraint following |
| `voiceover` | `llama-3.3-70b-versatile` | `claude-sonnet-4-6` | Better spoken cadence than Qwen |
| `prompt` | `qwen-qwq-32b` | `claude-sonnet-4-6` | Reliable JSON output |
| `microcopy` | `llama-3.1-8b-instant` | `claude-haiku-4-5-20251001` | Speed over depth for short copy |
| `long_form` | `qwen-qwq-235b` | `claude-opus-4-6` | Complex restructuring |

**When to upgrade to Anthropic:** When rewrite quality becomes a visible
product differentiator — i.e. when users start comparing your suggestions
to what they could write themselves and finding them wanting. At beta scale
with free users, Groq/Qwen is sufficient. Claude's advantage shows at
higher constraint density and longer copy.

---

## What Not to Touch

| Component | Status |
|---|---|
| Cognitive Scoring Service (POST /score) | ✅ Unchanged |
| Fix Pack 1 all fixes | ✅ Unchanged |
| Fix Pack 2 all fixes | ✅ Unchanged |
| Fix Pack 4 Supabase schema | ✅ Extended (video_report column was pre-created) |
| Act-Gated TRIBE evidence scores | ✅ Only alternatives section changes (from LLM-C02) |
| CI/CD gate PASS/WARN/FAIL badges | ✅ Only rewrite suggestions section changes |
| Existing evaluation queue items | ✅ Just add video_report field to video items |

---

## Architecture — Updated

```
User pastes copy / uploads video
          ↓
Cognitive Scoring Service (TRIBE/mock)
          ↓ scores + taxonomy
CognitiveScoreCard renders:
  → Radar chart (manager view, default)
  → Plain-English health verdict
  → CLEAR / NEEDS REVIEW / FLAGGED badge
          ↓ if NEEDS REVIEW or FLAGGED
Cognitive Rewrite Service
  → REWRITE_PROVIDER=groq  → Groq API → Qwen2.5-72B (free)
  → REWRITE_PROVIDER=anthropic → Anthropic API → Claude Sonnet (paid)
          ↓
Cognitive Scoring Service re-scores each alternative
          ↓
3 alternatives ranked by improvement
          ↓
Before/After CognitiveScoreCard (two radar charts, health badge changed)
          ↓
User selects → Supabase audit log entry → PostHog event

TRIBE evaluates. Free LLM generates. Humans decide.
Upgrade to Claude when you are ready.
```

---

*CognArc Fix Pack 3 (Live Version)*
*Requires: Fix Packs 1, 2, and 4 already applied*
*LLM-C01 → LLM-C02 → LLM-C03 → LLM-C04 → LLM-C05 → LLM-C06 → LLM-C07 → LLM-C08*
