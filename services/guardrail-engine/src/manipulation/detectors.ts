// Per-category NLP heuristic detectors.
// Each detector returns { score: 0–100, evidence: string[] }.
// Scores are signal strengths based on pattern density relative to text length.

interface DetectorResult {
  score: number
  evidence: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sentences(text: string): string[] {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0)
}

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter((w) => w.length > 0)
}

function wordCount(text: string): number {
  return words(text).length
}

// Finds all non-overlapping matches of a regex in text, returns the matched strings
function findMatches(text: string, pattern: RegExp): string[] {
  const matches: string[] = []
  for (const m of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    if (m[0] !== undefined) matches.push(m[0].trim())
  }
  return matches
}

// Score = min(100, hits_per_100_words * sensitivity)
function densityScore(hitCount: number, totalWords: number, sensitivity: number): number {
  if (totalWords === 0) return 0
  return Math.min(100, Math.round((hitCount / totalWords) * 100 * sensitivity))
}

// ── 1. false_urgency ──────────────────────────────────────────────────────────

const URGENCY_PATTERNS = [
  /\bact now\b/,
  /\blimited time\b/,
  /\bonly \d+ (left|remaining|available)\b/,
  /\b(today only|tonight only|this week only)\b/,
  /\bexpires?\s+(in|at|soon|today|tonight)\b/,
  /\blast chance\b/,
  /\bdon'?t miss (out|this)\b/,
  /\bhurry\b/,
  /\bselling (fast|out|quickly)\b/,
  /\b(urgent|urgently)\b/,
  /\bcountdown\b/,
  /\bdeadline\b/,
  /\bnow or never\b/,
  /\bwhile (supplies|stock|seats) last\b/,
  /\btime is running out\b/,
  /\bonly \d+ (hours?|minutes?) (left|remaining)\b/,
  /\blimited (seats?|slots?|spots?|availability)\b/,
  /\bscarce\b/,
  /\b(exclusive|rare) (opportunity|offer|deal|access)\b/,
  /\boffer ends?\b/,
]

export function detectFalseUrgency(text: string): DetectorResult {
  const hits = URGENCY_PATTERNS.flatMap((p) => findMatches(text, p))
  const unique = [...new Set(hits)]
  const score = densityScore(unique.length, wordCount(text), 18)
  return { score, evidence: unique.slice(0, 5) }
}

// ── 2. social_proof_fabrication ───────────────────────────────────────────────

