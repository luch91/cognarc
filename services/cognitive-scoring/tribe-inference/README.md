# TRIBE v2 Local Inference Server

Runs the `facebook/tribev2` model locally for development and integration testing.
For production, use the GCP Cloud Run deployment from P-005.

## Prerequisites

1. **Python 3.10+** with pip
2. **HuggingFace account** — [sign up free](https://huggingface.co/join)
3. **LLaMA 3.2 gated model access** — accept terms at [meta-llama/Llama-3.2-1B](https://huggingface.co/meta-llama/Llama-3.2-1B) (instant approval)
4. **GPU recommended** — NVIDIA GPU with 16GB+ VRAM. CPU-only works but is slow (~60s/request).

## Setup

### 1. Create and activate the virtual environment

```bash
# From project root (already created)
.\cog_env\Scripts\Activate.ps1        # Windows
# or
source cog_env/bin/activate           # macOS / Linux
```

### 2. Install Python dependencies

```bash
cd services/cognitive-scoring/tribe-inference
pip install -r requirements.txt
```

### 3. Authenticate with HuggingFace

```bash
huggingface-cli login
# Enter your HF token when prompted: hf_...
```

Or set the environment variable (already in .env):
```bash
$env:HF_TOKEN = "hf_..."    # PowerShell
export HF_TOKEN="hf_..."    # bash
```

### 4. Run the inference server

```bash
# From services/cognitive-scoring/tribe-inference/
uvicorn server:app --host 0.0.0.0 --port 8080

# Or with HF token inline:
HF_TOKEN=hf_xxx uvicorn server:app --host 0.0.0.0 --port 8080
```

### 5. Switch CognArc to tribe-local engine

In your `.env`:
```
COGNARC_SCORING_ENGINE=tribe-local
TRIBE_LOCAL_ENDPOINT=http://localhost:8080
```

Then restart the cognitive-scoring service:
```bash
pnpm --filter @cognarc/cognitive-scoring dev
```

## Verifying it works

```bash
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"stimulus_type":"text","content":"Hello world","workspace_id":"ws-test"}'
```

Expected response: `{"cortical_activations":[...],"model_version":"tribe-v2","latency_ms":...}`

## Health check

```bash
curl http://localhost:8080/health
# {"status":"ready","model":"facebook/tribev2"}
```

## Notes

- First run downloads ~15GB of model weights. Set `HF_HOME` to control cache location.
- `model_version` returns `"tribe-v2-stub"` if TRIBE v2 failed to load — scores will be synthetic.
- CPU inference takes 30–90 seconds per request. GPU inference is 2–5 seconds.
- The server is single-threaded by design (TRIBE inference is not safely parallelisable without proper batching).
