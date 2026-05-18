import { TrainingExamplePipeline, makeSession } from '../fine-tuning/trainingExamplePipeline.js'
import { FineTuningRunRecommender } from '../fine-tuning/runRecommender.js'
import {
  HumanApprovalGate,
  HashMismatchError,
  ParameterOutOfBoundsError,
  ApprovalRejectedError,
  UnapprovedRunError,
} from '../fine-tuning/humanApprovalGate.js'
import { PostRunValidator, QuarantinedModelError, setPhase1Baseline } from '../fine-tuning/postRunValidator.js'
import { FineTuningGovernanceAudit } from '../fine-tuning/governanceAudit.js'
import type { TrainingConfig, BenchmarkResult, ApprovalPayload } from '../fine-tuning/types.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAFE_PARAMS: TrainingConfig = {
  learning_rate: 2e-5,
  epochs: 3,
  batch_size: 32,
  warmup_steps: 100,
  max_gradient_norm: 1.0,
}

const GOOD_BENCHMARK: BenchmarkResult = {
  pearson_r: 0.84,
  mae: 3.2,
  rmse: 4.1,
  n_samples: 500,
  dimensions: { cognitive_load: 0.83, trust_coherence: 0.85 },
}

const POOR_BENCHMARK: BenchmarkResult = {
  pearson_r: 0.62,
  mae: 8.5,
  rmse: 10.2,
  n_samples: 500,
  dimensions: { cognitive_load: 0.60, trust_coherence: 0.64 },
}

// Build a pipeline pre-loaded with N examples (for recommender tests)
function buildPipeline(count: number): TrainingExamplePipeline {
  const pipeline = new TrainingExamplePipeline()
  for (let i = 0; i < count; i++) {
    pipeline.enqueue(makeSession({ workspace_id: `ws-${i % 20}` }))
  }
  return pipeline
}

// ─── TrainingExamplePipeline ──────────────────────────────────────────────────

describe('TrainingExamplePipeline', () => {
  let pipeline: TrainingExamplePipeline

  beforeEach(() => {
    pipeline = new TrainingExamplePipeline()
    pipeline._clearQueue()
  })

  it('enqueues a valid session and returns a TrainingExample', () => {
    const session = makeSession()
    const example = pipeline.enqueue(session)
    expect(example.session_id).toBe(session.session_id)
    expect(example.event_count).toBe(5)
    expect(example.payload_hash).toBeDefined()
    expect(pipeline.queueSize()).toBe(1)
  })

  it('rejects session with fewer than 5 behavioral events', () => {
    const session = makeSession({}, 3)
    expect(() => pipeline.enqueue(session)).toThrow('minimum is 5')
  })

  it('rejects session with NaN alignment_score', () => {
    const session = makeSession({ alignment_score: NaN })
    expect(() => pipeline.enqueue(session)).toThrow('alignment_score')
  })

  it('queue is append-only: readQueue returns all enqueued examples', () => {
    pipeline.enqueue(makeSession())
    pipeline.enqueue(makeSession())
    expect(pipeline.readQueue()).toHaveLength(2)
  })

  it('computeDataHash is deterministic for same queue', () => {
    const session = makeSession()
    const p1 = new TrainingExamplePipeline()
    const p2 = new TrainingExamplePipeline()
    const ex = p1.enqueue(session)
    // Manually add same example to p2 queue via enqueue with matching payload
    p2.enqueue(session)
    // Different sessions produce different hashes
    expect(p1.computeDataHash()).toBe(p2.computeDataHash())
  })
})

// ─── FineTuningRunRecommender ─────────────────────────────────────────────────

describe('FineTuningRunRecommender', () => {
  let recommender: FineTuningRunRecommender

  beforeEach(() => {
    recommender = new FineTuningRunRecommender()
    new TrainingExamplePipeline()._clearQueue()
  })

  it('returns null when queue is below 10,000', () => {
    const pipeline = buildPipeline(100)
    const result = recommender.checkAndRecommend(pipeline.readQueue())
    expect(result).toBeNull()
  })

  it('creates a recommendation when queue reaches 10,000', () => {
    const pipeline = buildPipeline(10_000)
    const rec = recommender.checkAndRecommend(pipeline.readQueue())
    expect(rec).not.toBeNull()
    expect(rec!.example_count).toBe(10_000)
    expect(rec!.status).toBe('pending')
    expect(rec!.training_data_hash).toBeDefined()
  })

  it('recommendation includes diversity metrics', () => {
    const pipeline = buildPipeline(10_000)
    const rec = recommender.checkAndRecommend(pipeline.readQueue())!
    expect(rec.diversity_metrics.workspace_count).toBeGreaterThan(0)
    expect(typeof rec.diversity_metrics.alignment_score_stddev).toBe('number')
    expect(rec.diversity_metrics.event_type_coverage).toBeGreaterThan(0)
  })

  it('recommendation includes cost and accuracy estimates', () => {
    const pipeline = buildPipeline(10_000)
    const rec = recommender.checkAndRecommend(pipeline.readQueue())!
    expect(rec.estimated_compute_cost_usd).toBeGreaterThan(0)
    expect(rec.estimated_accuracy_improvement).toBeGreaterThan(0)
  })

  it('does NOT execute a run — only creates a recommendation', () => {
    const pipeline = buildPipeline(10_000)
    const rec = recommender.checkAndRecommend(pipeline.readQueue())!
    // The recommender never has an "execute" method — structural guarantee
    expect(rec.status).toBe('pending')
  })
})

