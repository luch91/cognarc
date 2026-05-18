"""
CognArc Python SDK client.

Usage:
    from cognarc import CognArcScorer

    scorer = CognArcScorer(api_key="cog_...", workspace_id="ws-1")
    result = scorer.score(output="The LLM output to evaluate")
    print(result.cognitive_risk)   # "LOW" | "MEDIUM" | "HIGH"
    print(result.score)            # 0.0–1.0 composite
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from .models import CognitiveScore, RegressionResult

DEFAULT_BASE_URL = "http://localhost:3002"
TIMEOUT = 15.0


class CognArcError(Exception):
    """Raised when the CognArc API returns an error."""
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class CognArcScorer:
    """
    Synchronous CognArc scorer — primary interface for eval pipelines.

    Args:
        api_key: CognArc API key (or set COGNARC_API_KEY env var).
        workspace_id: Workspace to attribute scores to.
        base_url: Override the default eval-integration service URL.
    """

    def __init__(
        self,
        api_key: str | None = None,
        workspace_id: str = "default",
        base_url: str | None = None,
    ) -> None:
        self._api_key = api_key or os.environ.get("COGNARC_API_KEY", "")
        self._workspace_id = workspace_id
        self._base_url = (base_url or os.environ.get("COGNARC_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            headers=self._build_headers(),
            timeout=TIMEOUT,
        )

    def _build_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    def score(
        self,
        output: str,
        input: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> CognitiveScore:
        """
        Score an LLM output for cognitive properties.

        Args:
            output: The LLM-generated text to evaluate.
            input:  The prompt that produced the output (optional, improves accuracy).
            context: Arbitrary context metadata to include in the request.

        Returns:
            CognitiveScore with all dimensions + 0-1 composite score.

        Raises:
            CognArcError: On API errors.
        """
        payload: dict[str, Any] = {
            "output": output,
            "workspace_id": self._workspace_id,
        }
        if input is not None:
            payload["input"] = input
        if context is not None:
            payload["context"] = context

        try:
            resp = self._client.post("/score", json=payload)
        except httpx.RequestError as e:
            raise CognArcError(f"Network error: {e}") from e

        if not resp.is_success:
            raise CognArcError(f"API error: {resp.text}", status_code=resp.status_code)

        return CognitiveScore.model_validate(resp.json())

    def check_regression(
        self,
        prompt_id: str,
        output: str,
        input: str | None = None,
    ) -> RegressionResult:
        """
        Check whether current output has regressed vs stored baseline.
        Records a new baseline on first call for the given prompt_id.
        """
        payload: dict[str, Any] = {
            "prompt_id": prompt_id,
            "output": output,
            "workspace_id": self._workspace_id,
        }
        if input is not None:
            payload["input"] = input

        try:
            resp = self._client.post("/regression/check", json=payload)
        except httpx.RequestError as e:
            raise CognArcError(f"Network error: {e}") from e

        # 422 = regressed — still parse the body
        if resp.status_code not in (200, 422):
            raise CognArcError(f"API error: {resp.text}", status_code=resp.status_code)

        return RegressionResult.model_validate(resp.json())

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "CognArcScorer":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


class CognArcClient(CognArcScorer):
    """Alias for CognArcScorer — matches the TypeScript SDK naming."""
    pass


# ─── Platform adapter helpers ────────────────────────────────────────────────

def make_braintrust_scorer(
    api_key: str | None = None,
    workspace_id: str = "braintrust",
    base_url: str | None = None,
):
    """
    Returns a Braintrust-compatible scorer function.

    Usage:
        from cognarc import make_braintrust_scorer
        CognArcScore = make_braintrust_scorer(api_key="cog_...")
        Eval("my-eval", scores=[CognArcScore])
    """
    scorer = CognArcScorer(api_key=api_key, workspace_id=workspace_id, base_url=base_url)

    def _scorer(output: str, **_kwargs: Any) -> dict[str, Any]:
        result = scorer.score(output)
        return {
            "name": "cognarc_cognitive",
            "score": result.score,
            "metadata": {
                "cognitive_load": result.cognitive_load,
                "comprehension_confidence": result.comprehension_confidence,
                "trust_coherence": result.trust_coherence,
                "manipulation_risk": result.manipulation_risk,
                "cognitive_risk": result.cognitive_risk,
            },
        }

    _scorer.__name__ = "CognArcScore"
    return _scorer


def make_langfuse_evaluator(
    api_key: str | None = None,
    workspace_id: str = "langfuse",
    base_url: str | None = None,
):
    """
    Returns a callable suitable for use as a Langfuse custom evaluator.

    Usage:
        from cognarc import make_langfuse_evaluator
        evaluator = make_langfuse_evaluator(api_key="cog_...")
        score_value, comment = evaluator(output="LLM response")
    """
    scorer = CognArcScorer(api_key=api_key, workspace_id=workspace_id, base_url=base_url)

    def _evaluator(output: str, **_kwargs: Any) -> tuple[float, str]:
        result = scorer.score(output)
        comment = (
            f"Risk: {result.cognitive_risk} | "
            f"Load: {result.cognitive_load} | "
            f"Comprehension: {result.comprehension_confidence} | "
            f"Trust: {result.trust_coherence} | "
            f"Manipulation: {result.manipulation_risk}"
        )
        return result.score, comment

    return _evaluator
