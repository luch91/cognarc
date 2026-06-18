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
    copy_type: str  # "campaign" | "landing_page" | "microcopy" | "voiceover" | "prompt" | "long_form"
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
    alternatives: list[RewriteAlternative]  # always 3, ranked best first
    model_used: str
    original_scores: CognitiveScores
    processing_time_ms: int
