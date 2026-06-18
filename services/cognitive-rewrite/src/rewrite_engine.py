import json
import re
from .models import RewriteRequest, TaxonomyScores, CognitiveScores
from .providers.factory import get_provider

COPY_TYPE_INSTRUCTIONS: dict[str, str] = {
    "campaign": """
- Remove or soften urgency language ("act now", "limited time", "only X left")
- Replace unsubstantiated authority claims with specific, verifiable ones or remove them
- Simplify sentence structure to reduce cognitive load
- Preserve the core value proposition exactly
- Match the original tone and brand voice
- Do not introduce new claims not present in the original""",

    "landing_page": """
- Lead with the clearest statement of value — not a question or teaser
- Remove jargon that requires domain knowledge to understand
- Each sentence should do one job: either inform, persuade, or direct
- CTA copy should describe the action, not create urgency ("See how it works" not "Act now")
- Do not change the page structure or section order — rewrite copy only""",

    "microcopy": """
- Maximum clarity in minimum words
- Button labels should describe what happens when clicked
- Error messages should say what went wrong and what to do next
- Placeholder text should give an example, not state the obvious
- Avoid negative phrasing ("don't forget" → "remember to")""",

    "voiceover": """
- Write for how people speak, not how they read
- Short sentences. One idea per sentence.
- Remove urgency language entirely — it reads as pressure in audio
- The first 8 seconds must establish value, not build to it
- Pause points matter: a comma is a breath, a full stop is a beat""",

    "prompt": """
- Remove manipulative framing that might cause the model to produce biased outputs
- Clarify ambiguous instructions that could be interpreted multiple ways
- Reduce cognitive load by breaking compound instructions into sequential steps
- Remove sycophantic priming ("You are an expert..." type language)
- Preserve the semantic intent of the original prompt exactly""",

    "long_form": """
- Restructure if the argument is buried — lead with the conclusion
- Break sentences over 25 words into two sentences
- Replace passive voice with active voice throughout
- Remove hedging language that reduces trust coherence
- Every paragraph should earn its place — remove filler""",
}


def _build_detected_patterns(taxonomy: TaxonomyScores) -> str:
    LABELS = {
        "false_urgency":            "artificial urgency / manufactured scarcity",
        "social_proof_fabrication": "unverified social proof / fake consensus",
        "ambiguity_exploitation":   "deliberately vague language",
        "authority_mimicry":        "credential inflation / authority impersonation",
        "sycophantic_drift":        "excessive validation without substance",
        "obfuscation":              "complexity used to hide meaning",
    }
    detected = [
        f"  - {label}: {getattr(taxonomy, field, 0):.0f}/100"
        for field, label in LABELS.items()
        if getattr(taxonomy, field, 0) > 40
    ]
    return "\n".join(detected) if detected else "  - No specific patterns above threshold"


def _build_targets(scores: CognitiveScores) -> str:
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


def generate_rewrites(request: RewriteRequest) -> tuple[list[dict], str]:
    """
    Generate 3 rewrite alternatives using the configured provider.
    Returns (alternatives, model_name).
    Provider is selected by REWRITE_PROVIDER env var (default: groq).
    """
    provider = get_provider(copy_type=request.copy_type)
    instructions = COPY_TYPE_INSTRUCTIONS.get(request.copy_type, COPY_TYPE_INSTRUCTIONS["campaign"])
    brand_voice = f"\nBRAND VOICE NOTES:\n{request.brand_voice_notes}" if request.brand_voice_notes else ""
    length_constraint = f"\nLENGTH: Maximum {request.max_length} words per alternative." if request.max_length else ""

    prompt = f"""You are the cognitive copywriter for CognArc, an AI evaluation platform.
Your job is to rewrite copy to reduce cognitive harm while preserving intent.

ORIGINAL COPY:
\"\"\"{request.original_text}\"\"\"

TRIBE COGNITIVE SCORES:
- Cognitive Load: {request.scores.cognitive_load:.0f}/100
- Comprehension Confidence: {request.scores.comprehension_confidence:.0f}/100
- Trust Coherence: {request.scores.trust_coherence:.0f}/100
- Manipulation Risk: {request.scores.manipulation_risk:.0f}/100

DETECTED MANIPULATION PATTERNS:
{_build_detected_patterns(request.taxonomy)}

IMPROVEMENT TARGETS:
{_build_targets(request.scores)}

REWRITE INSTRUCTIONS for {request.copy_type.replace("_", " ")} copy:
{instructions}{brand_voice}{length_constraint}

ADDITIONAL RULES:
- Do not introduce claims not present in the original
- Do not change the fundamental message or value proposition
- Each alternative must be meaningfully different from the others
- Alternative 1: most conservative edit (least changed from original)
- Alternative 2: moderate rewrite
- Alternative 3: most aggressive cognitive optimisation

Return ONLY a valid JSON array with exactly 3 objects. No preamble. No text outside JSON.
Each object must have exactly these fields:
[
  {{
    "text": "the rewritten copy",
    "rationale": "one sentence: what changed and why it improves the cognitive score",
    "predicted_improvement": {{
      "cognitive_load": "-15 to -20 points",
      "manipulation_risk": "-40 to -50 points",
      "comprehension_confidence": "+10 to +15 points",
      "trust_coherence": "+8 to +12 points"
    }}
  }}
]"""

    raw = provider.generate(prompt, max_tokens=2000)

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    if not raw:
        raise ValueError("Provider returned empty response.")

    return json.loads(raw), provider.model_name


def model_name_for(copy_type: str) -> str:
    """Returns the model identifier that will be used for a given copy_type."""
    return get_provider(copy_type=copy_type).model_name
