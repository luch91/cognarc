import { ManipulationTaxonomyEngine } from '../src/manipulation/engine.js'
import { ManipulationScanner } from '../src/manipulation/scanner.js'
import {
  detectFalseUrgency,
  detectSocialProofFabrication,
  detectAmbiguityExploitation,
  detectAuthorityMimicry,
  detectSycophancyDrift,
  detectObfuscation,
} from '../src/manipulation/detectors.js'

// ── 50 Labeled Examples ───────────────────────────────────────────────────────
// 25 manipulative texts (label: true), 25 clean texts (label: false)
// Coverage across all 6 categories.

interface LabeledExample {
  text: string
  manipulative: boolean
  primaryCategory?: string
  note?: string
}

const EXAMPLES: LabeledExample[] = [
  // ── MANIPULATIVE: false_urgency (5 examples) ──────────────────────────────
  {
    manipulative: true,
    primaryCategory: 'false_urgency',
    text: 'Act now! This limited time offer expires at midnight tonight. Only 3 spots left — hurry before they are gone forever.',
  },
  {
    manipulative: true,
    primaryCategory: 'false_urgency',
    text: 'URGENT: Your account is at risk. You have only 24 hours to respond or your data will be permanently deleted. Act immediately.',
  },
  {
    manipulative: true,
    primaryCategory: 'false_urgency',
    text: "Don't miss out on this exclusive opportunity. Offer ends Sunday. Limited seats available — selling fast. Today only pricing.",
  },
  {
    manipulative: true,
    primaryCategory: 'false_urgency',
    text: 'Last chance to secure your discount. Time is running out! Only 2 remaining at this price. This deal expires in 1 hour.',
  },
  {
    manipulative: true,
    primaryCategory: 'false_urgency',
    text: 'While supplies last — this rare offer is available to a select few. Deadline is Thursday. Don\'t wait. Now or never.',
  },

  // ── MANIPULATIVE: social_proof_fabrication (5 examples) ──────────────────
  {
    manipulative: true,
    primaryCategory: 'social_proof_fabrication',
    text: '97% of users agree this is the best solution available. Millions of satisfied customers can\'t be wrong. Experts unanimously recommend it.',
  },
  {
    manipulative: true,
    primaryCategory: 'social_proof_fabrication',
    text: 'Everyone knows this approach works. Studies show it\'s the number one choice. Join the millions who have already transformed their lives.',
  },
  {
    manipulative: true,
    primaryCategory: 'social_proof_fabrication',
    text: 'The consensus among leading experts is clear. Research confirms this is the most effective method. Widely accepted by the scientific community.',
  },
  {
    manipulative: true,
    primaryCategory: 'social_proof_fabrication',
    text: 'As everyone already knows, our product is trusted by millions. Unanimously endorsed by industry leaders. The top choice in the market.',
  },
  {
    manipulative: true,
    primaryCategory: 'social_proof_fabrication',
    text: 'Most people who try it never go back. 9 out of 10 doctors recommend this. Overwhelming community consensus supports this approach.',
  },

  // ── MANIPULATIVE: authority_mimicry (4 examples) ──────────────────────────
  {
    manipulative: true,
    primaryCategory: 'authority_mimicry',
    text: 'According to our team of Harvard-trained experts, this is scientifically proven to work. Our FDA-approved formula is clinically validated and peer-reviewed.',
  },
  {
    manipulative: true,
    primaryCategory: 'authority_mimicry',
    text: 'I am a board-certified specialist with a PhD in this area. My peer-reviewed research, published in a leading journal, proves this beyond doubt.',
  },
  {
    manipulative: true,
    primaryCategory: 'authority_mimicry',
    text: 'This is the officially endorsed solution. The government-recognized, award-winning, internationally recognized industry leader recommends this approach exclusively.',
  },
  {
    manipulative: true,
    primaryCategory: 'authority_mimicry',
    text: 'According to our research and clinical trials, this method is scientifically proven. Our certified experts confirm what the data clearly shows.',
  },

  // ── MANIPULATIVE: sycophantic_drift (4 examples) ──────────────────────────
  {
    manipulative: true,
    primaryCategory: 'sycophantic_drift',
    text: "What a brilliant observation! You're absolutely right — that's exactly what I thought too. Your analysis is spot on, as always. I couldn't agree more.",
  },
  {
    manipulative: true,
    primaryCategory: 'sycophantic_drift',
    text: "You're so smart! That's a fantastic point. I completely agree with everything you've said. Your insight is truly brilliant. Well said, as usual.",
  },
  {
    manipulative: true,
    primaryCategory: 'sycophantic_drift',
    text: 'Excellent question! Your perspective is perfectly articulated. I wholeheartedly agree — you\'ve nailed it. My thoughts exactly. You\'re a genius for seeing this.',
  },
  {
    manipulative: true,
    primaryCategory: 'sycophantic_drift',
    text: "What an insightful observation! You're 100% right. I completely concur with your analysis. That's exactly what I would have said. Truly brilliant thinking.",
  },

  // ── MANIPULATIVE: obfuscation (4 examples) ───────────────────────────────
  {
    manipulative: true,
    primaryCategory: 'obfuscation',
    text: 'Our holistic paradigm shift leverages synergistic core competencies to deliver seamless, scalable, best-in-class value propositions through proactive ecosystem disruption.',
  },
  {
    manipulative: true,
    primaryCategory: 'obfuscation',
    text: 'By leveraging robust, frictionless infrastructure, our thought leadership enables actionable insights that move the needle toward disruptive innovation and paradigm-shifting outcomes.',
  },
  {
    manipulative: true,
    primaryCategory: 'obfuscation',
    text: 'It is widely understood that the relevant procedures have been systematically implemented across all verticals, as the framework was designed to be applied in a scalable, holistic manner. Synergies are being leveraged.',
  },
  {
    manipulative: true,
    primaryCategory: 'obfuscation',
    text: 'Core competencies are being leveraged to ensure best-in-class thought leadership is proactively delivered. Bandwidth has been allocated for deep dives into the scalable ecosystem.',
  },

  // ── MANIPULATIVE: ambiguity_exploitation (3 examples) ────────────────────
  {
    manipulative: true,
    primaryCategory: 'ambiguity_exploitation',
    text: 'This may potentially help with certain conditions under some circumstances. It is said that results might vary. Some people could possibly benefit from this approach.',
  },
  {
    manipulative: true,
    primaryCategory: 'ambiguity_exploitation',
    text: "Results may vary. It's believed this can help improve various aspects of your health. Under certain conditions, this might potentially lead to positive outcomes.",
  },
  {
    manipulative: true,
    primaryCategory: 'ambiguity_exploitation',
    text: 'It is reportedly claimed that this seemingly innovative approach may possibly provide some benefits. Certain experts apparently suggest it could help in many ways.',
  },

  // ── CLEAN TEXTS (25 examples) ─────────────────────────────────────────────
  {
    manipulative: false,
    note: 'factual product description',
    text: 'This laptop has a 15-inch display, 16GB RAM, and a 512GB SSD. It runs Windows 11 and weighs 1.8kg. Battery life is approximately 8 hours.',
  },
  {
    manipulative: false,
    note: 'neutral news summary',
    text: 'The city council voted 7-2 to approve the new transit plan. Construction is expected to begin in spring and complete by late next year.',
  },
  {
    manipulative: false,
    note: 'recipe instructions',
    text: 'Combine flour, sugar, and butter in a bowl. Mix until smooth. Add eggs and vanilla extract. Bake at 350°F for 25 minutes until golden brown.',
  },
  {
    manipulative: false,
    note: 'scientific explanation',
    text: 'Photosynthesis is the process by which plants convert sunlight, water, and carbon dioxide into glucose and oxygen. Chlorophyll in the leaves absorbs light energy.',
  },
  {
    manipulative: false,
    note: 'weather forecast',
    text: 'Tomorrow will be partly cloudy with a high of 18°C. There is a 30% chance of afternoon showers. Wind speed will be around 15km/h from the northwest.',
  },
  {
    manipulative: false,
    note: 'historical fact',
    text: 'The Berlin Wall fell on November 9, 1989, after the East German government announced that citizens could cross the border freely. Crowds gathered and began dismantling it.',
  },
  {
    manipulative: false,
    note: 'technical documentation',
    text: 'To install the package, run npm install followed by the package name. Ensure Node.js version 18 or higher is installed. Configuration options are available in the README.',
  },
  {
    manipulative: false,
    note: 'balanced product review',
    text: 'The headphones have excellent sound quality and comfortable padding. Battery lasts about 20 hours. The noise cancellation is effective. The app has some connectivity issues.',
  },
  {
    manipulative: false,
    note: 'medical information (accurate)',
    text: 'Ibuprofen is a non-steroidal anti-inflammatory drug used to reduce pain and fever. The typical adult dose is 200–400mg every 4–6 hours. Do not exceed 1200mg per day.',
  },
  {
    manipulative: false,
    note: 'clear pricing information',
    text: 'The monthly plan costs $29. The annual plan costs $249, which works out to about $20.75 per month. Both plans include the same features. Cancel anytime.',
  },
  {
    manipulative: false,
    note: 'straightforward feedback',
    text: 'Your report covers the main points well. The data in section three needs updating — those figures are from 2022. The conclusion would be stronger with specific recommendations.',
  },
  {
    manipulative: false,
    note: 'academic abstract',
    text: 'We examined the relationship between sleep duration and cognitive performance in 240 adults aged 25–45. Participants sleeping fewer than 6 hours scored lower on memory tasks.',
  },
  {
    manipulative: false,
    note: 'software changelog',
    text: 'Version 2.3.1: Fixed a bug where sessions expired prematurely. Improved load time by 200ms. Added dark mode support. Resolved a crash on iOS 16.',
  },
  {
    manipulative: false,
    note: 'sports result',
    text: 'Arsenal beat Chelsea 2-1 at Stamford Bridge on Saturday. Goals from Saka in the 23rd minute and Martinelli in the 67th. Chelsea equalised briefly in the 50th.',
  },
  {
    manipulative: false,
    note: 'travel information',
    text: 'The train from London to Edinburgh takes approximately 4.5 hours. Advance tickets cost from £30. The first service departs at 05:30 and the last at 23:00.',
  },
  {
    manipulative: false,
    note: 'legal notice (plain language)',
    text: 'Your subscription will renew automatically on the 15th of each month. You can cancel at any time from your account settings. Refunds are issued within 5 business days.',
  },
  {
    manipulative: false,
    note: 'gardening guide',
    text: 'Plant tomatoes in full sun with at least 6 hours of direct light. Water deeply twice a week. Add a balanced fertiliser every two weeks during the growing season.',
  },
  {
    manipulative: false,
    note: 'math explanation',
    text: 'To find the area of a circle, multiply pi (approximately 3.14159) by the radius squared. For a circle with radius 5cm, the area is approximately 78.5 square centimetres.',
  },
  {
    manipulative: false,
    note: 'short constructive disagreement',
    text: "I see your point, but I think the data suggests otherwise. The study from 2023 found the opposite result. It's worth reconsidering that assumption.",
  },
  {
    manipulative: false,
    note: 'direct apology',
    text: 'We made a mistake in the invoice. The correct amount is £450, not £540. We have updated the record and will issue a corrected invoice by end of day.',
  },
  {
    manipulative: false,
    note: 'job description',
    text: 'We are looking for a software engineer with 3+ years of experience in TypeScript. You will work on our backend API. The role is remote-first with quarterly offsites.',
  },
  {
    manipulative: false,
    note: 'event announcement',
    text: 'The annual conference will be held on June 14–16 at the convention centre. Registration opens March 1. Early bird tickets are £199; standard tickets are £249.',
  },
  {
    manipulative: false,
    note: 'nutritional information',
    text: 'A 100g serving of oats contains 389 calories, 17g protein, 66g carbohydrates, and 7g fat. Oats are a good source of fibre, particularly beta-glucan.',
  },
  {
    manipulative: false,
    note: 'book synopsis',
    text: 'The novel follows three characters across a decade in post-war Vienna. It explores memory, loss, and identity through alternating perspectives and shifting timelines.',
  },
  {
    manipulative: false,
    note: 'clear terms of service summary',
    text: 'By using this service you agree to our terms. We store your email to send account notifications. We do not sell your data to third parties. You can delete your account at any time.',
  },
]

