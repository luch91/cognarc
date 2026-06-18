import os
from .base import RewriteProvider
from .groq_provider import GroqProvider
from .anthropic_provider import AnthropicProvider
from .openrouter_provider import OpenRouterProvider

# copy types that route to OpenRouter when key is available
_OPENROUTER_COPY_TYPES = {"long_form"}


def get_provider(copy_type: str = "campaign") -> RewriteProvider:
    """
    Returns the configured provider for a given copy type.

    Routing logic:
      REWRITE_PROVIDER=anthropic  → AnthropicProvider for all copy types
      REWRITE_PROVIDER=groq       → GroqProvider for all copy types
      (default / unset)           → OpenRouterProvider for long_form (if key present),
                                    GroqProvider for everything else

    To force Groq for long_form (e.g. OpenRouter key not available):
      REWRITE_PROVIDER=groq
    """
    provider_override = os.environ.get("REWRITE_PROVIDER", "").lower()

    if provider_override == "anthropic":
        return AnthropicProvider(copy_type=copy_type)

    if provider_override == "groq":
        return GroqProvider(copy_type=copy_type)

    # Default: OpenRouter for long_form, Groq for everything else
    if copy_type in _OPENROUTER_COPY_TYPES:
        openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
        if openrouter_key:
            return OpenRouterProvider(copy_type=copy_type)
        # Fallback: OPENROUTER_API_KEY not set — use Groq
        return GroqProvider(copy_type=copy_type)

    return GroqProvider(copy_type=copy_type)
