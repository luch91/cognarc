import os
import anthropic
from .base import RewriteProvider

_COPY_TYPE_MODELS: dict[str, str] = {
    "campaign":     "claude-sonnet-4-6",
    "landing_page": "claude-sonnet-4-6",
    "voiceover":    "claude-sonnet-4-6",
    "prompt":       "claude-sonnet-4-6",
    "microcopy":    "claude-haiku-4-5-20251001",
    "long_form":    "claude-opus-4-8",
}


class AnthropicProvider(RewriteProvider):
    """
    Anthropic Claude — paid upgrade path.
    Set REWRITE_PROVIDER=anthropic to activate.
    Higher quality structured output and better constraint following than Groq/Qwen.
    """

    def __init__(self, copy_type: str = "campaign"):
        self._client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._copy_type = copy_type
        self._model = _COPY_TYPE_MODELS.get(copy_type, "claude-sonnet-4-6")

    def generate(self, prompt: str, max_tokens: int = 2000) -> str:
        message = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()

    @property
    def model_name(self) -> str:
        return f"anthropic/{self._model}"
