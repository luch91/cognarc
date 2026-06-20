import type { ExtractResponse, ContentSection } from './urlExtractorApi'
import type { CognitivRisk } from './types.js'

export interface SectionScores {
  cognitiveLoad: number
  comprehensionConfidence: number
  trustCoherence: number
  manipulationRisk: number
  cognitiveRisk: CognitivRisk
}

export interface ScoredSection extends ContentSection {
  scores: SectionScores | null
}

export interface PageScoringResult {
  url: string
  pageTitle: string
  overallScores: SectionScores
  scoredSections: ScoredSection[]
  worstSection: ScoredSection | null
  warning: string | null
}

const WEIGHTS: Record<string, number> = {
  hero: 3, cta: 2, value_prop: 2, feature: 1.5, headline: 1, body: 1, meta: 0.5,
}

export async function scorePage(
  extraction: ExtractResponse,
  workspaceId: string
): Promise<PageScoringResult> {
  const scoredSections: ScoredSection[] = await Promise.all(
    extraction.sections.map(async (section) => {
      if (!section.scoreThis) {
        return { ...section, scores: null }
      }
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stimulus_type: 'text',
            content: section.text,
            workspace_id: workspaceId,
            options: { manipulation_check: true },
          }),
        })
        const data = await res.json()
        return {
          ...section,
          scores: {
            cognitiveLoad: data.cognitive_load,
            comprehensionConfidence: data.comprehension_confidence,
            trustCoherence: data.trust_coherence,
            manipulationRisk: data.manipulation_risk,
            cognitiveRisk: data.cognitive_risk,
          },
        }
      } catch {
        return { ...section, scores: null }
      }
    })
  )

  let totalWeight = 0
  let sumLoad = 0, sumComp = 0, sumTrust = 0, sumManip = 0

  for (const section of scoredSections) {
    if (!section.scores) continue
    const w = WEIGHTS[section.sectionType] ?? 1
    totalWeight += w
    sumLoad += section.scores.cognitiveLoad * w
    sumComp += section.scores.comprehensionConfidence * w
    sumTrust += section.scores.trustCoherence * w
    sumManip += section.scores.manipulationRisk * w
  }

  const overallScores: SectionScores = totalWeight > 0 ? {
    cognitiveLoad: Math.round(sumLoad / totalWeight),
    comprehensionConfidence: Math.round(sumComp / totalWeight),
    trustCoherence: Math.round(sumTrust / totalWeight),
    manipulationRisk: Math.round(sumManip / totalWeight),
    cognitiveRisk: (sumManip / totalWeight > 60 || sumLoad / totalWeight > 70)
      ? 'HIGH'
      : (sumManip / totalWeight > 40 || sumLoad / totalWeight > 55)
        ? 'MEDIUM'
        : 'LOW',
  } : {
    cognitiveLoad: 50, comprehensionConfidence: 50,
    trustCoherence: 50, manipulationRisk: 50, cognitiveRisk: 'MEDIUM',
  }

  const scoredOnly = scoredSections.filter(s => s.scores !== null)
  const worstSection = scoredOnly.length > 0
    ? scoredOnly.reduce((worst, s) =>
        (s.scores!.manipulationRisk + s.scores!.cognitiveLoad) >
        (worst.scores!.manipulationRisk + worst.scores!.cognitiveLoad)
          ? s : worst
      )
    : null

  return {
    url: extraction.url,
    pageTitle: extraction.pageTitle,
    overallScores,
    scoredSections,
    worstSection,
    warning: extraction.warning,
  }
}