// ─── HumanApprovalGate — REJECTION PATHS FIRST ───────────────────────────────

describe('HumanApprovalGate', () => {
  let gate: HumanApprovalGate
  let recommender: FineTuningRunRecommender

  beforeEach(() => {
    gate = new HumanApprovalGate()
    gate._clearApprovals()
    recommender = new FineTuningRunRecommender()
    recommender._clearRecommendations()
    new TrainingExamplePipeline()._clearQueue()
  })

  function makeRecommendation(exampleCount = 10_000) {
    const pipeline = buildPipeline(exampleCount)
    const rec = recommender.checkAndRecommend(pipeline.readQueue())!
    return rec
  }

  it('REJECT: data hash mismatch throws HashMismatchError', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: 'wrong_hash_completely',
      approved_parameters: SAFE_PARAMS,
      expected_accuracy_impact: '+2% Pearson r',
    }
    expect(() => gate.approve_run(rec, 'ml-lead-1', payload)).toThrow(HashMismatchError)
  })

  it('REJECT: hash mismatch error message names both hashes', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: 'bad_hash',
      approved_parameters: SAFE_PARAMS,
      expected_accuracy_impact: '+2%',
    }
    try {
      gate.approve_run(rec, 'ml-lead-1', payload)
    } catch (e) {
      expect(e).toBeInstanceOf(HashMismatchError)
      expect((e as HashMismatchError).message).toMatch(/bad_hash/)
      expect((e as HashMismatchError).message).toMatch(rec.training_data_hash)
    }
  })

  it('REJECT: learning_rate too high throws ParameterOutOfBoundsError', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: { ...SAFE_PARAMS, learning_rate: 0.1 },
      expected_accuracy_impact: '+2%',
    }
    expect(() => gate.approve_run(rec, 'ml-lead-1', payload)).toThrow(ParameterOutOfBoundsError)
  })

  it('REJECT: learning_rate too low throws ParameterOutOfBoundsError', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: { ...SAFE_PARAMS, learning_rate: 1e-9 },
      expected_accuracy_impact: '+2%',
    }
    expect(() => gate.approve_run(rec, 'ml-lead-1', payload)).toThrow(ParameterOutOfBoundsError)
  })

  it('REJECT: epochs > 10 throws ParameterOutOfBoundsError', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: { ...SAFE_PARAMS, epochs: 50 },
      expected_accuracy_impact: '+2%',
    }
    expect(() => gate.approve_run(rec, 'ml-lead-1', payload)).toThrow(ParameterOutOfBoundsError)
  })

  it('REJECT: batch_size < 8 throws ParameterOutOfBoundsError', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: { ...SAFE_PARAMS, batch_size: 4 },
      expected_accuracy_impact: '+2%',
    }
    expect(() => gate.approve_run(rec, 'ml-lead-1', payload)).toThrow(ParameterOutOfBoundsError)
  })

  it('REJECT: max_gradient_norm > 5.0 throws ParameterOutOfBoundsError', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: { ...SAFE_PARAMS, max_gradient_norm: 10.0 },
      expected_accuracy_impact: '+2%',
    }
    expect(() => gate.approve_run(rec, 'ml-lead-1', payload)).toThrow(ParameterOutOfBoundsError)
  })

  it('REJECT: approving a non-pending recommendation throws ApprovalRejectedError', () => {
    const rec = makeRecommendation()
    rec.status = 'approved'  // simulate already-approved
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: SAFE_PARAMS,
      expected_accuracy_impact: '+2%',
    }
    expect(() => gate.approve_run(rec, 'ml-lead-1', payload)).toThrow(ApprovalRejectedError)
  })

  it('HAPPY PATH: valid approval creates an ApprovedRun', () => {
    const rec = makeRecommendation()
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: SAFE_PARAMS,
      expected_accuracy_impact: '+2% Pearson r',
    }
    const run = gate.approve_run(rec, 'ml-lead-1', payload)
    expect(run.id).toBeDefined()
    expect(run.ml_lead_id).toBe('ml-lead-1')
    expect(run.status).toBe('approved')
    expect(gate.isApproved(run.id)).toBe(true)
  })

  it('isApproved returns false for unknown run IDs', () => {
    expect(gate.isApproved('nonexistent-run-id')).toBe(false)
  })
})

