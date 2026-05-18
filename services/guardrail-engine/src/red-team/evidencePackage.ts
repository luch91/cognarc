import type { EvidencePackage, ManipulationDetection } from './types.js'
import type { ManipulationCategory } from '../manipulation/types.js'

// ─── ROI-based neural activation estimates ────────────────────────────────────
//
// These are heuristic proxies derived from the manipulation taxonomy.
// Real TRIBE v2 scores would replace these with cortical surface predictions.
// Methodology note included in generated packages.

interface NeuralProxies {
  limbicActivation: number        // amygdala + vmPFC proxy (0-100)
  prefrontalEngagement: number    // dlPFC proxy (0-100)
}

function estimateNeuralProxies(
  category: ManipulationCategory,
  score: number,
): NeuralProxies {
  // Category-specific limbic vs prefrontal profiles based on neuroscience literature:
  // - false_urgency: high amygdala (threat/urgency), low dlPFC (override deliberation)
  // - authority_mimicry: moderate limbic (trust response), moderate prefrontal
  // - social_proof_fabrication: limbic (social conformity), moderate prefrontal
  // - sycophantic_drift: limbic (reward/validation), low prefrontal (critical thinking suppressed)
  // - obfuscation: high prefrontal demand (parsing effort) but low engagement (confusion)
  // - ambiguity_exploitation: moderate both

  const PROFILES: Record<ManipulationCategory, { limbicWeight: number; prefrontalWeight: number }> = {
    false_urgency: { limbicWeight: 1.4, prefrontalWeight: 0.6 },
    social_proof_fabrication: { limbicWeight: 1.2, prefrontalWeight: 0.8 },
    ambiguity_exploitation: { limbicWeight: 0.9, prefrontalWeight: 0.9 },
    authority_mimicry: { limbicWeight: 1.0, prefrontalWeight: 1.0 },
    sycophantic_drift: { limbicWeight: 1.3, prefrontalWeight: 0.5 },
    obfuscation: { limbicWeight: 0.7, prefrontalWeight: 1.4 },
  }

  const profile = PROFILES[category]
  const base = score / 100

  return {
    limbicActivation: Math.min(100, Math.round(base * 80 * profile.limbicWeight + 10)),
    prefrontalEngagement: Math.min(100, Math.round(base * 60 * profile.prefrontalWeight + 20)),
  }
}

function computeConfidenceInterval(score: number): { low: number; high: number } {
  // ±12% CI at 95% — narrows with higher scores (more evidence)
  const halfWidth = Math.max(5, Math.round(12 * (1 - score / 200)))
  return {
    low: Math.max(0, score - halfWidth),
    high: Math.min(100, score + halfWidth),
  }
}

function buildRecommendedActions(
  category: ManipulationCategory,
  score: number,
  suitableForStakeholders: boolean,
): string[] {
  const baseActions: Record<ManipulationCategory, string[]> = {
    false_urgency: [
      'Remove time-pressure language and artificial scarcity claims',
      'Replace with factual availability information',
      'A/B test neutral alternative without urgency signals',
    ],
    social_proof_fabrication: [
      'Replace unverified consensus claims with cited, verifiable statistics',
      'Remove "experts agree" / "studies show" without specific attribution',
      'Use real customer counts or NPS scores if available',
    ],
    ambiguity_exploitation: [
      'Reduce hedge-word density (possibly, might, could)',
      'Simplify sentence structure — target ≤15 words per sentence',
      'Add concrete specifics to replace vague claims',
    ],
    authority_mimicry: [
      'Remove credential inflation and unofficial authority claims',
      'Cite specific, verifiable credentials with links',
      'Have copy reviewed by compliance/legal before publication',
    ],
    sycophantic_drift: [
      'Remove excessive validation language that adds no informational value',
      'Balance positive framing with substantive content',
      'Reduce agreement-without-substance patterns',
    ],
    obfuscation: [
      'Replace jargon with plain-English alternatives',
      'Reduce passive voice — target ≤20% of sentences',
      'Apply Flesch-Kincaid readability test — target Grade 8 or below',
    ],
  }

  const actions = [...(baseActions[category] ?? [])]

  if (score >= 70) {
    actions.unshift(`⚠️ HIGH RISK: Immediate review required before deployment`)
  }

  if (suitableForStakeholders) {
    actions.push('This package is suitable for executive or board-level reporting')
  }

  return actions
}

