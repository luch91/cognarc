from typing import Literal
from pydantic import BaseModel


class CognitiveScore(BaseModel):
    cognitive_load: int
    comprehension_confidence: int
    emotional_valence: int
    trust_coherence: int
    manipulation_risk: int
    cognitive_risk: Literal["LOW", "MEDIUM", "HIGH"]
    explanation: str
    score: float                # 0–1 composite
    reasoning: str              # alias for explanation
    metadata: dict


class RegressionResult(BaseModel):
    prompt_id: str
    regressed: bool
    load_delta: int
    comprehension_delta: int
    reason: str | None
    current: dict
    baseline: dict
