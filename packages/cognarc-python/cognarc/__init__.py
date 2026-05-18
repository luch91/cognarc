"""CognArc Python SDK — cognitive scoring for AI outputs."""

from .client import CognArcScorer, CognArcClient
from .models import CognitiveScore, RegressionResult

__all__ = ["CognArcScorer", "CognArcClient", "CognitiveScore", "RegressionResult"]
__version__ = "0.1.0"
