export type { RewriteRequest, RewriteAlternative, RewriteResponse } from '@cognarc/types'
import type { RewriteRequest, RewriteResponse } from '@cognarc/types'

const REWRITE_URL = import.meta.env.VITE_COGNITIVE_REWRITE_URL ?? ''

export async function rewrite(request: RewriteRequest): Promise<RewriteResponse> {
  const payload = {
    original_text: request.originalText,
    copy_type: request.copyType,
    scores: {
      cognitive_load: request.scores.cognitiveLoad,
      comprehension_confidence: request.scores.comprehensionConfidence,
      emotional_valence: request.scores.emotionalValence,
      trust_coherence: request.scores.trustCoherence,
      manipulation_risk: request.scores.manipulationRisk,
      cognitive_risk: request.scores.cognitiveRisk,
    },
    taxonomy: {
      false_urgency: request.taxonomy?.falseUrgency ?? 0,
      social_proof_fabrication: request.taxonomy?.socialProofFabrication ?? 0,
      ambiguity_exploitation: request.taxonomy?.ambiguityExploitation ?? 0,
      authority_mimicry: request.taxonomy?.authorityMimicry ?? 0,
      sycophantic_drift: request.taxonomy?.sycophantidDrift ?? 0,
      obfuscation: request.taxonomy?.obfuscation ?? 0,
    },
    brand_voice_notes: request.brandVoiceNotes,
    max_length: request.maxLength,
    workspace_id: request.workspaceId,
  }

  const endpoint = REWRITE_URL ? `${REWRITE_URL}/rewrite` : '/api/rewrite'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Rewrite service error ${res.status}: ${body}`)
  }

  const data = await res.json() as Record<string, unknown>

  return {
    alternatives: (data.alternatives as Record<string, unknown>[]).map((alt) => {
      const scores = alt.scores as Record<string, number | string>
      const delta = alt.score_delta as Record<string, number>
      return {
        text: alt.text as string,
        rationale: alt.rationale as string,
        confidence: alt.confidence as 'HIGH' | 'MEDIUM' | 'LOW',
        scores: {
          cognitiveLoad: scores.cognitive_load as number,
          comprehensionConfidence: scores.comprehension_confidence as number,
          emotionalValence: scores.emotional_valence as number,
          trustCoherence: scores.trust_coherence as number,
          manipulationRisk: scores.manipulation_risk as number,
          cognitiveRisk: scores.cognitive_risk as 'LOW' | 'MEDIUM' | 'HIGH',
        },
        scoreDelta: {
          cognitiveLoad: delta.cognitive_load ?? 0,
          comprehensionConfidence: delta.comprehension_confidence ?? 0,
          trustCoherence: delta.trust_coherence ?? 0,
          manipulationRisk: delta.manipulation_risk ?? 0,
        },
      }
    }),
    modelUsed: data.model_used as string,
    originalScores: request.scores,
    processingTimeMs: data.processing_time_ms as number,
  }
}
