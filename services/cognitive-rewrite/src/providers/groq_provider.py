import os
from groq import Groq
from .base import RewriteProvider

# Model routing on Groq. qwen/qwen3-32b replaced qwen-qwq-32b (decommissioned June 2025).
# llama-3.3-70b-versatile is better for spoken/voiceover cadence.
# llama-3.1-8b-instant is fastest for short microcopy.
_COPY_TYPE_MODELS: dict[str, str] = {
    "campaign":     "qwen/qwen3-32b",
    "landing_page": "qwen/qwen3-32b",
    "voiceover":    "llama-3.3-70b-versatile",
    "prompt":       "qwen/qwen3-32b",
    "microcopy":    "llama-3.1-8b-instant",
    "long_form":    "qwen/qwen3-32b",
}


class GroqProvider(RewriteProvider):
    """
    Groq free tier — 14,400 req/day, 6,000 tok/min.
    Default provider. No credit card required.
    """

    def __init__(self, copy_type: str = "campaign"):
        self._client = Groq(api_key=os.environ["GROQ_API_KEY"])
        self._copy_type = copy_type
        self._model = _COPY_TYPE_MODELS.get(copy_type, "qwen/qwen3-32b")

    def generate(self, prompt: str, max_tokens: int = 2000) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.7,
        )
        raw = (response.choices[0].message.content or "").strip()

        # qwen-qwq-32b on Groq embeds reasoning in <think>…</think> tags inline.
        # Strip the block before JSON parsing.
        if "<think>" in raw:
            end = raw.rfind("</think>")
            if end != -1:
                raw = raw[end + len("</think>"):].strip()
            else:
                raise ValueError("LLM response truncated inside <think> block. Increase max_tokens.")

        return raw

    @property
    def model_name(self) -> str:
        return f"groq/{self._model}"