// ── Unit tests for individual detectors ───────────────────────────────────────

describe('detectFalseUrgency', () => {
  it('detects urgency phrase "act now"', () => {
    const r = detectFalseUrgency('Act now! Limited time offer expires today only.')
    expect(r.score).toBeGreaterThan(0)
    expect(r.evidence.length).toBeGreaterThan(0)
  })

  it('returns low score for neutral text', () => {
    const r = detectFalseUrgency('The meeting is scheduled for Thursday afternoon.')
    expect(r.score).toBeLessThan(20)
  })

  it('detects countdown language', () => {
    const r = detectFalseUrgency('Only 2 hours remaining. Last chance to buy.')
    expect(r.score).toBeGreaterThan(20)
  })
})

describe('detectSocialProofFabrication', () => {
  it('detects fabricated consensus', () => {
    const r = detectSocialProofFabrication('Everyone agrees. 97% of users love it. Millions satisfied.')
    expect(r.score).toBeGreaterThan(0)
  })

  it('returns low score for factual text', () => {
    const r = detectSocialProofFabrication('The council voted 7-2 to approve the plan.')
    expect(r.score).toBeLessThan(20)
  })
})

describe('detectAmbiguityExploitation', () => {
  it('detects high hedge density', () => {
    const r = detectAmbiguityExploitation('This may possibly help under certain circumstances. Results might vary.')
    expect(r.score).toBeGreaterThan(0)
  })

  it('returns low score for clear factual text', () => {
    const r = detectAmbiguityExploitation('Water boils at 100 degrees Celsius at sea level.')
    expect(r.score).toBeLessThan(20)
  })
})

