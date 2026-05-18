# guardrail-engine

**Enforcement layer: CI/CD gate, prompt evaluation, manipulation scanning, and red team monitoring.**

This service makes CognArc an enforcement layer, not just an evaluation tool. It intercepts
AI outputs and developer workflows to enforce cognitive thresholds before harm reaches users.

## Sub-modules

### `cicd/` — CI/CD Cognitive Gate (P-008)
GitHub Actions, GitLab CI, and Jenkins plugins that automatically evaluate PRs and fail builds
on cognitive threshold breach. Human configures thresholds. Agent enforces.

### `prompt-gate/` — Prompt Evaluation Gate (P-009)
Proxy middleware that sits between your application and the LLM API. Scores prompts before
forwarding. Returns pre-flight cognitive scores. Includes prompt regression monitor.

### `manipulation/` — Manipulation Taxonomy Engine (P-010)
Continuous detection across 6 manipulation categories: false urgency, social proof fabrication,
ambiguity exploitation, authority mimicry, sycophantic drift, and obfuscation.

### `red-team/` — Red Team Safety Agent (P-014)
Post-remediation regression monitor and neural evidence package generator for safety teams.

## Port

`:3004`

## Running locally

```bash
pnpm --filter @cognarc/guardrail-engine dev
```
