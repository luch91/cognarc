# Base: CUDA 12.4 runtime on Ubuntu 22.04
# tribev2 requires torch>=2.5.1 which needs CUDA 12.4 build.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# Use a fixed, world-readable cache dir so model weights downloaded during build
# are accessible when the container runs as appuser (not root).
ENV HF_HOME=/hf_cache
RUN mkdir -p /hf_cache && chmod 777 /hf_cache

# System deps: Python 3.11 (tribev2 requires >=3.11), ffmpeg, git, build tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    python3.11-venv \
    ffmpeg \
    git \
    curl \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Point python3/python/pip3 at 3.11
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && python3 -m pip install --upgrade pip

WORKDIR /app

# Install PyTorch 2.5.1 with CUDA 12.4 — matches tribev2's torch>=2.5.1 requirement.
RUN pip3 install --no-cache-dir \
    torch==2.5.1+cu124 \
    torchaudio==2.5.1+cu124 \
    torchvision==0.20.1+cu124 \
    --index-url https://download.pytorch.org/whl/cu124

# Install tribev2 from GitHub with all its dependencies.
RUN pip3 install --no-cache-dir \
    "git+https://github.com/facebookresearch/tribev2.git" \
    "neuralset==0.0.2" \
    "neuraltrain==0.0.2"

# Install tribev2 optional extras + server deps.
RUN pip3 install --no-cache-dir \
    "fastapi>=0.110.0" \
    "uvicorn[standard]>=0.29.0" \
    "huggingface_hub>=0.22.0" \
    "pydantic>=2.6.0" \
    "numpy==2.2.6" \
    "pandas>=2.0.0" \
    "einops" \
    "nibabel>=5.0.0" \
    "scikit-learn>=1.3.0" \
    "colorcet>=3.0.0" \
    "lightning>=2.0.0" \
    "torchmetrics>=1.0.0" \
    "nilearn>=0.10.0" \
    "pyvista>=0.43.0" \
    "scikit-image>=0.21.0" \
    "seaborn>=0.13.0" \
    "tqdm>=4.66.0" \
    "matplotlib>=3.8.0" \
    "soundfile>=0.12.0" \
    "Levenshtein" \
    "julius" \
    "spacy" \
    "moviepy>=2.2.1" \
    "transformers"

# Download spacy English model.
RUN python3 -m spacy download en_core_web_sm

# Pre-download model weights into /hf_cache (world-readable, set above).
# token passed via env var to avoid shell interpolation issues.
ARG HF_TOKEN
ENV HF_TOKEN_BUILD=${HF_TOKEN}
RUN if [ -n "$HF_TOKEN_BUILD" ]; then \
    HF_TOKEN="$HF_TOKEN_BUILD" python3 -c "\
import os; \
from huggingface_hub import hf_hub_download, login; \
login(token=os.environ['HF_TOKEN']); \
hf_hub_download('facebook/tribev2', 'config.yaml'); \
hf_hub_download('facebook/tribev2', 'best.ckpt'); \
print('Model weights cached to /hf_cache — done'); \
"; \
else \
    echo "WARNING: HF_TOKEN not set — model will download at first request"; \
fi

COPY server.py .

ENV PORT=8080
EXPOSE 8080

RUN useradd -m -u 1000 appuser && chown -R appuser /app
USER appuser

CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
