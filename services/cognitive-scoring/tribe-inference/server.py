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

    # Set offline mode so huggingface_hub skips all network calls — files are
    # already in the local HF cache from the initial download.
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

    logger.info(f"Loading {MODEL_ID} via TribeModel.from_pretrained()…")
    try:
        from tribev2 import TribeModel  # type: ignore
        import pathlib, shutil

        # tribev2's from_pretrained does Path(checkpoint_dir) which converts
        # "facebook/tribev2" → "facebook\tribev2" on Windows, breaking the HF
        # repo ID. Use the local HF cache snapshot directly instead.
        HF_CACHE = pathlib.Path.home() / ".cache/huggingface/hub"
        snapshot_dir = (
            HF_CACHE
            / "models--facebook--tribev2"
            / "snapshots"
            / "f894e783020944dcd96e5568550afe2aa9743f9f"
        )
        local_ckpt_dir = pathlib.Path("./hf_model/facebook_tribev2").resolve()
        local_ckpt_dir.mkdir(parents=True, exist_ok=True)

        config_path = local_ckpt_dir / "config.yaml"
        ckpt_path = local_ckpt_dir / "best.ckpt"

        if not config_path.exists():
            src = snapshot_dir / "config.yaml"
            if src.exists():
                shutil.copy(src, config_path)
                logger.info("Copied config.yaml from HF cache")
            else:
                raise FileNotFoundError(f"config.yaml not found in HF cache at {src}")

        if not ckpt_path.exists():
            src = snapshot_dir / "best.ckpt"
            if src.exists():
                shutil.copy(src, ckpt_path)
                logger.info("Copied best.ckpt from HF cache")
            else:
                raise FileNotFoundError(f"best.ckpt not found in HF cache at {src}")

        # config.yaml uses !!python/object/apply:pathlib.PosixPath which can't be
        # instantiated on Windows. Register a custom YAML constructor that joins
        # path parts into a plain string instead of a PosixPath object.
        import yaml as _yaml

        def _posixpath_constructor(loader: _yaml.UnsafeLoader, node: _yaml.Node) -> str:
            if isinstance(node, _yaml.SequenceNode):
                parts = loader.construct_sequence(node)
                return "/".join(str(p) for p in parts if p)
            return str(loader.construct_scalar(node))  # type: ignore[arg-type]

        _yaml.UnsafeLoader.add_constructor(
            "tag:yaml.org,2002:python/object/apply:pathlib.PosixPath",
            _posixpath_constructor,
        )
        logger.info("Registered Windows-compatible PosixPath YAML constructor")

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
            # TribeModel expects a text file path or inline text via events dataframe.
            # For text inputs we write to a temp file then call get_events_dataframe.
            import tempfile, pathlib

            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".txt", delete=False, encoding="utf-8"
            ) as f:
                f.write(req.content)
                text_path = pathlib.Path(f.name)

            df = tribe_model.get_events_dataframe(text_path=text_path)  # type: ignore[union-attr]
            preds, _ = tribe_model.predict(events=df)  # type: ignore[union-attr]
            text_path.unlink(missing_ok=True)

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