// ─── PostRunValidator ─────────────────────────────────────────────────────────

describe('PostRunValidator', () => {
  let gate: HumanApprovalGate
  let audit: FineTuningGovernanceAudit
  let validator: PostRunValidator
  let recommender: FineTuningRunRecommender

  beforeEach(() => {
    gate = new HumanApprovalGate()
    gate._clearApprovals()
    audit = new FineTuningGovernanceAudit()
    audit._clearRecords()
    validator = new PostRunValidator(gate, audit)
    validator._clearReports()
    recommender = new FineTuningRunRecommender()
    recommender._clearRecommendations()
    new TrainingExamplePipeline()._clearQueue()
    setPhase1Baseline(0.85)
  })

  function makeApprovedRun() {
    const pipeline = buildPipeline(10_000)
    const rec = recommender.checkAndRecommend(pipeline.readQueue())!
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: SAFE_PARAMS,
      expected_accuracy_impact: '+2%',
    }
    return gate.approve_run(rec, 'ml-lead-1', payload)
  }

  it('REJECT: validateRun throws UnapprovedRunError for unknown run IDs', () => {
    expect(() => validator.validateRun('no-approval', GOOD_BENCHMARK)).toThrow(UnapprovedRunError)
  })

  it('REJECT: validateRun without approval — error message says human approval required', () => {
    try {
      validator.validateRun('missing-id', GOOD_BENCHMARK)
    } catch (e) {
      expect((e as Error).message).toMatch(/human approval/)
    }
  })

  it('QUARANTINE: Pearson r below 0.70 quarantines model', () => {
    const run = makeApprovedRun()
    const report = validator.validateRun(run.id, POOR_BENCHMARK)
    expect(report.quarantined).toBe(true)
    expect(report.status).toBe('quarantined')
    expect(report.quarantine_reason).toMatch(/below quarantine threshold/)
  })

  it('QUARANTINE: exactly at threshold 0.70 is NOT quarantined', () => {
    const run = makeApprovedRun()
    const atThreshold: BenchmarkResult = { ...GOOD_BENCHMARK, pearson_r: 0.70 }
    const report = validator.validateRun(run.id, atThreshold)
    expect(report.quarantined).toBe(false)
  })

  it('QUARANTINE: run status is set to quarantined in approval gate', () => {
    const run = makeApprovedRun()
    validator.validateRun(run.id, POOR_BENCHMARK)
    expect(gate.getApprovedRun(run.id)!.status).toBe('quarantined')
  })

  it('HAPPY PATH: Pearson r ≥ 0.70 produces pending_promotion report', () => {
    const run = makeApprovedRun()
    const report = validator.validateRun(run.id, GOOD_BENCHMARK)
    expect(report.quarantined).toBe(false)
    expect(report.status).toBe('pending_promotion')
    expect(report.delta).toBeCloseTo(GOOD_BENCHMARK.pearson_r - 0.85, 3)
  })

  it('REJECT: promoting a quarantined model throws QuarantinedModelError', () => {
    const run = makeApprovedRun()
    validator.validateRun(run.id, POOR_BENCHMARK)
    expect(() =>
      validator.promoteModel(run.id, { promoting_human_id: 'ml-lead-2', notes: 'promote' }),
    ).toThrow(QuarantinedModelError)
  })

  it('REJECT: promoting without a report throws an error', () => {
    const run = makeApprovedRun()
    expect(() =>
      validator.promoteModel(run.id, { promoting_human_id: 'ml-lead-2', notes: 'promote' }),
    ).toThrow(/No validation report/)
  })

  it('HAPPY PATH: promoteModel sets status to promoted', () => {
    const run = makeApprovedRun()
    validator.validateRun(run.id, GOOD_BENCHMARK)
    const report = validator.promoteModel(run.id, { promoting_human_id: 'ml-lead-2', notes: 'LGTM' })
    expect(report.status).toBe('promoted')
  })
})

// ─── FineTuningGovernanceAudit ────────────────────────────────────────────────

