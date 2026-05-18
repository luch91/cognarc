# GCP Cloud Run — TRIBE v2 Inference

Deploys the TRIBE v2 inference server as a GPU-accelerated Cloud Run service.

- **Hardware:** NVIDIA L4 GPU, 4 vCPU, 16 GiB RAM
- **Scale-to-zero:** no charge when idle
- **Cost:** ~$20–30/month at portfolio scale (100 requests/day)
- **Free credit:** $300 GCP credit covers ~10–15 months of portfolio usage

---

## Prerequisites

1. **GCP account** — [console.cloud.google.com](https://console.cloud.google.com)
2. **gcloud CLI** — [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
3. **HuggingFace account + LLaMA 3.2 gated model access**
   - Go to [huggingface.co/meta-llama/Llama-3.2-1B](https://huggingface.co/meta-llama/Llama-3.2-1B)
   - Click "Access repository" and accept the licence
   - TRIBE v2 downloads LLaMA 3.2 weights internally — you need this access
4. **HuggingFace token** with `read` scope
   - [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
   - Token is stored in `services/cognitive-scoring/.env` as `HF_TOKEN`

---

## Step-by-step setup

### 1. Authenticate gcloud

```bash
gcloud auth login
gcloud auth application-default login
```

### 2. Run the setup script

```bash
cd infrastructure/gcp
chmod +x setup.sh
./setup.sh
```

The script will:
- Create or confirm a GCP project
- Enable Cloud Run, Artifact Registry, Cloud Build, and Secret Manager APIs
- Create an Artifact Registry Docker repository called `cognarc`
- Create a service account `tribe-inference-runner` with minimum permissions
- Store your HuggingFace token in Secret Manager as `HF_TOKEN`
- Append `GCP_PROJECT_ID` and `GCP_REGION` to the root `.env`

> **Set a billing alert first.** Go to GCP Console → Billing → Budgets & alerts → Create budget. Set threshold at $50 to avoid surprises.

### 3. Build and deploy

```bash
# From the monorepo root:
HF_TOKEN=$(gcloud secrets versions access latest --secret=HF_TOKEN)

gcloud builds submit \
  --config services/cognitive-scoring/tribe-inference/cloudbuild.yaml \
  --substitutions _HF_TOKEN=${HF_TOKEN},_PROJECT_ID=$(gcloud config get-value project)
```

**The build takes 10–15 minutes** — the 709 MB model checkpoint is downloaded and baked into the container image during build. Set a reminder; don't leave a VM running.

### 4. Verify the deployment

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe tribe-inference \
  --region=us-central1 \
  --format="value(status.url)")

echo "Service URL: $SERVICE_URL"

# Health check (requires authentication — service is not public)
gcloud run services proxy tribe-inference --region=us-central1 --port=8080 &
curl http://localhost:8080/health
# Expected: {"status": "ready", "model": "facebook/tribev2"}

# Test prediction
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"stimulus_type":"text","content":"Hello world","workspace_id":"test"}'
```

### 5. Wire up the CognArc scoring service

Add to `services/cognitive-scoring/.env`:

```
COGNARC_SCORING_ENGINE=tribe-gcp
GCP_TRIBE_ENDPOINT=https://<your-cloud-run-url>
```

---

## Architecture

```
CognArc API request
      │
      ▼
cognitive-scoring service  (Node.js)
      │  COGNARC_SCORING_ENGINE=tribe-gcp
      ▼
TRIBEGCPAdapter.ts
      │  POST /predict  (with GCP ID token auth + retry)
      ▼
Cloud Run service  (tribe-inference)
      │  NVIDIA L4 GPU
      ▼
TRIBE v2 model  (facebook/tribev2)
      │  fsaverage5 cortical activations
      ▼
ROI mapping → CognitiveScoreResponse
```

---

## Cost breakdown

| Component | Rate | Portfolio estimate |
|---|---|---|
| Cloud Run GPU (L4) | $0.000657/GPU-second | ~$17/month (100 req/day × 5s) |
| Cloud Run CPU | $0.00059/vCPU-second | ~$5/month |
| Cloud Run RAM | $0.000099/GiB-second | ~$3/month |
| Artifact Registry | $0.10/GB/month | ~$0.90/month (9 GB image) |
| Cloud Build | $0.003/build-minute | ~$0.24/build |
| **Total** | | **~$26/month** |

Scale-to-zero means **$0.00 when idle** — the portfolio only incurs cost during active demos.

---

## Shut down

To stop incurring charges while not demoing:

```bash
# Set min-instances to 0 (already the default — nothing to do)
# The service scales to zero automatically after 15 minutes of no traffic.

# To delete entirely:
gcloud run services delete tribe-inference --region=us-central1
```

---

## Troubleshooting

**Cold start timeout (~30–60s):** Normal on first request after idle. `TRIBEGCPAdapter` uses a 60s timeout for cold starts. Subsequent warm requests complete in ~5s.

**`PERMISSION_DENIED` on `/predict`:** The service is not public. Use `gcloud run services proxy` for local testing, or configure a service account with `roles/run.invoker` for server-to-server calls.

**`Out of memory` errors:** Ensure `--memory=16Gi` is set. TRIBE v2 needs ~12 GB GPU RAM + system RAM.

**Model not loaded (`status: stub`):** Check Cloud Run logs: `gcloud run services logs read tribe-inference --region=us-central1`. Look for `TRIBE v2 loaded successfully`.