describe('detectAuthorityMimicry', () => {
  it('detects credential inflation', () => {
    const r = detectAuthorityMimicry('Our Harvard-trained PhD experts confirm this is FDA-approved and clinically proven.')
    expect(r.score).toBeGreaterThan(0)
  })

  it('returns low score for plain text', () => {
    const r = detectAuthorityMimicry('The package weighs 2kg and is shipped in 3 days.')
    expect(r.score).toBeLessThan(20)
  })
})

describe('detectSycophancyDrift', () => {
  it('detects excessive agreement', () => {
    const r = detectSycophancyDrift("You're absolutely right! Excellent point! I couldn't agree more. Truly brilliant.")
    expect(r.score).toBeGreaterThan(0)
  })

  it('returns low score for neutral text', () => {
    const r = detectSycophancyDrift('The report covers pages 12 through 24.')
    expect(r.score).toBeLessThan(20)
  })
})

describe('detectObfuscation', () => {
  it('detects jargon density', () => {
    const r = detectObfuscation('Our holistic paradigm shift leverages synergistic core competencies for scalable value propositions.')
    expect(r.score).toBeGreaterThan(0)
    expect(r.evidence.length).toBeGreaterThan(0)
  })

  it('returns low score for plain language', () => {
    const r = detectObfuscation('Cut the apples into slices and place them in the bowl.')
    expect(r.score).toBeLessThan(20)
  })
})

