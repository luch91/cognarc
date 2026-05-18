#!/usr/bin/env bash
# CognArc — GCP setup script for TRIBE v2 Cloud Run deployment.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated: gcloud auth login
#   - Billing account linked to your GCP project
#   - HuggingFace token with LLaMA 3.2 gated model access
#
# Usage:
#   cd infrastructure/gcp
#   ./setup.sh
#
# What this does:
#   1. Confirms or creates the GCP project
#   2. Links billing (if not already linked)
#   3. Enables required APIs
#   4. Creates Artifact Registry repository
#   5. Creates a dedicated service account for Cloud Run
#   6. Grants minimum required IAM permissions
#   7. Prints cost warning and next steps

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-cognarc-$(date +%Y%m)}"
REGION="${GCP_REGION:-us-central1}"
REPO_NAME="cognarc"
SERVICE_ACCOUNT_NAME="tribe-inference-runner"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Colour helpers
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Cost warning ───────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║            GCP COST ESTIMATE — READ BEFORE RUNNING       ║${NC}"
echo -e "${YELLOW}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}║                                                          ║${NC}"
echo -e "${YELLOW}║  Cloud Run GPU (NVIDIA L4):  ~\$0.000657/GPU-second       ║${NC}"
echo -e "${YELLOW}║  Artifact Registry storage:  ~\$0.10/GB/month (~\$0.90)   ║${NC}"
echo -e "${YELLOW}║  Cloud Build (build time):   ~\$0.24 per build            ║${NC}"
echo -e "${YELLOW}║                                                          ║${NC}"
echo -e "${YELLOW}║  SCALE-TO-ZERO: \$0.00 when idle (no traffic)             ║${NC}"
echo -e "${YELLOW}║  Portfolio usage (100 req/day): ~\$20-30/month            ║${NC}"
echo -e "${YELLOW}║  Free credit covers ~10-15 months of portfolio usage     ║${NC}"
echo -e "${YELLOW}║                                                          ║${NC}"
echo -e "${YELLOW}║  ⚠ Set a billing alert at \$50 in GCP console to be safe  ║${NC}"
echo -e "${YELLOW}║    Console → Billing → Budgets & alerts → Create budget  ║${NC}"
echo -e "${YELLOW}║                                                          ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
read -rp "Continue? (y/N) " confirm
[[ "${confirm,,}" == "y" ]] || { echo "Aborted."; exit 0; }

# ── Verify gcloud auth ─────────────────────────────────────────────────────────
info "Checking gcloud authentication..."
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
if [[ -z "$ACCOUNT" ]]; then
    error "Not authenticated. Run: gcloud auth login"
fi
info "Authenticated as: $ACCOUNT"

# ── Project ────────────────────────────────────────────────────────────────────
info "Checking project: $PROJECT_ID"
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
    info "Project $PROJECT_ID already exists."
else
    info "Creating project: $PROJECT_ID"
    gcloud projects create "$PROJECT_ID" --name="CognArc"
    info "Project created. You may need to link a billing account in the GCP console."
    warn "Go to: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    read -rp "Press Enter once billing is linked..."
fi

gcloud config set project "$PROJECT_ID"

# ── Enable APIs ────────────────────────────────────────────────────────────────
info "Enabling required GCP APIs (this takes ~2 minutes on first run)..."
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    iam.googleapis.com \
    --project="$PROJECT_ID"
info "APIs enabled."

# ── Artifact Registry ──────────────────────────────────────────────────────────
info "Setting up Artifact Registry repository: $REPO_NAME in $REGION"
if gcloud artifacts repositories describe "$REPO_NAME" \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
    info "Repository $REPO_NAME already exists."
else
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="CognArc container images" \
        --project="$PROJECT_ID"
    info "Repository created."
fi

# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
info "Docker configured for Artifact Registry."

# ── Service account ────────────────────────────────────────────────────────────
info "Setting up service account: $SERVICE_ACCOUNT_NAME"
if gcloud iam service-accounts describe "$SERVICE_ACCOUNT" \
    --project="$PROJECT_ID" &>/dev/null; then
    info "Service account already exists."
else
    gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
        --display-name="TRIBE Inference Cloud Run Runner" \
        --project="$PROJECT_ID"
    info "Service account created."
fi

# Grant minimum permissions:
#   - Artifact Registry reader (pull images)
#   - Cloud Run invoker is set per-service, not on the SA itself
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/artifactregistry.reader" \
    --quiet

# Allow Cloud Build SA to deploy to Cloud Run
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin" \
    --quiet

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --quiet

info "IAM permissions configured."

# ── Store HF token as Secret Manager secret ────────────────────────────────────
info "Setting up HuggingFace token secret..."
read -rp "Enter your HuggingFace token (hf_xxx) — stored in Secret Manager: " HF_TOKEN
if [[ -z "$HF_TOKEN" ]]; then
    warn "No token provided. You can add it later:"
    warn "  echo 'hf_xxx' | gcloud secrets create HF_TOKEN --data-file=-"
else
    if gcloud secrets describe HF_TOKEN --project="$PROJECT_ID" &>/dev/null; then
        echo -n "$HF_TOKEN" | gcloud secrets versions add HF_TOKEN \
            --data-file=- --project="$PROJECT_ID"
        info "HF_TOKEN secret updated."
    else
        echo -n "$HF_TOKEN" | gcloud secrets create HF_TOKEN \
            --data-file=- --project="$PROJECT_ID"
        info "HF_TOKEN secret created."
    fi

    # Grant Cloud Build SA access to the secret
    gcloud secrets add-iam-policy-binding HF_TOKEN \
        --project="$PROJECT_ID" \
        --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  SETUP COMPLETE ✓                        ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Project:     $PROJECT_ID${NC}"
echo -e "${GREEN}║  Region:      $REGION${NC}"
echo -e "${GREEN}║  Registry:    ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Next step — build and deploy:                           ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  gcloud builds submit \\                                  ║${NC}"
echo -e "${GREEN}║    --config services/cognitive-scoring/ \\                ║${NC}"
echo -e "${GREEN}║             tribe-inference/cloudbuild.yaml \\            ║${NC}"
echo -e "${GREEN}║    --substitutions _HF_TOKEN=\$(gcloud secrets versions  ║${NC}"
echo -e "${GREEN}║      access latest --secret=HF_TOKEN),                  ║${NC}"
echo -e "${GREEN}║      _PROJECT_ID=$PROJECT_ID                             ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Build takes ~15 min (709 MB model download).            ║${NC}"
echo -e "${GREEN}║  Set a calendar reminder to stop any idle VMs.           ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "GCP_PROJECT_ID=$PROJECT_ID" >> ../../.env
echo "GCP_REGION=$REGION" >> ../../.env
info "GCP_PROJECT_ID and GCP_REGION appended to .env"
