# video-analysis

**CognArc Video Cognitive Analysis Service** — FastAPI mock engine that performs
moment-by-moment cognitive analysis on video creative assets.

## Port

`:3007`

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{"status":"ok","service":"video-analysis","mode":"mock"}` |
| `POST` | `/analyze` | Accepts a `VideoAnalysisRequest`, returns a `VideoAnalysisResponse` |

## Request

```json
{
  "filename": "social-ad-v1.mp4",
  "file_size_bytes": 4200000,
  "duration_estimate_seconds": 30,
  "workspace_id": "ws-1"
}
```

## Response

Returns overall cognitive scores (load, manipulation risk, trust coherence, attention
engagement), `cognitive_risk` (`LOW` / `MEDIUM` / `HIGH`), 5 `moment_findings` covering
key video components (Opening Hook, Voiceover, Scene Transition, Product Demo, CTA),
`rewrite_candidates` (voiceover segments with manipulation_risk > 50), and
`recommended_actions` (top 3 fixes).

Scores are deterministic from the MD5 hash of the filename so the mock produces
stable, meaningful variation across different assets.

## Environment variables

No external API keys required. The engine is fully self-contained.

## Running locally

```bash
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 3007 --reload
```

## Docker

```bash
docker build -t cognarc-video-analysis .
docker run -p 3007:3007 cognarc-video-analysis
```

## Integration

The dashboard Growth view (`Creative Evaluation Queue`) calls `POST /analyze` when a
video file is uploaded. Results are stored in `AppContext` and displayed in the
inline Video Cognitive Report panel.

Critical findings (severity `critical`) are forwarded to the Safety Manipulation
Detection Feed and, if overall manipulation risk > 70, to the Act-Gated Approvals queue.