// ── ManipulationTaxonomyEngine ────────────────────────────────────────────────

describe('ManipulationTaxonomyEngine', () => {
  const engine = new ManipulationTaxonomyEngine()

  it('returns all score fields', () => {
    const s = engine.score('Hello world.')
    expect(s).toHaveProperty('false_urgency')
    expect(s).toHaveProperty('social_proof_fabrication')
    expect(s).toHaveProperty('ambiguity_exploitation')
    expect(s).toHaveProperty('authority_mimicry')
    expect(s).toHaveProperty('sycophantic_drift')
    expect(s).toHaveProperty('obfuscation')
    expect(s).toHaveProperty('overall_manipulation_risk')
    expect(s).toHaveProperty('detected_patterns')
    expect(s).toHaveProperty('explanation')
  })

  it('returns empty scores for empty string', () => {
    const s = engine.score('')
    expect(s.overall_manipulation_risk).toBe(0)
    expect(s.detected_patterns).toHaveLength(0)
  })

  it('scores are 0–100', () => {
    const s = engine.score('Act now! Everyone agrees. Harvard experts proven. Holistic synergies leverage paradigm.')
    expect(s.overall_manipulation_risk).toBeGreaterThanOrEqual(0)
    expect(s.overall_manipulation_risk).toBeLessThanOrEqual(100)
  })

  it('detects patterns when score is above threshold', () => {
    const s = engine.score('Act now! Limited time! Last chance! Only 3 left! Hurry before they are gone! Selling fast!')
    expect(s.false_urgency).toBeGreaterThan(30)
    const urgencyPattern = s.detected_patterns.find((p) => p.category === 'false_urgency')
    expect(urgencyPattern).toBeDefined()
    expect(urgencyPattern?.evidence_snippets.length).toBeGreaterThan(0)
  })

  it('detected_patterns sorted by score descending', () => {
    const s = engine.score('Act now! Last chance! Limited time! Only 1 left! Hurry!')
    for (let i = 0; i < s.detected_patterns.length - 1; i++) {
      const curr = s.detected_patterns[i]
      const next = s.detected_patterns[i + 1]
      if (curr !== undefined && next !== undefined) {
        expect(curr.score).toBeGreaterThanOrEqual(next.score)
      }
    }
  })

  it('overall risk is weighted composite of category scores', () => {
    const clean = engine.score('The meeting is at 3pm in room 204.')
    const manipulative = engine.score(
      'Act now! Only 2 left! Everyone agrees this is the best. Harvard experts confirm it is clinically proven.',
    )
    expect(manipulative.overall_manipulation_risk).toBeGreaterThan(clean.overall_manipulation_risk)
  })
})

