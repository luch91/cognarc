import { CognArcError } from '@cognarc/types'
import { TRIBEAdapter, type TRIBEPredictRequest, type TRIBEPredictResponse } from '../engines/TRIBEAdapter.js'
import type { CognitiveROIMap } from '../tribe/roi-mapping.js'

// Timeouts: Cloud Run GPU cold starts take ~300s (TRIBE + whisperx transcription).
// Warm requests complete in ~30s. We distinguish the two cases via retry count.
const COLD_START_TIMEOUT_MS = 360_000
const WARM_TIMEOUT_MS = 360_000

// Retry config: up to 3 attempts with exponential backoff.
// Covers cold-start 503s and transient network errors.
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1_000

export class TRIBEGCPAdapter extends TRIBEAdapter {
  private readonly gcpEndpoint: string

  constructor(
    endpoint: string,
    roiMap?: CognitiveROIMap,
  ) {
    // Pass WARM_TIMEOUT_MS to super — we override the fetch logic below.
    super(endpoint, roiMap, WARM_TIMEOUT_MS)
    this.gcpEndpoint = endpoint
  }

  // Override the internal predict method to add GCP auth + retry.
  // We access it by re-implementing the full fetch + retry loop here.
  // TRIBEAdapter.score() calls this.predict() which we shadow here.
  protected override async predict(req: TRIBEPredictRequest): Promise<TRIBEPredictResponse> {
    const token = await this.getGCPIdentityToken()

    let lastError: unknown
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // First attempt uses cold-start timeout; subsequent attempts use warm timeout.
      const timeoutMs = attempt === 0 ? COLD_START_TIMEOUT_MS : WARM_TIMEOUT_MS

      try {
        return await this.fetchWithTimeout(req, token, timeoutMs)
      } catch (err) {
        lastError = err

        const isRetryable = this.isRetryableError(err)
        if (!isRetryable || attempt === MAX_RETRIES - 1) {
          break
        }

        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt)
        await sleep(backoff)
      }
    }

    throw lastError
  }

  private async fetchWithTimeout(
    req: TRIBEPredictRequest,
    token: string,
    timeoutMs: number,
  ): Promise<TRIBEPredictResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${this.gcpEndpoint}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text()
        throw new CognArcError(
          `TRIBE GCP inference returned ${res.status}: ${body}`,
          'TRIBE_INFERENCE_ERROR',
        )
      }

      return (await res.json()) as TRIBEPredictResponse
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CognArcError(
          `TRIBE GCP inference timed out after ${timeoutMs}ms`,
          'TRIBE_TIMEOUT',
        )
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // Fetches a GCP identity token for authenticating to Cloud Run.
  // Uses the metadata server when running on GCP (Cloud Run, GCE, GKE).
  // Falls back to Application Default Credentials via gcloud for local testing.
  private async getGCPIdentityToken(): Promise<string> {
    // On GCP: use the metadata server — no extra packages needed.
    const metadataUrl =
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity' +
      `?audience=${encodeURIComponent(this.gcpEndpoint)}&format=full`

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2_000)
      try {
        const res = await fetch(metadataUrl, {
          headers: { 'Metadata-Flavor': 'Google' },
          signal: controller.signal,
        })
        if (res.ok) {
          return await res.text()
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // Not on GCP — fall through to ADC
    }

    // Local development: generate token via `gcloud auth print-identity-token`.
    // Try with explicit audience first; if that fails (SSL cert issues on some machines),
    // fall back to default audience token which Cloud Run also accepts.
    const { execSync } = await import('child_process')
    const tryExec = (cmd: string): string | null => {
      try {
        return execSync(cmd, { encoding: 'utf8', timeout: 10_000 }).trim()
      } catch {
        return null
      }
    }

    const token =
      tryExec(`gcloud auth print-identity-token --audiences=${this.gcpEndpoint}`) ??
      tryExec('gcloud auth print-identity-token')

    if (token) return token

    throw new CognArcError(
      'Failed to obtain GCP identity token. ' +
        'On GCP: ensure the service account has Cloud Run Invoker role. ' +
        'Locally: run `gcloud auth login` and ensure gcloud is on PATH.',
      'GCP_AUTH_ERROR',
    )
  }

  private isRetryableError(err: unknown): boolean {
    if (err instanceof CognArcError) {
      // Retry on timeout and 5xx (server errors, cold-start 503s).
      if (err.code === 'TRIBE_TIMEOUT') return true
      const statusMatch = err.message.match(/returned (\d{3})/)
      if (statusMatch?.[1] !== undefined) {
        const status = parseInt(statusMatch[1], 10)
        return status >= 500
      }
      return false
    }
    // Retry on network errors (fetch failed, connection reset).
    if (err instanceof TypeError) return true
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
