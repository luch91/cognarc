# cognitive-rewrite

FastAPI service that rewrites marketing copy and AI prompts to reduce cognitive harm.
Receives TRIBE scores + manipulation taxonomy, generates 3 ranked alternatives via Qwen3 LLMs,
re-scores each alternative via the Cognitive Scoring Service **in parallel** (one TRIBE latency window
for all 3), and returns them sorted best-first.

**Scoring notes:**
- When `COGNITIVE_SCORING_URL` points to a TRIBE-backed service, re-scores use real brain data.
- Re-scoring 3 alternatives takes the same time as 1 TRIBE call (~35s warm, ~160s cold start)
  because all 3 requests are fired in parallel.
- If the scoring service is unreachable, estimated deltas are used as fallback.

## Port

`3006`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| POST | `/rewrite` | Generate 3 cognitive-optimised rewrites |

## Provider Adapter (LLM-C01)

Controlled by `REWRITE_PROVIDER` environment variable:

| `REWRITE_PROVIDER` | Provider | Cost |
|--------------------|----------|------|
| unset (default) | OpenRouter for `long_form`, Groq for everything else | Mixed |
| `groq` | Groq free tier for all copy types | Free — 14,400 req/day |
| `anthropic` | Anthropic Claude for all copy types | Paid |

Switch providers with one env var change. The response shape is identical.

## Model Routing

### Default routing (no `REWRITE_PROVIDER` set)

| Copy Type | Provider | Model | Notes |
|-----------|----------|-------|-------|
| `long_form` | OpenRouter | `qwen/qwen3-235b-a22b` | Largest Qwen3 MoE — best for restructuring |
| `campaign`, `landing_page`, `prompt` | Groq | `qwen/qwen3-32b` | Strong structured JSON |
| `voiceover` | Groq | `llama-3.3-70b-versatile` | Better spoken cadence |
| `microcopy` | Groq | `llama-3.1-8b-instant` | Fastest for short copy |

If `OPENROUTER_API_KEY` is not set, `long_form` falls back to Groq `qwen/qwen3-32b`.

### Force all traffic to Groq (`REWRITE_PROVIDER=groq`)

| Copy Type | Model |
|-----------|-------|
| `campaign`, `landing_page`, `prompt`, `long_form` | `qwen/qwen3-32b` |
| `voiceover` | `llama-3.3-70b-versatile` |
| `microcopy` | `llama-3.1-8b-instant` |

### Anthropic (REWRITE_PROVIDER=anthropic)

| Copy Type | Model |
|-----------|-------|
| `campaign`, `landing_page`, `voiceover`, `prompt` | `claude-sonnet-4-6` |
| `microcopy` | `claude-haiku-4-5-20251001` |
| `long_form` | `claude-opus-4-8` |

**`long_form` in the UI:** The Prompt Regression Monitor "Get Rewrite Suggestions" button
on BLOCK/WARN rows sends `copy_type: "long_form"` with the current prompt text. This is
the only UI path that routes to the long-form model.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REWRITE_PROVIDER` | No | `groq` or `anthropic` — unset = OpenRouter for `long_form`, Groq otherwise |
| `GROQ_API_KEY` | Yes (groq) | Free at console.groq.com |
| `OPENROUTER_API_KEY` | Yes (long_form default) | Free tier at openrouter.ai — routes to `qwen/qwen3-235b-a22b` |
| `ANTHROPIC_API_KEY` | Yes (anthropic) | Only needed when `REWRITE_PROVIDER=anthropic` |
| `COGNITIVE_SCORING_URL` | No | Scoring service URL (default: `http://localhost:3001`) |
| `SCORE_TIMEOUT` | No | Seconds to wait for each TRIBE score call (default: `360`) |

Copy `.env.example` to `.env` and fill in your keys. Never commit `.env`.

## Setup (local)

```bash
cd services/cognitive-rewrite
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Start (loads .env automatically via python-dotenv):
uvicorn src.main:app --reload --port 3006
```

## Health Check

```bash
curl -s http://localhost:3006/health
# {"status":"ok","service":"cognitive-rewrite","provider":"groq"}
```

## Example Rewrite Request

```bash
curl -s -X POST http://localhost:3006/rewrite \
  -H "Content-Type: application/json" \
  -d '{
    "original_text": "ACT NOW! Limited spots left — only 3 people can join this exclusive program today. Trusted by thousands of successful entrepreneurs.",
    "copy_type": "campaign",
    "workspace_id": "ws-demo",
    "scores": {
      "cognitive_load": 72,
      "comprehension_confidence": 48,
      "emotional_valence": 65,
      "trust_coherence": 34,
      "manipulation_risk": 81,
      "cognitive_risk": "HIGH"
    },
    "taxonomy": {
      "false_urgency": 85,
      "social_proof_fabrication": 70,
      "ambiguity_exploitation": 30,
      "authority_mimicry": 45,
      "sycophantic_drift": 10,
      "obfuscation": 15
    }
  }'
```

## Docker

```bash
# From monorepo root:
docker compose up cognitive-rewrite

# Or standalone:
docker build -t cognarc-cognitive-rewrite .
docker run -p 3006:3006 \
  -e GROQ_API_KEY=... \
  cognarc-cognitive-rewrite

# To use Anthropic instead:
docker run -p 3006:3006 \
  -e REWRITE_PROVIDER=anthropic \
  -e ANTHROPIC_API_KEY=... \
  cognarc-cognitive-rewrite
```

## Architecture

```
POST /rewrite
  └─ rewrite_engine.py   → providers/factory.py → OpenRouterProvider (long_form)
                                                 → GroqProvider (campaign/voiceover/microcopy/prompt)
                                                 → AnthropicProvider (when REWRITE_PROVIDER=anthropic)
  └─ scorer.py           → re-scores all 3 in parallel via cognitive-scoring:3001/score
  └─ main.py             → ranks by composite delta, returns RewriteResponse
```

The service falls back to estimated deltas if the Cognitive Scoring Service is unavailable,
so rewrites are always returned — the accuracy of the re-score degrades gracefully.
