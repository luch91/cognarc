import {
  detectFalseUrgency,
  detectSocialProofFabrication,
  detectAmbiguityExploitation,
  detectAuthorityMimicry,
  detectSycophancyDrift,
  detectObfuscation,
} from './detectors.js'
import type { DetectedPattern, ManipulationCategory, ManipulationScores } from './types.js'

// Weights for the composite score — manipulation categories that are harder to
// explain away legitimately carry more weight.
const WEIGHTS: Record<ManipulationCategory, number> = {
  false_urgency: 0.22,
  social_proof_fabrication: 0.18,
  ambiguity_exploitation: 0.12,
  authority_mimicry: 0.18,
  sycophantic_drift: 0.15,
  obfuscation: 0.15,
}

// Minimum score for a category to emit a DetectedPattern
const DETECTION_THRESHOLD = 30

export class ManipulationTaxonomyEngine {
  score(text: string): ManipulationScores {
    if (text.trim().length === 0) {
      return this.emptyScores()
    }

    const fu = detectFalseUrgency(text)
    const sp = detectSocialProofFabrication(text)
    const ae = detectAmbiguityExploitation(text)
    const am = detectAuthorityMimicry(text)
    const sd = detectSycophancyDrift(text)
    const ob = detectObfuscation(text)

    const categoryScores: Record<ManipulationCategory, number> = {
      false_urgency: fu.score,
      social_proof_fabrication: sp.score,
      ambiguity_exploitation: ae.score,
      authority_mimicry: am.score,
      sycophantic_drift: sd.score,
      obfuscation: ob.score,
    }

    const overall = Math.min(
      100,
      Math.round(
        Object.entries(WEIGHTS).reduce(
          (sum, [cat, weight]) => sum + (categoryScores[cat as ManipulationCategory] ?? 0) * weight,
          0,
        ),
      ),
    )

    const detectorResults: Record<ManipulationCategory, { score: number; evidence: string[] }> = {
      false_urgency: fu,
      social_proof_fabrication: sp,
      ambiguity_exploitation: ae,
      authority_mimicry: am,
      sycophantic_drift: sd,
      obfuscation: ob,
    }

    const detected_patterns: DetectedPattern[] = []
    for (const [cat, result] of Object.entries(detectorResults)) {
      if (result.score >= DETECTION_THRESHOLD) {
        detected_patterns.push({
          category: cat as ManipulationCategory,
          score: result.score,
          evidence_snippets: result.evidence,
          explanation: buildExplanation(cat as ManipulationCategory, result.score, result.evidence),
        })
      }
    }

    detected_patterns.sort((a, b) => b.score - a.score)

    const explanation = buildSummaryExplanation(overall, detected_patterns)

    return {
      ...categoryScores,
      overall_manipulation_risk: overall,
      detected_patterns,
      explanation,
    }
  }

  private emptyScores(): ManipulationScores {
    return {
      false_urgency: 0,
      social_proof_fabrication: 0,
      ambiguity_exploitation: 0,
      authority_mimicry: 0,
      sycophantic_drift: 0,
      obfuscation: 0,
      overall_manipulation_risk: 0,
      detected_patterns: [],
      explanation: 'No text provided.',
    }
  }
}

function buildExplanation(
  category: ManipulationCategory,
  score: number,
  evidence: string[],
): string {
  const LABELS: Record<ManipulationCategory, string> = {
    false_urgency: 'Artificial time pressure or scarcity signals detected',
    social_proof_fabrication: 'Unverified consensus or fabricated social proof detected',
    ambiguity_exploitation: 'High hedge-word density or deliberate vagueness detected',
    authority_mimicry: 'Credential inflation or unofficial authority claims detected',
    sycophantic_drift: 'Excessive validation or agreement without substantive content detected',
    obfuscation: 'High jargon density, passive voice overuse, or complexity concealing meaning detected',
  }
  const label = LABELS[category]
  const snippets = evidence.length > 0 ? ` Phrases: "${evidence.slice(0, 2).join('", "')}"` : ''
  return `${label} (score ${score}).${snippets}`
}

function buildSummaryExplanation(overall: number, patterns: DetectedPattern[]): string {
  if (patterns.length === 0) return `No significant manipulation signals detected (overall risk: ${overall}).`
  const topCats = patterns.slice(0, 3).map((p) => p.category.replace(/_/g, ' ')).join(', ')
  return `Manipulation risk ${overall}/100. Primary signals: ${topCats}.`
}
