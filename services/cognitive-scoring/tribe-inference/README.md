# TRIBE v2 Inference Server

Runs `facebook/tribev2` — the tri-modal brain encoding model — serving cortical activation predictions over HTTP.

Two deployment targets:
- **Local** (`tribe-local`): run directly with uvicorn for development
- **GCP Cloud Run** (`tribe-gcp`): deployed at `https://tribe-inference-l4kyolfkla-uc.a.run.app` (NVIDIA L4, scale-to-zero)

---

## Prerequisites

1. **Python 3.11+** (tribev2 requires `>=3.11`)
2. **HuggingFace account** with access to:
   - [`facebook/tribev2`](https://huggingface.co/facebook/tribev2) — request access on the model page
   - [`meta-llama/Llama-3.2-1B`](https://huggingface.co/meta-llama/Llama-3.2-1B) — instant approval
3. **GPU recommended** — NVIDIA GPU with 16GB+ VRAM. CPU-only works but inference takes 30–90s/request.
4. **ffmpeg** — required by tribev2 for audio processing (`apt install ffmpeg` / `brew install ffmpeg`)
5. **uv** — tribev2 uses `uvx whisperx` for audio transcription (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

---

## Local Development

### 1. Install dependencies

```bash
cd services/cognitive-scoring/tribe-inference
pip install torch==2.5.1+cu124 torchaudio==2.5.1+cu124 --index-url https://download.pytorch.org/whl/cu124
pip install "git+https://github.com/facebookresearch/tribev2.git" neuralset==0.0.2 neuraltrain==0.0.2 exca==0.5.20
pip install fastapi uvicorn huggingface_hub pydantic numpy pandas edge-tts
python -m spacy download en_core_web_sm
```

> **`exca==0.5.20` must be pinned.** Versions `>=0.5.21` removed `NoValue` which tribev2 depends on.

### 2. Run the server

```bash
HF_TOKEN=hf_xxx uvicorn server:app --host 0.0.0.0 --port 8080
```

### 3. Wire up cognitive-scoring

In `services/cognitive-scoring/.env`:
```
COGNARC_SCORING_ENGINE=tribe-local
TRIBE_LOCAL_ENDPOINT=http://localhost:8080
```

---

## GCP Cloud Run Deployment

### One-time setup

1. **Store HF token in Secret Manager** (UTF-8, no BOM):
   ```powershell
   $bytes = [System.Text.Encoding]::UTF8.GetBytes("hf_xxx")
   $tmp = [System.IO.Path]::GetTempFileName()
   [System.IO.File]::WriteAllBytes($tmp, $bytes)
   gcloud secrets create hf-token --project=cognarc-202605 --data-file=$tmp
   ```

2. **Grant Secret Manager access** to the Cloud Build service account:
   ```bash
   gcloud secrets add-iam-policy-binding hf-token \
     --project=cognarc-202605 \
     --member="serviceAccount:225279071809-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

### Deploy

```bash
# From repo root
gcloud builds submit \
  --config services/cognitive-scoring/tribe-inference/cloudbuild.yaml \
  --project=cognarc-202605
```

No `--substitutions` needed — the HF token is read directly from Secret Manager during the build.

The build:
1. Installs all Python deps (including `exca==0.5.20`)
2. Downloads `config.yaml` + `best.ckpt` into `/hf_cache` (baked into image)
3. Deploys to Cloud Run with NVIDIA L4, 16GiB RAM, `min-instances=0` (scale-to-zero)

### Update the token

```powershell
$bytes = [System.Text.Encoding]::UTF8.GetBytes("hf_newtoken")
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllBytes($tmp, $bytes)
gcloud secrets versions add hf-token --project=cognarc-202605 --data-file=$tmp
# Then redeploy
```

---

## API

### `GET /health`
```json
{"status": "ready", "model": "facebook/tribev2"}
```
Returns `"stub"` if model failed to load.

### `POST /predict`
```json
{
  "stimulus_type": "text",
  "content": "Evaluate this UI copy for cognitive load.",
  "workspace_id": "ws-test"
}
```
Response:
```json
{
  "cortical_activations": [0.104, -0.806, ...],
  "model_version": "tribe-v2",
  "latency_ms": 4200
}
```

- `model_version: "tribe-v2"` — real TRIBE inference
- `model_version: "tribe-v2-stub"` — model failed to load, synthetic activations returned

---

## Known Constraints

| Issue | Fix applied |
|---|---|
| `exca>=0.5.21` removed `NoValue` | Pinned `exca==0.5.20` in Dockerfile |
| `asyncio.get_event_loop()` fails in AnyIO thread | Using `asyncio.run()` for edge-tts |
| gTTS rate-limited from GCP datacenter IPs | Replaced with `edge-tts` (local, no external API) |
| HF token BOM from PowerShell `echo` | Use `[System.IO.File]::WriteAllBytes()` to write clean UTF-8 |
| `HF_TOKEN` env var conflict in Docker build | Token passed as `sys.argv[1]` to Python, not as env var |

---

## Wire to localhost

In `services/cognitive-scoring/.env`:
```
COGNARC_SCORING_ENGINE=tribe-gcp
GCP_TRIBE_ENDPOINT=https://tribe-inference-l4kyolfkla-uc.a.run.app
```

Requests to the Cloud Run endpoint require a GCP identity token (handled automatically by the scoring service when running on GCP, or via `gcloud auth print-identity-token` locally).
