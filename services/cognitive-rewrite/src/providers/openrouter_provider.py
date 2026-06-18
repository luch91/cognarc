import os
from openai import OpenAI
from .base import RewriteProvider

_COPY_TYPE_MODELS: dict[str, str] = {
    "long_form": "qwen/qwen3-235b-a22b",
}

_DEFAULT_MODEL = "qwen/qwen3-235b-a22b"


class OpenRouterProvider(RewriteProvider):
    """
    OpenRouter — used for long_form copy type only.
    Routes to qwen/qwen3-235b-a22b (largest Qwen3 MoE, best for restructuring).
    Falls back to Groq if OPENROUTER_API_KEY is not set.
    """

    def __init__(self, copy_type: str = "long_form"):
        self._client = OpenAI(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://cognarc.ai",
                "X-Title": "CognArc",
            },
        )
        self._model = _COPY_TYPE_MODELS.get(copy_type, _DEFAULT_MODEL)

    def generate(self, prompt: str, max_tokens: int = 2000) -> str:
        # Qwen3-235b on OpenRouter supports thinking control — disable for structured JSON.
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            extra_body={"thinking": {"type": "disabled"}},
        )
        raw = (response.choices[0].message.content or "").strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return raw.strip()

    @property
    def model_name(self) -> str:
        return f"openrouter/{self._model}"
