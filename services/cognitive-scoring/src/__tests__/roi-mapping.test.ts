import { extractROIActivation, normaliseActivation, DEFAULT_ROI_MAP } from '../tribe/roi-mapping.js'

describe('ROI mapping', () => {
  test('extractROIActivation returns mean of specified vertex ranges', () => {
    const activations = new Array(20484).fill(0)
    // Set dlPFC range (1200-1800) to 1.0
    for (let i = 1200; i <= 1800; i++) activations[i] = 1.0
    const result = extractROIActivation(activations, DEFAULT_ROI_MAP.cognitive_load)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(1.0)
  })

  test('extractROIActivation returns 0 for all-zero activations', () => {
    const activations = new Array(20484).fill(0)
    expect(extractROIActivation(activations, DEFAULT_ROI_MAP.cognitive_load)).toBe(0)
  })

  test('normaliseActivation maps 0 to ~50 (sigmoid midpoint)', () => {
    const result = normaliseActivation(0)
    expect(result).toBe(50)
  })

  test('normaliseActivation clamps to 0-100', () => {
    expect(normaliseActivation(100)).toBe(100)
    expect(normaliseActivation(-100)).toBe(0)
  })

  test('DEFAULT_ROI_MAP covers all four cognitive dimensions', () => {
    expect(DEFAULT_ROI_MAP.cognitive_load.length).toBeGreaterThan(0)
    expect(DEFAULT_ROI_MAP.comprehension_confidence.length).toBeGreaterThan(0)
    expect(DEFAULT_ROI_MAP.emotional_valence.length).toBeGreaterThan(0)
    expect(DEFAULT_ROI_MAP.trust_coherence.length).toBeGreaterThan(0)
  })

  test('higher dlPFC activation produces higher cognitive_load score', () => {
    const low = new Array(20484).fill(0)
    const high = new Array(20484).fill(0)
    for (let i = 1200; i <= 1800; i++) high[i] = 2.0

    const lowScore = normaliseActivation(extractROIActivation(low, DEFAULT_ROI_MAP.cognitive_load))
    const highScore = normaliseActivation(extractROIActivation(high, DEFAULT_ROI_MAP.cognitive_load))
    expect(highScore).toBeGreaterThan(lowScore)
  })
})
