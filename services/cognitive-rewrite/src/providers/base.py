from abc import ABC, abstractmethod


class RewriteProvider(ABC):
    """Base class for all LLM providers. Same interface regardless of model."""

    @abstractmethod
    def generate(self, prompt: str, max_tokens: int = 1000) -> str:
        """Generate text from prompt. Returns raw string."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Human-readable model identifier for logging and the model_used field."""
        pass
