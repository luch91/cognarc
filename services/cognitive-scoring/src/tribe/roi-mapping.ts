// ROI mapping: fsaverage5 vertex indices → CognArc cognitive scores.
// fsaverage5 mesh has ~20,484 vertices (10,242 per hemisphere).
// Vertex ranges are approximate anatomical parcellations based on
// the Desikan-Killiany atlas projected to fsaverage5 surface.
// Researchers can adjust these ranges to refine mapping.

export interface ROIDefinition {
  name: string
  description: string
  // Vertex index ranges [start, end] (inclusive). Multiple ranges per region.
  vertex_ranges: Array<[number, number]>
  hemisphere: 'left' | 'right' | 'bilateral'
}

export interface CognitiveROIMap {
  cognitive_load: ROIDefinition[]
  comprehension_confidence: ROIDefinition[]
  emotional_valence: ROIDefinition[]
  trust_coherence: ROIDefinition[]
}

// Default ROI map. Override by passing a custom map to TRIBEAdapter constructor.
export const DEFAULT_ROI_MAP: Readonly<CognitiveROIMap> = {
  // cognitive_load ← dorsolateral prefrontal cortex + anterior cingulate cortex
  cognitive_load: [
    {
      name: 'dorsolateral prefrontal cortex',
      description: 'Working memory, executive function, cognitive control',
      vertex_ranges: [[1200, 1800], [11442, 12042]],
      hemisphere: 'bilateral',
    },
    {
      name: 'anterior cingulate cortex',
      description: 'Conflict monitoring, cognitive load gating',
      vertex_ranges: [[800, 1100], [11040, 11340]],
      hemisphere: 'bilateral',
    },
  ],

  // comprehension_confidence ← left temporal language network (Wernicke's area)
  comprehension_confidence: [
    {
      name: "Wernicke's area",
      description: 'Language comprehension, semantic processing',
      vertex_ranges: [[3200, 3900]],
      hemisphere: 'left',
    },
    {
      name: 'left superior temporal gyrus',
      description: 'Auditory language processing, phonological decoding',
      vertex_ranges: [[2900, 3500]],
      hemisphere: 'left',
    },
  ],

  // emotional_valence ← limbic system (amygdala + ventromedial PFC)
  emotional_valence: [
    {
      name: 'amygdala',
      description: 'Emotional salience, threat detection, affective processing',
      // Amygdala is subcortical; approximate surface projection
      vertex_ranges: [[4200, 4500], [14442, 14742]],
      hemisphere: 'bilateral',
    },
    {
      name: 'ventromedial prefrontal cortex',
      description: 'Emotional valuation, reward processing',
      vertex_ranges: [[600, 900], [10840, 11140]],
      hemisphere: 'bilateral',
    },
  ],

  // trust_coherence ← medial PFC + posterior cingulate (default mode network)
  trust_coherence: [
    {
      name: 'medial prefrontal cortex',
      description: 'Self-referential processing, social cognition, trust evaluation',
      vertex_ranges: [[400, 750], [10640, 10990]],
      hemisphere: 'bilateral',
    },
    {
      name: 'posterior cingulate cortex',
      description: 'Default mode network hub, narrative coherence',
      vertex_ranges: [[5100, 5600], [15342, 15842]],
      hemisphere: 'bilateral',
    },
  ],
}

/**
 * Extract mean activation for a set of ROI vertex ranges from a flat activation array.
 * The activation array is the raw fsaverage5 cortical surface output from TRIBE v2.
 */
export function extractROIActivation(
  activations: Float32Array | number[],
  rois: ROIDefinition[],
): number {
  let sum = 0
  let count = 0
  for (const roi of rois) {
    for (const [start, end] of roi.vertex_ranges) {
      for (let v = start; v <= end && v < activations.length; v++) {
        sum += activations[v] ?? 0
        count++
      }
    }
  }
  return count > 0 ? sum / count : 0
}

/**
 * Normalise a raw activation value (arbitrary float) to 0-100 range.
 * Uses sigmoid-like normalisation centred on the empirical TRIBE v2 baseline.
 */
export function normaliseActivation(raw: number, baseline = 0.0, scale = 2.0): number {
  const shifted = (raw - baseline) / scale
  const sigmoid = 1 / (1 + Math.exp(-shifted))
  return Math.max(0, Math.min(100, Math.round(sigmoid * 100)))
}