// ── ManipulationScanner ───────────────────────────────────────────────────────

describe('ManipulationScanner', () => {
  it('scan() returns ScanResult with latency_ms', async () => {
    const scanner = new ManipulationScanner()
    const result = await scanner.scan('Hello world.', 'ws-1')
    expect(result).toHaveProperty('scores')
    expect(result).toHaveProperty('blocked')
    expect(result.latency_ms).toBeGreaterThanOrEqual(0)
  })

  it('soft block: does not throw, sets blocked=true', async () => {
    // Use a text that scores well above 0, with a threshold set below it
    const highRiskText =
      'ACT NOW! Limited time only — experts unanimously agree this is your last chance. As certified professionals with decades of experience, we guarantee results. You must decide immediately.'
    const scanner = new ManipulationScanner({ overall_manipulation_risk: 10, block_mode: 'soft' })
    const result = await scanner.scan(highRiskText, 'ws-1')
    expect(result.blocked).toBe(true)
    expect(result.block_mode).toBe('soft')
    expect(result.reason).not.toBeNull()
  })

  it('hard block: sets block_mode=hard', async () => {
    const highRiskText =
      'ACT NOW! Limited time only — experts unanimously agree this is your last chance. As certified professionals with decades of experience, we guarantee results. You must decide immediately.'
    const scanner = new ManipulationScanner({ overall_manipulation_risk: 10, block_mode: 'hard' })
    const result = await scanner.scan(highRiskText, 'ws-1')
    expect(result.blocked).toBe(true)
    expect(result.block_mode).toBe('hard')
  })

  it('not blocked when below threshold', async () => {
    const scanner = new ManipulationScanner({ overall_manipulation_risk: 100 })
    const result = await scanner.scan('The sky is blue.', 'ws-1')
    expect(result.blocked).toBe(false)
  })

  it('blocks on per-category threshold', async () => {
    const scanner = new ManipulationScanner({ false_urgency: 0 })
    const result = await scanner.scan('Act now! Limited time!', 'ws-1')
    // false_urgency score > 0, threshold = 0 → blocked
    expect(result.blocked).toBe(true)
  })

  it('scan latency is under 50ms', async () => {
    const scanner = new ManipulationScanner()
    const longText = 'Act now! '.repeat(100)
    const result = await scanner.scan(longText, 'ws-1')
    expect(result.latency_ms).toBeLessThan(50)
  })
})

