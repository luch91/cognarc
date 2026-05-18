# Base: CUDA 12.3 runtime on Ubuntu 22.04
# NVIDIA L4 on GCP Cloud Run uses CUDA 12.x driver — runtime image is sufficient
# (no need for devel image; we don't compile CUDA kernels at runtime).
#
# Cost note: this image is ~8 GB. Cloud Run charges for image storage in
# Artifact Registry (~$0.10/GB/month) and only for actual request CPU/GPU time.
FROM nvidia/cuda:12.3.2-runtime-ubuntu22.04

# Prevent interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# System deps: Python 3.10, ffmpeg (required by tribev2 audio pipeline),
# git (needed by pip to install tribev2 from GitHub), and build tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3.10-dev \
    python3-pip \
    python3.10-venv \
    ffmpeg \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Ensure python3 and pip3 point to 3.10
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/python python python3.10 1

WORKDIR /app

# Copy and install Python requirements first (layer-cached unless requirements change).
COPY requirements.txt .

# Install PyTorch with CUDA 12.1 index (closest available to CUDA 12.3 runtime).
# Do this before requirements.txt so the CUDA build is used, not the CPU-only PyPI build.
RUN pip3 install --no-cache-dir \
    torch==2.2.2+cu121 \
    torchaudio==2.2.2+cu121 \
    torchvision==0.17.2+cu121 \
    --index-url https://download.pytorch.org/whl/cu121

# Install tribev2 and companion packages without deps (torch already installed above).
RUN pip3 install --no-cache-dir --no-deps \
    git+https://github.com/facebookresearch/tribev2.git \
    neuralset==0.0.2 \
    neuraltrain==0.0.2

# Install remaining runtime requirements.
RUN pip3 install --no-cache-dir \
    fastapi>=0.110.0 \
    "uvicorn[standard]>=0.29.0" \
    huggingface_hub>=0.22.0 \
    numpy>=1.26.0 \
    "pydantic>=2.6.0" \
    pandas>=2.0.0 \
    requests>=2.31.0 \
    einops>=0.7.0 \
    exca>=0.1.0 \
    nibabel>=5.0.0 \
    scikit-learn>=1.3.0 \
    ujson>=5.8.0 \
    colorcet>=3.0.0 \
    lightning>=2.0.0 \
    torchmetrics>=1.0.0 \
    nilearn>=0.10.0 \
    mne>=1.6.0 \
    pyvista>=0.43.0 \
    scikit-image>=0.21.0 \
    seaborn>=0.13.0 \
    tqdm>=4.66.0 \
    matplotlib>=3.8.0 \
    x-transformers>=1.0.0 \
    gtts>=2.5.0 \
    langdetect>=1.0.9 \
    pydub>=0.25.0 \
    soundfile>=0.12.0 \
    "imageio[ffmpeg]>=2.34.0" \
    av>=12.0.0

# Pre-download model weights during build so cold starts don't download 709 MB.
# Requires HF_TOKEN build arg — obtain at https://huggingface.co/settings/tokens
# The token must have access to the gated LLaMA 3.2 model.
#
# Cost note: downloading 709 MB during build is free (egress from HuggingFace CDN).
# The cached weights add ~700 MB to the container image.
ARG HF_TOKEN
RUN if [ -n "$HF_TOKEN" ]; then \
    python3 -c "\
import os; os.environ['HF_TOKEN'] = '${HF_TOKEN}'; \
from huggingface_hub import hf_hub_download, login; \
login(token='${HF_TOKEN}'); \
hf_hub_download('facebook/tribev2', 'config.yaml'); \
hf_hub_download('facebook/tribev2', 'best.ckpt'); \
print('Model weights cached successfully'); \
"; \
else \
    echo "WARNING: HF_TOKEN not set — model will be downloaded at first request (slow cold start)"; \
fi

COPY server.py .

# Cloud Run injects PORT env var; default to 8080.
ENV PORT=8080
EXPOSE 8080

# Run as non-root for security best practice.
RUN useradd -m -u 1000 appuser && chown -R appuser /app /root/.cache 2>/dev/null || true
USER appuser

CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