const SOCIAL_PROOF_PATTERNS = [
  /\beveryone (knows?|agrees?|says?|thinks?|is doing)\b/,
  /\b(most|many|all) (people|users|customers|experts|doctors|scientists)\b/,
  /\b\d+[%％] of (people|users|customers|adults|women|men|Americans)\b/,
  /\bmillions? of (people|customers|users|satisfied)\b/,
  /\bjoined by \d+/,
  /\b(leading|top|best-selling|number one|#1) (product|solution|choice|brand)\b/,
  /\bexperts? (agree|recommend|say|confirm)\b/,
  /\bstudies? (show|prove|confirm|suggest)\b/,
  /\bresearch (shows?|proves?|confirms?|suggests?)\b/,
  /\b(proven|clinically (proven|tested|validated))\b/,
  /\bwidely (accepted|known|recognized|used)\b/,
  /\bno one (disputes?|questions?|doubts?)\b/,
  /\bas (everyone|we all) know\b/,
  /\bcommunity (agrees?|supports?|endorses?)\b/,
  /\boverwhelmingly\b/,
  /\bunanimously?\b/,
  /\bconsensus (is|shows?|confirms?)\b/,
  /\btrusted by (millions?|\d+)\b/,
]

export function detectSocialProofFabrication(text: string): DetectorResult {
  const hits = SOCIAL_PROOF_PATTERNS.flatMap((p) => findMatches(text, p))
  const unique = [...new Set(hits)]
  const score = densityScore(unique.length, wordCount(text), 20)
  return { score, evidence: unique.slice(0, 5) }
}

// ── 3. ambiguity_exploitation ─────────────────────────────────────────────────

const HEDGE_PATTERNS = [
  /\b(may|might|could|possibly|perhaps|potentially|arguably)\b/,
  /\b(some|certain|various|several|many|numerous) (people|experts?|sources?|studies?)\b/,
  /\b(it is (said|claimed|believed|thought|reported))\b/,
  /\bunder (certain|some|specific) (circumstances?|conditions?|situations?)\b/,
  /\bmore or less\b/,
  /\bsomewhat\b/,
  /\bin (some|certain|many) (ways?|cases?|respects?)\b/,
  /\bapparently\b/,
  /\bseemingly\b/,
  /\bostensibly\b/,
  /\bup to \d+[%％]\b/,
  /\bas (much as|many as|few as|little as)\b/,
  /\bcan (help|assist|support|improve|boost)\b/,  // wishy-washy benefit claims
  /\bmay (help|assist|support|improve|boost)\b/,
  /\b(results?|outcomes?) (may|might|will|can) vary\b/,
]

export function detectAmbiguityExploitation(text: string): DetectorResult {
  const hedgeHits = HEDGE_PATTERNS.flatMap((p) => findMatches(text, p))
  const hedgeUnique = [...new Set(hedgeHits)]

  // Readability inversion signal: very long sentences + complex words = possible obfuscation
  const sentenceList = sentences(text)
  const avgWordsPerSentence = sentenceList.length > 0
    ? words(text).length / sentenceList.length
    : 0

  // High hedge density OR extremely long/complex sentences
  const hedgeScore = densityScore(hedgeUnique.length, wordCount(text), 14)
  const complexityBonus = avgWordsPerSentence > 35 ? 20 : avgWordsPerSentence > 25 ? 10 : 0
  const score = Math.min(100, hedgeScore + complexityBonus)

  return { score, evidence: hedgeUnique.slice(0, 5) }
}

// ── 4. authority_mimicry ──────────────────────────────────────────────────────

const AUTHORITY_PATTERNS = [
  /\b(as|according to) (a|an|the) (doctor|physician|scientist|expert|professor|specialist|authority|official)\b/,
  /\b(certified|licensed|accredited|board-certified|PhD|MD|JD|MBA|RN|CPA)\b/,
  /\b(official|officially (endorsed|approved|certified|recognized|recommended))\b/,
  /\b(FDA|CDC|WHO|NIH|NASA|FBI|CIA|government|federal|national) (approved|endorsed|certified|confirmed|says?|warns?|recommends?)\b/,
  /\b(leading|world-renowned|internationally recognized|award-winning) (expert|researcher|institution|university)\b/,
  /\bstanford|harvard|mit|oxford|cambridge\b/,
  /\bpeer-reviewed\b/,
  /\bpublished in (the )?[A-Z][a-z]+ (journal|review|quarterly)\b/,
  /\bclinical (trial|study|research|evidence)\b/,
  /\bscientifically (proven|tested|validated|backed)\b/,
  /\bour (team of )?experts?\b/,
  /\bauthorities? (confirm|agree|say|state|warn)\b/,
  /\bindustry (leader|standard|pioneer|authority)\b/,
  /\brecognized by\b/,
  /\baccording to (our|my|the) (research|data|analysis|findings|studies)\b/,
]

export function detectAuthorityMimicry(text: string): DetectorResult {
  const hits = AUTHORITY_PATTERNS.flatMap((p) => findMatches(text, p))
  const unique = [...new Set(hits)]
  // Authority claims aren't inherently manipulative — only high density + other signals
  // Use lower sensitivity baseline; caller may combine with other signals
  const score = densityScore(unique.length, wordCount(text), 16)
  return { score, evidence: unique.slice(0, 5) }
}

// ── 5. sycophantic_drift ──────────────────────────────────────────────────────

const SYCOPHANTIC_PATTERNS = [
  /\b(excellent|great|fantastic|wonderful|brilliant|amazing|outstanding|superb) (point|question|idea|observation|insight|thought)\b/,
  /\byou('re| are) (absolutely|completely|totally|entirely|100%) (right|correct|spot on)\b/,
  /\byou('re| are) so (smart|clever|insightful|perceptive|wise)\b/,
  /\bI (completely|totally|fully|wholeheartedly) (agree|concur|support|endorse)\b/,
  /\bexactly (what|as) (you|I) (said|thought|mentioned|described)\b/,
  /\byou've (hit|nailed|identified) (it|the nail|the issue|the point)\b/,
  /\byour (analysis|observation|point|insight|perspective|view) is (spot on|perfect|excellent|exactly right|completely correct)\b/,
  /\bI couldn'?t agree more\b/,
  /\bmy thoughts? exactly\b/,
  /\bwell said\b/,
  /\bperfectly (said|put|expressed|stated|articulated)\b/,
  /\byou'?re (a genius|so right|so wise|absolutely right)\b/,
  /\bwhat (an? )?(great|excellent|fantastic|brilliant|insightful) (point|observation|question)\b/,
  /\btruly (brilliant|insightful|wise|perceptive)\b/,
  /\bnot only (that|correct|right) but\b/,
]

export function detectSycophancyDrift(text: string): DetectorResult {
  const hits = SYCOPHANTIC_PATTERNS.flatMap((p) => findMatches(text, p))
  const unique = [...new Set(hits)]
  const score = densityScore(unique.length, wordCount(text), 22)
  return { score, evidence: unique.slice(0, 5) }
}

// ── 6. obfuscation ────────────────────────────────────────────────────────────

// Jargon / buzzword density
const JARGON_PATTERNS = [
  /\b(synergy|synergistic)\b/,
  /\b(leverage|leveraging|leveraged)\b/,
  /\b(holistic(ally)?)\b/,
  /\b(paradigm shift)\b/,
  /\b(disruptive innovation)\b/,
  /\b(value proposition)\b/,
  /\b(core competency|competencies)\b/,
  /\b(bandwidth)\b/,  // in metaphorical sense
  /\b(circle back|circling back)\b/,
  /\b(low.hanging fruit)\b/,
  /\b(move (the|that) needle)\b/,
  /\b(boil(ing)? the ocean)\b/,
  /\b(drink(ing)? the Kool.?[Aa]id)\b/,
  /\b(deep dive|deep.dives?)\b/,
  /\b(actionable (insights?|data|steps?))\b/,
  /\b(pivot(ing)?)\b/,
  /\b(scalable (solution|approach|model|framework))\b/,
  /\b(best.in.class)\b/,
  /\b(thought leader(ship)?)\b/,
  /\b(proactive(ly)?)\b/,
  /\b(robust (solution|framework|approach|ecosystem|infrastructure))\b/,
  /\b(seamless(ly)?)\b/,
  /\b(ecosystem)\b/,
  /\b(frictionless)\b/,
]

const PASSIVE_VOICE = /\b(is|are|was|were|be|been|being)\s+(being\s+)?\w+ed\b/g

export function detectObfuscation(text: string): DetectorResult {
  const jargonHits = JARGON_PATTERNS.flatMap((p) => findMatches(text, p))
  const jargonUnique = [...new Set(jargonHits)]

  const sentenceList = sentences(text)
  const wordList = words(text)
  const avgWordsPerSentence = sentenceList.length > 0 ? wordList.length / sentenceList.length : 0

  // Passive voice ratio
  const passiveMatches = [...text.matchAll(PASSIVE_VOICE)]
  const passiveRatio = sentenceList.length > 0 ? passiveMatches.length / sentenceList.length : 0

  // Long words as complexity signal
  const longWords = wordList.filter((w) => w.replace(/[^a-z]/g, '').length > 9)
  const longWordRatio = wordList.length > 0 ? longWords.length / wordList.length : 0

  const jargonScore = densityScore(jargonUnique.length, wordList.length, 14)
  const sentenceComplexityBonus = avgWordsPerSentence > 30 ? 20 : avgWordsPerSentence > 22 ? 10 : 0
  const passiveBonus = passiveRatio > 0.5 ? 15 : passiveRatio > 0.3 ? 8 : 0
  const longWordBonus = longWordRatio > 0.2 ? 10 : 0

  const score = Math.min(100, jargonScore + sentenceComplexityBonus + passiveBonus + longWordBonus)
  const evidence = [...jargonUnique.slice(0, 3), ...(passiveMatches.slice(0, 2).map((m) => m[0] ?? ''))]
    .filter(Boolean)

  return { score, evidence: evidence.slice(0, 5) }
}
