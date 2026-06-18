import asyncio
import httpx
import os
from .models import CognitiveScores

SCORING_ENDPOINT = os.environ.get("COGNITIVE_SCORING_URL", "http://localhost:3001")

# Match the cognitive-scoring service's own GCP timeout.
# TRIBE cold starts take ~160s; warm requests ~35s.
# We run all 3 re-score calls in parallel, so total wait ≈ one TRIBE call.
SCORE_TIMEOUT = float(os.environ.get("SCORE_TIMEOUT", "360"))


async def _score_one(client: httpx.AsyncClient, text: str, workspace_id: str) -> CognitiveScores:
    response = await client.post(
        f"{SCORING_ENDPOINT}/score",
        json={
            "stimulus_type": "text",
            "content": text,
            "workspace_id": workspace_id,
            "options": {"manipulation_check": True},
        },
    )
    response.raise_for_status()
    data = response.json()
    return CognitiveScores(
        cognitive_load=data["cognitive_load"],
        comprehension_confidence=data["comprehension_confidence"],
        emotional_valence=data.get("emotional_valence", 50.0),
        trust_coherence=data["trust_coherence"],
        manipulation_risk=data["manipulation_risk"],
        cognitive_risk=data["cognitive_risk"],
    )


async def score_text(text: str, workspace_id: str) -> CognitiveScores:
    async with httpx.AsyncClient(timeout=SCORE_TIMEOUT) as client:
        return await _score_one(client, text, workspace_id)


async def score_texts_parallel(texts: list[str], workspace_id: str) -> list[CognitiveScores | Exception]:
    """Score multiple texts in parallel using a single shared HTTP client."""
    async with httpx.AsyncClient(timeout=SCORE_TIMEOUT) as client:
        tasks = [_score_one(client, t, workspace_id) for t in texts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return list(results)