describe('FineTuningGovernanceAudit', () => {
  let gate: HumanApprovalGate
  let audit: FineTuningGovernanceAudit
  let validator: PostRunValidator
  let recommender: FineTuningRunRecommender

  beforeEach(() => {
    gate = new HumanApprovalGate()
    gate._clearApprovals()
    audit = new FineTuningGovernanceAudit()
    audit._clearRecords()
    validator = new PostRunValidator(gate, audit)
    validator._clearReports()
    recommender = new FineTuningRunRecommender()
    recommender._clearRecommendations()
    new TrainingExamplePipeline()._clearQueue()
    setPhase1Baseline(0.85)
  })

  function approveAndValidate(benchmarkOverride?: Partial<BenchmarkResult>) {
    const pipeline = buildPipeline(10_000)
    const rec = recommender.checkAndRecommend(pipeline.readQueue())!
    const payload: ApprovalPayload = {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: SAFE_PARAMS,
      expected_accuracy_impact: '+2%',
    }
    const run = gate.approve_run(rec, 'ml-lead-1', payload)
    audit.recordApproval(run)
    const benchmark = { ...GOOD_BENCHMARK, ...benchmarkOverride }
    const report = validator.validateRun(run.id, benchmark)
    return { run, report }
  }

  it('records governance entry on approval', () => {
    const { run } = approveAndValidate()
    const records = audit.getRecordsForRun(run.id)
    expect(records.length).toBeGreaterThan(0)
    expect(records[0]!.ml_lead_id).toBe('ml-lead-1')
    expect(records[0]!.data_hash).toBeDefined()
    expect(records[0]!.decision).toBe('approved')
  })

  it('governance record is frozen — cannot be modified', () => {
    const { run } = approveAndValidate()
    const records = audit.getRecordsForRun(run.id)
    const record = records[0]!
    expect(() => {
      ;(record as Record<string, unknown>)['ml_lead_id'] = 'hacker'
    }).toThrow(TypeError)
  })

  it('records quarantine event in governance trail', () => {
    const { run } = approveAndValidate({ pearson_r: 0.60 })
    const records = audit.getRecordsForRun(run.id)
    const quarantineRecord = records.find((r) => r.decision === 'quarantined')
    expect(quarantineRecord).toBeDefined()
    expect(quarantineRecord!.post_accuracy).toBeCloseTo(0.60, 2)
  })

  it('promotion appends a governance record with promoting_human_id', () => {
    const { run } = approveAndValidate()
    validator.promoteModel(run.id, { promoting_human_id: 'ml-lead-2', notes: 'LGTM' })
    const records = audit.getRecordsForRun(run.id)
    const promoRecord = records.find((r) => r.decision === 'promoted')
    expect(promoRecord).toBeDefined()
    expect(promoRecord!.promoting_human_id).toBe('ml-lead-2')
  })

  it('governance records contain data provenance, parameters, pre/post accuracy', () => {
    const { run } = approveAndValidate()
    const records = audit.getRecordsForRun(run.id)
    const validationRecord = records.find((r) => r.post_accuracy !== null)
    expect(validationRecord).toBeDefined()
    expect(validationRecord!.data_hash).toBeDefined()
    expect(validationRecord!.training_parameters).toBeDefined()
    expect(typeof validationRecord!.pre_accuracy).toBe('number')
    expect(typeof validationRecord!.post_accuracy).toBe('number')
  })
})

// ─── Full pipeline integration ─────────────────────────────────────────────────

describe('Full fine-tuning pipeline integration', () => {
  beforeEach(() => {
    new TrainingExamplePipeline()._clearQueue()
    setPhase1Baseline(0.85)
  })

  it('happy path: enqueue → recommend → approve → validate → promote', () => {
    const pipeline = buildPipeline(10_000)
    expect(pipeline.queueSize()).toBe(10_000)

    const recommender = new FineTuningRunRecommender()
    const rec = recommender.checkAndRecommend(pipeline.readQueue())!
    expect(rec.status).toBe('pending')

    const gate = new HumanApprovalGate()
    const audit = new FineTuningGovernanceAudit()
    const validator = new PostRunValidator(gate, audit)

    const run = gate.approve_run(rec, 'ml-lead-1', {
      approved_training_data_hash: rec.training_data_hash,
      approved_parameters: SAFE_PARAMS,
      expected_accuracy_impact: '+2%',
    })
    audit.recordApproval(run)
    expect(gate.isApproved(run.id)).toBe(true)

    const report = validator.validateRun(run.id, GOOD_BENCHMARK)
    expect(report.quarantined).toBe(false)

    const finalReport = validator.promoteModel(run.id, {
      promoting_human_id: 'ml-lead-2',
      notes: 'Validated and promoted',
    })
    expect(finalReport.status).toBe('promoted')

    const govRecords = audit.getRecordsForRun(run.id)
    expect(govRecords.length).toBeGreaterThanOrEqual(2)
  })

  it('run cannot execute without approval — structural: isApproved gate', () => {
    const gate = new HumanApprovalGate()
    const audit = new FineTuningGovernanceAudit()
    const validator = new PostRunValidator(gate, audit)
    // Any attempt to validate a run without approval throws
    expect(() => validator.validateRun('unapproved-id', GOOD_BENCHMARK)).toThrow(UnapprovedRunError)
  })
})
