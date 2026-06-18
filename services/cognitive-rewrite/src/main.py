import os
import time
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import RewriteRequest, RewriteResponse, RewriteAlternative, CognitiveScores
from .rewrite_engine import generate_rewrites
from .scorer import score_texts_parallel

app = FastAPI(title="CognArc Cognitive Rewrite Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://cognarc-dashboard.vercel.app"],
    allow_methods=["*"],
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
        raw_alternatives, model_used = generate_rewrites(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM generation failed: {str(e)}")

    if len(raw_alternatives) != 3:
        raise HTTPException(status_code=500, detail=f"Expected 3 alternatives, got {len(raw_alternatives)}")

    # Re-score all 3 alternatives in parallel — one TRIBE call's latency instead of three.
    texts = [alt["text"] for alt in raw_alternatives]
    score_results = await score_texts_parallel(texts, request.workspace_id)

    scored = []
    for alt, result in zip(raw_alternatives, score_results):
        if isinstance(result, Exception):
            # Scoring service unavailable — use estimated deltas from original scores
            scores = CognitiveScores(
                cognitive_load=max(0, request.scores.cognitive_load - 15),
                comprehension_confidence=min(100, request.scores.comprehension_confidence + 10),
                emotional_valence=request.scores.emotional_valence,
                trust_coherence=min(100, request.scores.trust_coherence + 8),
                manipulation_risk=max(0, request.scores.manipulation_risk - 30),
                cognitive_risk="LOW" if request.scores.manipulation_risk > 40 else request.scores.cognitive_risk,
            )
        else:
            scores = result

        delta = {
            "cognitive_load":           scores.cognitive_load - request.scores.cognitive_load,
            "comprehension_confidence": scores.comprehension_confidence - request.scores.comprehension_confidence,
            "trust_coherence":          scores.trust_coherence - request.scores.trust_coherence,
            "manipulation_risk":        scores.manipulation_risk - request.scores.manipulation_risk,
        }

        load_drop  = request.scores.cognitive_load   - scores.cognitive_load
        manip_drop = request.scores.manipulation_risk - scores.manipulation_risk
        confidence = (
            "HIGH"   if (load_drop > 10 and manip_drop > 20) else
            "MEDIUM" if (load_drop > 5  or  manip_drop > 10) else
            "LOW"
        )

        scored.append(RewriteAlternative(
            text=alt["text"],
            rationale=alt["rationale"],
            scores=scores,
            score_delta=delta,
            confidence=confidence,
        ))

    # Rank: biggest combined improvement first
    scored.sort(
        key=lambda a: (
            -a.score_delta["manipulation_risk"] * 2.0
            - a.score_delta["cognitive_load"]    * 1.5
            + a.score_delta["comprehension_confidence"] * 1.0
            + a.score_delta["trust_coherence"]   * 0.8
        ),
        reverse=True,
    )

    return RewriteResponse(
        alternatives=scored,
        model_used=model_used,
        original_scores=request.scores,
        processing_time_ms=int((time.time() - start) * 1000),
    )
