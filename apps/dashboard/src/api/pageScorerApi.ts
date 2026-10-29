import type { ExtractResponse, ContentSection } from './urlExtractorApi'
import type { CognitivRisk } from './types.js'
import { scoreText } from './scoringApi.js'
import type { ScoringProvenance } from '@cognarc/types'

export interface SectionScores {
  cognitiveLoad: number
  comprehensionConfidence: number
  trustCoherence: number
  manipulationRisk: number
  cognitiveRisk: CognitivRisk
}

export interface ScoredSection extends ContentSection {
  scores: SectionScores | null
  scoring_provenance?: ScoringProvenance
}

export interface PageScoringResult {
  url: string
  pageTitle: string
  overallScores: SectionScores
  scoredSections: ScoredSection[]
  worstSection: ScoredSection | null
  warning: string | null
  scoring_provenance: ScoringProvenance
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
        const data = await scoreText(section.text, workspaceId)
        return {
          ...section,
          scores: {
            cognitiveLoad: data.cognitive_load,
            comprehensionConfidence: data.comprehension_confidence,
            trustCoherence: data.trust_coherence,
            manipulationRisk: data.manipulation_risk,
            cognitiveRisk: data.cognitive_risk,
          },
          scoring_provenance: data.scoring_provenance,
        }
      } catch {
        return { ...section, scores: null }
      }
    })
  )

  const scorableSections = scoredSections.filter(section => section.scores !== null)
  if (!scorableSections.length) {
    throw new Error('No page sections were scored. Evaluation is unavailable, not a neutral score.')
  }
  const provenance = scorableSections[0]!.scoring_provenance!
  if (scorableSections.some(section => section.scoring_provenance?.engine !== provenance.engine ||
      section.scoring_provenance?.calibration_status !== provenance.calibration_status)) {
    throw new Error('Page results contain incompatible scoring engines. Retry as a single evaluation.')
  }
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
  } : (() => { throw new Error('No validated page scores are available') })()

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
    warning: scoredSections.some(section => section.scoreThis && !section.scores)
      ? [extraction.warning, 'Some page sections failed scoring and were excluded.'].filter(Boolean).join(' ') : extraction.warning,
    scoring_provenance: provenance,
  }
}