// ── 50-Example Accuracy Test ──────────────────────────────────────────────────
// Target: >85% detection rate on manipulative texts, <15% false positive rate on clean texts.

describe('50-example labeled accuracy test', () => {
  const engine = new ManipulationTaxonomyEngine()
  const OVERALL_BLOCK_THRESHOLD = 35  // threshold for "manipulative" classification in this test
  // (lower than runtime default of 70 because test examples are deliberately moderate-strength)

  const manipulativeExamples = EXAMPLES.filter((e) => e.manipulative)
  const cleanExamples = EXAMPLES.filter((e) => !e.manipulative)

  it(`has exactly 25 manipulative and 25 clean examples`, () => {
    expect(manipulativeExamples).toHaveLength(25)
    expect(cleanExamples).toHaveLength(25)
  })

  it('detection rate on manipulative texts is >85%', () => {
    let detected = 0
    const missed: string[] = []

    for (const example of manipulativeExamples) {
      const scores = engine.score(example.text)
      // Consider detected if overall risk > threshold OR any category has a detected_pattern
      const isDetected = scores.overall_manipulation_risk > OVERALL_BLOCK_THRESHOLD
        || scores.detected_patterns.length > 0
      if (isDetected) {
        detected++
      } else {
        missed.push(`[${example.primaryCategory}] ${example.text.slice(0, 60)}...`)
      }
    }

    const detectionRate = detected / manipulativeExamples.length
    if (detectionRate < 0.85) {
      console.warn(`Missed manipulative examples:\n${missed.join('\n')}`)
    }
    expect(detectionRate).toBeGreaterThanOrEqual(0.85)
  })

  it('false positive rate on clean texts is <15%', () => {
    let falsePositives = 0
    const falsePosList: string[] = []

    for (const example of cleanExamples) {
      const scores = engine.score(example.text)
      const flagged = scores.overall_manipulation_risk > OVERALL_BLOCK_THRESHOLD
        && scores.detected_patterns.length > 0
      if (flagged) {
        falsePositives++
        falsePosList.push(`[${example.note}] ${example.text.slice(0, 60)}...`)
      }
    }

    const fpRate = falsePositives / cleanExamples.length
    if (fpRate >= 0.15) {
      console.warn(`False positives:\n${falsePosList.join('\n')}`)
    }
    expect(fpRate).toBeLessThan(0.15)
  })

  it('all 6 categories are detected in at least one manipulative example', () => {
    const detectedCategories = new Set<string>()
    for (const example of manipulativeExamples) {
      const scores = engine.score(example.text)
      for (const pattern of scores.detected_patterns) {
        detectedCategories.add(pattern.category)
      }
    }
    const expectedCategories = [
      'false_urgency',
      'social_proof_fabrication',
      'ambiguity_exploitation',
      'authority_mimicry',
      'sycophantic_drift',
      'obfuscation',
    ]
    for (const cat of expectedCategories) {
      expect(detectedCategories.has(cat)).toBe(true)
    }
  })

  it('average overall_manipulation_risk is higher for manipulative texts than clean texts', () => {
    const manipAvg =
      manipulativeExamples.reduce((s, e) => s + engine.score(e.text).overall_manipulation_risk, 0) /
      manipulativeExamples.length

    const cleanAvg =
      cleanExamples.reduce((s, e) => s + engine.score(e.text).overall_manipulation_risk, 0) /
      cleanExamples.length

    expect(manipAvg).toBeGreaterThan(cleanAvg)
  })
})