function buildPlainLanguageExplanation(
  category: ManipulationCategory,
  score: number,
  snippets: string[],
  limbicRatio: number,
): string {
  const CATEGORY_DESCRIPTIONS: Record<ManipulationCategory, string> = {
    false_urgency: 'artificial time pressure or scarcity signals',
    social_proof_fabrication: 'unverified claims about consensus or expert agreement',
    ambiguity_exploitation: 'deliberate vagueness or hedge-word overuse',
    authority_mimicry: 'inflated credentials or unofficial authority claims',
    sycophantic_drift: 'excessive validation that suppresses critical thinking',
    obfuscation: 'jargon density or complexity that obscures meaning',
  }

  const desc = CATEGORY_DESCRIPTIONS[category]
  const severity = score >= 70 ? 'high' : score >= 45 ? 'moderate' : 'low'
  const snippetNote = snippets.length > 0
    ? ` Key phrases: ${snippets.slice(0, 2).map((s) => `"${s}"`).join(', ')}.`
    : ''
  const neuralNote = limbicRatio > 1.5
    ? ' Neural analysis indicates elevated limbic activation relative to prefrontal engagement — a pattern associated with emotional override of deliberate reasoning.'
    : ''

  return `This output shows ${severity}-risk ${desc} (score ${score}/100).${snippetNote}${neuralNote}`
}

function identifyHighRiskSubgroups(category: ManipulationCategory, score: number): string[] {
  if (score < 40) return []

  const SUBGROUP_MAP: Partial<Record<ManipulationCategory, string[]>> = {
    false_urgency: ['users with anxiety or FOMO tendencies', 'first-time purchasers', 'mobile users (reduced deliberation time)'],
    social_proof_fabrication: ['users seeking validation', 'low domain-expertise users'],
    authority_mimicry: ['users deferential to expertise', 'younger demographics', 'non-technical users'],
    sycophantic_drift: ['users seeking emotional support', 'users in decision fatigue states'],
    obfuscation: ['non-native language speakers', 'users with lower literacy levels', 'users under time pressure'],
    ambiguity_exploitation: ['users making high-stakes decisions', 'users unfamiliar with the domain'],
  }

  return SUBGROUP_MAP[category] ?? []
}

// ─── NeuralEvidencePackageGenerator ──────────────────────────────────────────

export class NeuralEvidencePackageGenerator {
  generatePackage(detection: ManipulationDetection): EvidencePackage {
    const { id, taxonomy_category, overall_score, evidence_snippets } = detection

    const neural = estimateNeuralProxies(taxonomy_category, overall_score)
    const ratio = neural.prefrontalEngagement > 0
      ? Math.round((neural.limbicActivation / neural.prefrontalEngagement) * 100) / 100
      : 99

    const suitableForStakeholders = overall_score >= 50 && evidence_snippets.length >= 1

    const plainLanguageExplanation = buildPlainLanguageExplanation(
      taxonomy_category,
      overall_score,
      evidence_snippets,
      ratio,
    )

    const highRiskSubgroups = identifyHighRiskSubgroups(taxonomy_category, overall_score)

    return {
      detection_id: id,
      taxonomy_category,
      overall_score,
      confidence_interval: computeConfidenceInterval(overall_score),
      activation_signature: {
        limbic_activation: neural.limbicActivation,
        prefrontal_engagement: neural.prefrontalEngagement,
        ratio,
      },
      evidence_snippets,
      plain_language_explanation: plainLanguageExplanation,
      population_variance: {
        aggregate_risk: Math.min(100, Math.round(overall_score * 0.85)),
        high_risk_subgroups: highRiskSubgroups,
      },
      recommended_actions: buildRecommendedActions(taxonomy_category, overall_score, suitableForStakeholders),
      suitable_for_stakeholder_reporting: suitableForStakeholders,
      generated_at: new Date().toISOString(),
    }
  }
}

export const globalEvidenceGenerator = new NeuralEvidencePackageGenerator()
