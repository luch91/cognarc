from fastapi import FastAPI
from pydantic import BaseModel
import hashlib

app = FastAPI(title="CognArc Video Analysis Service")


class VideoAnalysisRequest(BaseModel):
    filename: str
    file_size_bytes: int = 0
    duration_estimate_seconds: int = 30
    workspace_id: str = "ws-1"


class MomentFinding(BaseModel):
    timestamp_start: int
    timestamp_end: int
    component: str
    severity: str  # "critical" | "warning" | "ok"
    finding: str
    recommendation: str
    cognitive_load: float
    manipulation_risk: float
    trust_coherence: float
    attention_engagement: float
    voiceover_segment: str | None = None


class VideoAnalysisResponse(BaseModel):
    filename: str
    duration_seconds: int
    analysis_mode: str
    overall_cognitive_load: float
    overall_manipulation_risk: float
    overall_trust_coherence: float
    overall_attention_engagement: float
    cognitive_risk: str  # "LOW" | "MEDIUM" | "HIGH"
    moment_findings: list[MomentFinding]
    rewrite_candidates: list[str]
    recommended_actions: list[str]


def _seed(filename: str) -> int:
    return int(hashlib.md5(filename.encode()).hexdigest(), 16) % 1000


@app.get("/health")
def health():
    return {"status": "ok", "service": "video-analysis", "mode": "mock"}


@app.post("/analyze", response_model=VideoAnalysisResponse)
def analyze(request: VideoAnalysisRequest) -> VideoAnalysisResponse:
    s = _seed(request.filename)

    # Deterministic scores that vary meaningfully per filename
    base_load = 40 + (s % 45)
    base_manip = 30 + (s % 55)
    base_trust = 80 - (s % 40)
    base_attn = 50 + (s % 35)

    duration = request.duration_estimate_seconds

    findings: list[MomentFinding] = [
        MomentFinding(
            timestamp_start=0,
            timestamp_end=int(duration * 0.25),
            component="Opening Hook",
            severity="warning" if base_load > 60 else "ok",
            finding="Cognitive load spikes in first 8 seconds due to rapid scene cuts and dense text overlay.",
            recommendation="Slow the opening sequence and limit on-screen text to one claim per scene.",
            cognitive_load=min(100, base_load + 10),
            manipulation_risk=base_manip * 0.6,
            trust_coherence=base_trust,
            attention_engagement=min(100, base_attn + 15),
        ),
        MomentFinding(
            timestamp_start=int(duration * 0.25),
            timestamp_end=int(duration * 0.50),
            component="Voiceover",
            severity="critical" if base_manip > 60 else "warning",
            finding="Voiceover uses urgency language ('limited time', 'act now') that correlates with elevated manipulation risk.",
            recommendation="Replace urgency language with benefit-led copy focused on outcome, not scarcity.",
            cognitive_load=base_load * 0.9,
            manipulation_risk=min(100, base_manip + 15),
            trust_coherence=base_trust * 0.85,
            attention_engagement=base_attn,
            voiceover_segment="Act now — only a limited number of spots remain. Don't miss this exclusive opportunity.",
        ),
        MomentFinding(
            timestamp_start=int(duration * 0.50),
            timestamp_end=int(duration * 0.62),
            component="Scene Transition",
            severity="warning",
            finding="Trust coherence drops 12 points at the mid-roll scene transition. Visual discontinuity breaks narrative flow.",
            recommendation="Use a visual bridge or consistent motion graphic to maintain narrative continuity.",
            cognitive_load=min(100, base_load + 5),
            manipulation_risk=base_manip * 0.7,
            trust_coherence=max(0, base_trust - 12),
            attention_engagement=max(0, base_attn - 8),
        ),
        MomentFinding(
            timestamp_start=int(duration * 0.62),
            timestamp_end=int(duration * 0.82),
            component="Product Demo",
            severity="warning",
            finding="Attention engagement dips during product demo — no clear focal point. Users disengage from feature walkthrough.",
            recommendation="Add motion arrows or zoom-in effects to guide attention to key interface elements.",
            cognitive_load=base_load * 0.95,
            manipulation_risk=base_manip * 0.5,
            trust_coherence=base_trust,
            attention_engagement=max(0, base_attn - 15),
        ),
        MomentFinding(
            timestamp_start=int(duration * 0.82),
            timestamp_end=duration,
            component="CTA",
            severity="critical" if base_manip > 55 else "warning",
            finding="CTA overlay contains scarcity framing that triggers manipulation detection.",
            recommendation="Replace countdown timer with social proof (user count, ratings) to build trust without pressure.",
            cognitive_load=base_load * 0.8,
            manipulation_risk=min(100, base_manip + 10),
            trust_coherence=base_trust * 0.9,
            attention_engagement=min(100, base_attn + 20),
        ),
    ]

    # Averages across all findings
    overall_load = round(sum(f.cognitive_load for f in findings) / len(findings), 1)
    overall_manip = round(sum(f.manipulation_risk for f in findings) / len(findings), 1)
    overall_trust = round(sum(f.trust_coherence for f in findings) / len(findings), 1)
    overall_attn = round(sum(f.attention_engagement for f in findings) / len(findings), 1)

    if overall_load > 70 or overall_manip > 65:
        risk = "HIGH"
    elif overall_load > 50 or overall_manip > 40:
        risk = "MEDIUM"
    else:
        risk = "LOW"

    # Voiceover segments from findings that have one
    rewrite_candidates = [
        f.voiceover_segment
        for f in findings
        if f.voiceover_segment and f.manipulation_risk > 50
    ]

    return VideoAnalysisResponse(
        filename=request.filename,
        duration_seconds=duration,
        analysis_mode="mock",
        overall_cognitive_load=overall_load,
        overall_manipulation_risk=overall_manip,
        overall_trust_coherence=overall_trust,
        overall_attention_engagement=overall_attn,
        cognitive_risk=risk,
        moment_findings=findings,
        rewrite_candidates=rewrite_candidates,
        recommended_actions=[
            "Rewrite the voiceover urgency language (see rewrite suggestions above)",
            "Add a focal point guide to the product demo sequence",
            "Align the scene transition visual to the benefit message",
        ],
    )
