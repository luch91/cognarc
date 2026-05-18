import type { CognArcClientOptions, CognitiveScore, RegressionResult, ScoreInput } from './types.js'
import { CognArcError } from './types.js'

const DEFAULT_BASE_URL = 'http://localhost:3002'

export class CognArcClient {
  private readonly baseUrl: string
  private readonly workspaceId: string
  private readonly headers: Record<string, string>

  constructor(options: CognArcClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env['COGNARC_BASE_URL'] ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.workspaceId = options.workspaceId ?? process.env['COGNARC_WORKSPACE_ID'] ?? 'default'
    const apiKey = options.apiKey ?? process.env['COGNARC_API_KEY']
    this.headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }
  }

  /**
   * Score an LLM output for cognitive properties.
   *
   * @example
   * const client = new CognArcClient({ apiKey: 'cog_...' })
   * const score = await client.score({ output: 'Your LLM response here' })
   * console.log(score.cognitive_risk)  // 'LOW' | 'MEDIUM' | 'HIGH'
   */
  async score(input: ScoreInput): Promise<CognitiveScore> {
    return this.post<CognitiveScore>('/score', {
      output: input.output,
      workspace_id: this.workspaceId,
      ...(input.input !== undefined ? { input: input.input } : {}),
      ...(input.context !== undefined ? { context: input.context } : {}),
    })
  }

  /**
   * Check whether the current output has regressed vs the stored baseline
   * for the given promptId. Records a baseline on first call.
   *
   * Returns a RegressionResult — check .regressed to gate CI.
   */
  async checkRegression(
    promptId: string,
    input: ScoreInput,
  ): Promise<RegressionResult> {
    const body = {
      prompt_id: promptId,
      output: input.output,
      workspace_id: this.workspaceId,
      ...(input.input !== undefined ? { input: input.input } : {}),
    }

    // 422 = regressed — still parse the body rather than throwing
    return this.post<RegressionResult>('/regression/check', body, [200, 422])
  }

  /**
   * Manually set a baseline for a prompt ID.
   */
  async setBaseline(
    promptId: string,
    cognitiveLoad: number,
    comprehensionConfidence: number,
  ): Promise<{ prompt_id: string; cognitive_load: number; comprehension_confidence: number; recorded_at: string }> {
    return this.post('/regression/baseline', {
      prompt_id: promptId,
      cognitive_load: cognitiveLoad,
      comprehension_confidence: comprehensionConfidence,
    }, [201])
  }

  private async post<T>(
    path: string,
    body: unknown,
    acceptStatuses: number[] = [200],
  ): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      })
    } catch (err) {
      throw new CognArcError(`Network error: ${err instanceof Error ? err.message : err}`)
    }

    if (!acceptStatuses.includes(res.status)) {
      let errorBody: unknown
      try { errorBody = await res.json() } catch { errorBody = await res.text().catch(() => '') }
      throw new CognArcError(`API error ${res.status}`, res.status, errorBody)
    }

    return res.json() as Promise<T>
  }
}
