import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { CognArcError } from '@cognarc/types'
import { ScoringEngine } from './ScoringEngine.js'
import {
  DEFAULT_ROI_MAP,
  extractROIActivation,
  normaliseActivation,
  type CognitiveROIMap,
} from '../tribe/roi-mapping.js'

export interface TRIBEPredictRequest {
  stimulus_type: string
  content: string
  workspace_id: string
}

export interface TRIBEPredictResponse {
  cortical_activations: number[]   // fsaverage5 vertex activations (~20k floats)
  model_version: string
  latency_ms: number
}

export class TRIBEAdapter extends ScoringEngine {
  readonly engineName = 'tribe-v2'

  constructor(
    protected readonly endpoint: string,
    private readonly roiMap: CognitiveROIMap = DEFAULT_ROI_MAP,
    private readonly timeoutMs = 10_000,
  ) {
    super()
  }

  async score(request: CognitiveScoreRequest): Promise<CognitiveScoreResponse> {
    const start = Date.now()

    const rawContent = request.content
    const content: string =
      typeof rawContent !== 'string'
        ? (rawContent as Buffer).toString('base64')
        : rawContent

    const prediction = await this.predict({
      stimulus_type: request.stimulus_type,
      content,
      workspace_id: request.workspace_id,
    })

    const activations = prediction.cortical_activations

    const rawLoad = extractROIActivation(activations, this.roiMap.cognitive_load)
    const rawComprehension = extractROIActivation(activations, this.roiMap.comprehension_confidence)
    const rawValence = extractROIActivation(activations, this.roiMap.emotional_valence)
    const rawTrust = extractROIActivation(activations, this.roiMap.trust_coherence)

    const cognitive_load = normaliseActivation(rawLoad)
    const comprehension_confidence = normaliseActivation(rawComprehension)
    const emotional_valence = normaliseActivation(rawValence)
    const trust_coherence = normaliseActivation(rawTrust)
    const manipulation_risk = this.deriveManipulationRisk(cognitive_load, trust_coherence, emotional_valence)

    return {
      cognitive_load,
      comprehension_confidence,
      emotional_valence,
      trust_coherence,
      manipulation_risk,
      cognitive_risk: this.cognitiveRisk(cognitive_load),
      confidence_intervals: this.buildConfidenceIntervals(cognitive_load, comprehension_confidence, manipulation_risk),
      top_brain_regions: this.topRegions(activations),
      explanation: this.buildExplanation(cognitive_load, comprehension_confidence, manipulation_risk),
      model_version: prediction.model_version,
      latency_ms: Date.now() - start,
    }
  }

  protected async predict(req: TRIBEPredictRequest): Promise<TRIBEPredictResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(`${this.endpoint}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new CognArcError(
          `TRIBE inference server returned ${res.status}: ${await res.text()}`,
          'TRIBE_INFERENCE_ERROR',
        )
      }

      return (await res.json()) as TRIBEPredictResponse
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CognArcError(
          `TRIBE inference timed out after ${this.timeoutMs}ms`,
          'TRIBE_TIMEOUT',
        )
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private cognitiveRisk(load: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (load >= 70) return 'HIGH'
    if (load >= 45) return 'MEDIUM'
    return 'LOW'
  }

  // High limbic / low prefrontal ratio is the neural manipulation signal.
  private deriveManipulationRisk(load: number, trust: number, valence: number): number {
    const limbicPrefrontalRatio = valence / Math.max(1, trust)
    const base = Math.min(100, limbicPrefrontalRatio * 25)
    return Math.max(0, Math.min(100, Math.round(base + (load > 70 ? 10 : 0))))
  }

  private buildConfidenceIntervals(
    load: number,
    comprehension: number,
    manipulation: number,
  ): Record<string, { low: number; high: number }> {
    const ci = (v: number, w: number) => ({
      low: Math.max(0, v - w),
      high: Math.min(100, v + w),
    })
    return {
      cognitive_load: ci(load, 6),
      comprehension_confidence: ci(comprehension, 6),
      manipulation_risk: ci(manipulation, 5),
    }
  }

  private topRegions(activations: number[]): string[] {
    const regions: Array<{ name: string; activation: number }> = [
      { name: 'dorsolateral prefrontal cortex', activation: activations[1500] ?? 0 },
      { name: 'anterior cingulate cortex', activation: activations[950] ?? 0 },
      { name: "Wernicke's area", activation: activations[3500] ?? 0 },
      { name: 'amygdala', activation: activations[4350] ?? 0 },
      { name: 'ventromedial prefrontal cortex', activation: activations[750] ?? 0 },
      { name: 'posterior cingulate cortex', activation: activations[5350] ?? 0 },
    ]
    return regions
      .sort((a, b) => b.activation - a.activation)
      .slice(0, 3)
      .map((r) => r.name)
  }

  private buildExplanation(load: number, comprehension: number, manipulation: number): string {
    const parts: string[] = ['TRIBE v2 cortical surface analysis.']
    if (load >= 70) parts.push('Elevated dorsolateral prefrontal activation indicates high cognitive load.')
    if (comprehension < 45) parts.push("Reduced left temporal activation suggests comprehension difficulty.")
    if (manipulation >= 50) parts.push('High limbic-to-prefrontal ratio signals potential manipulation.')
    return parts.join(' ')
  }
}
