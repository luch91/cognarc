"""
TRIBE v2 local inference server.
Uses TribeModel.from_pretrained("facebook/tribev2") — the official API.
Serves predictions on :8080 for text stimulus types.

Requirements:
  pip install -r requirements.txt

Run:
  HF_TOKEN=hf_xxx uvicorn server:app --host 0.0.0.0 --port 8080

See README.md for full setup instructions.
"""

import os
import time
import logging
from contextlib import asynccontextmanager
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from huggingface_hub import login as _hf_login

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tribe-inference")

# Add this script's directory to PATH so the bundled ffmpeg.exe is found by tribev2.
os.environ["PATH"] = os.path.dirname(os.path.abspath(__file__)) + os.pathsep + os.environ.get("PATH", "")

FSAVERAGE5_VERTICES = 20484
MODEL_ID = "facebook/tribev2"

tribe_model = None


def load_model() -> None:
    global tribe_model

    logger.info(f"Loading {MODEL_ID} via TribeModel.from_pretrained()…")
    try:
        from tribev2 import TribeModel  # type: ignore
        import pathlib
        from huggingface_hub import hf_hub_download

        # Use hf_hub_download to resolve the correct cached file paths — this
        # works regardless of snapshot hash or cache location, and respects
        # HF_HUB_OFFLINE=1 (set by Cloud Run env var) for no-network operation.
        local_ckpt_dir = pathlib.Path("./hf_model/facebook_tribev2").resolve()
        local_ckpt_dir.mkdir(parents=True, exist_ok=True)

        config_path = local_ckpt_dir / "config.yaml"
        ckpt_path = local_ckpt_dir / "best.ckpt"

        if not config_path.exists():
            cached = hf_hub_download(repo_id=MODEL_ID, filename="config.yaml")
            import shutil
            shutil.copy(cached, config_path)
            logger.info(f"Copied config.yaml from {cached}")

        if not ckpt_path.exists():
            cached = hf_hub_download(repo_id=MODEL_ID, filename="best.ckpt")
            import shutil
            shutil.copy(cached, ckpt_path)
            logger.info(f"Copied best.ckpt from {cached}")

        tribe_model = TribeModel.from_pretrained(local_ckpt_dir, cache_folder="./cache")
        logger.info("TRIBE v2 loaded successfully")
    except Exception as exc:
        logger.error(f"Failed to load TRIBE v2: {exc}")
        logger.warning("Running in stub mode — synthetic activations will be returned")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    stimulus_type: Literal["text", "image", "audio", "video"]
    content: str
    workspace_id: str


class PredictResponse(BaseModel):
    cortical_activations: list[float]
    model_version: str
    latency_ms: int


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------


def run_inference(req: PredictRequest) -> tuple[list[float], str]:
    if tribe_model is None:
        return _stub_activations(req), "tribe-v2-stub"

    try:
        if req.stimulus_type == "text":
            # Convert text → audio using edge-tts (local, no external API, no rate limits).
            # Then pass the audio file to get_events_dataframe(audio_path=...) which
            # bypasses tribev2's gTTS TextToEvents path entirely.
            import tempfile, pathlib, asyncio, edge_tts  # type: ignore

            with tempfile.NamedTemporaryFile(
                suffix=".mp3", delete=False
            ) as f:
                audio_path = pathlib.Path(f.name)

            communicate = edge_tts.Communicate(req.content, voice="en-US-AriaNeural")
            asyncio.run(communicate.save(str(audio_path)))
            logger.info(f"Generated TTS audio via edge-tts: {audio_path}")

            df = tribe_model.get_events_dataframe(audio_path=str(audio_path))  # type: ignore[union-attr]
            preds, _ = tribe_model.predict(events=df)  # type: ignore[union-attr]
            audio_path.unlink(missing_ok=True)

            # preds shape: (n_timesteps, n_vertices) — take mean over time
            activations = np.mean(preds, axis=0).astype(np.float32)

            if len(activations) != FSAVERAGE5_VERTICES:
                activations = np.interp(
                    np.linspace(0, len(activations) - 1, FSAVERAGE5_VERTICES),
                    np.arange(len(activations)),
                    activations,
                )

            return activations.tolist(), "tribe-v2"
        else:
            logger.warning(f"stimulus_type={req.stimulus_type} — stub activations returned")
            return _stub_activations(req), "tribe-v2-stub"

    except Exception as exc:
        logger.error(f"TRIBE inference error: {exc}")
        return _stub_activations(req), "tribe-v2-stub"


def _stub_activations(req: PredictRequest) -> list[float]:
    """Deterministic synthetic activations — varies with input so scores differ."""
    rng = np.random.default_rng(seed=len(req.content) % 1000)
    base = rng.standard_normal(FSAVERAGE5_VERTICES).astype(np.float32)
    # Amplify prefrontal (dlPFC ~1200-1800) for longer / more complex inputs
    if len(req.content) > 200:
        base[1200:1800] += 1.0
    # Reduce comprehension region (Wernicke's ~3200-3900) for very long inputs
    if len(req.content) > 500:
        base[3200:3900] -= 0.5
    return base.tolist()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    load_model()
    yield


app = FastAPI(title="TRIBE v2 Inference Server", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    status = "ready" if tribe_model is not None else "stub"
    return {"status": status, "model": MODEL_ID}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    start = time.time()
    try:
        activations, model_version = run_inference(req)
    except Exception as exc:
        logger.error(f"Unhandled inference error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return PredictResponse(
        cortical_activations=activations,
        model_version=model_version,
        latency_ms=int((time.time() - start) * 1000),
    )
