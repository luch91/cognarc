# dashboard

**CognArc internal dashboard — five buyer surfaces in one place.**

Built with React 18, Vite, Tailwind CSS, Recharts, and React Query.
Implemented in P-011.

## Views

| View | Audience | Key features |
|---|---|---|
| Workspace Overview | All roles | Health score, agent activity feed, kill switch |
| Engineer | AI Engineers | Prompt regression monitor, CI/CD gate history, audit log |
| PM | Product Managers | Alignment score, connector status, onboarding load curve |
| Growth | Growth & Marketing | Creative evaluation queue, variant ranker, brand trust drift |
| Designer | Product Designers | A/B comparison tool, heatmap viewer, onboarding analyzer |
| Safety / Red Team | Red Team / AI Safety | Manipulation feed, post-remediation monitor, audit export |
| Act-Gated Approvals | Admins | Pending approvals inbox, decision package viewer |

## Port

`:5173` (Vite dev server)

## Running locally

```bash
pnpm --filter @cognarc/dashboard dev
```

## Live Cognitive Scoring

The dashboard connects to `cognitive-scoring` on `localhost:3001` via a Vite proxy (`/api/score`).

For live TRIBE v2 scores:
1. Start the scoring service: `pnpm --filter @cognarc/cognitive-scoring dev`
   (with `COGNARC_SCORING_ENGINE=tribe-gcp` in `services/cognitive-scoring/.env`)
2. Open `http://localhost:5173`
3. Use the **Live Cognitive Score** panel on the Workspace Overview page

For instant mock scores (no Cloud Run), set `COGNARC_SCORING_ENGINE=mock` in the scoring service `.env`.

Cold start on Cloud Run: ~5 min. Warm requests: ~30s.
