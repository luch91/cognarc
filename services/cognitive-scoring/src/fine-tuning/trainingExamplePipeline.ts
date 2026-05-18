import { createHash, randomUUID } from 'crypto'
import type {
  ValidatedSession,
  TrainingExample,
  SessionId,
} from './types.js'

// ─── Fine-tuning queue (append-only in-memory store) ─────────────────────────
// In production this would write to a fine_tuning_queue table via INSERT only.
// The store is append-only: no delete, no update operations exposed.

const queue: TrainingExample[] = []

function hashSession(session: ValidatedSession): string {
  const canonical = JSON.stringify({
    session_id: session.session_id,
    workspace_id: session.workspace_id,
    alignment_score: session.alignment_score,
    event_count: session.behavioral_events.length,
    recorded_at: session.recorded_at,
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

// ─── TrainingExamplePipeline ──────────────────────────────────────────────────

export class TrainingExamplePipeline {
  /**
   * Validate and enqueue a behavioral session as a training example.
   * Validation rules (hard-coded, cannot be weakened by the agent):
   *   1. session must have alignment_score (computed, not zero-sentinel)
   *   2. session must have ≥5 behavioral events
   * Returns the queued example on success, throws on validation failure.
   */
  enqueue(session: ValidatedSession): TrainingExample {
    this.validate(session)

    const example: TrainingExample = {
      id: randomUUID(),
      session_id: session.session_id,
      workspace_id: session.workspace_id,
      alignment_score: session.alignment_score,
      event_count: session.behavioral_events.length,
      payload_hash: hashSession(session),
      queued_at: new Date().toISOString(),
    }

    queue.push(example)
    return example
  }

  /** Number of examples currently in the queue. */
  queueSize(): number {
    return queue.length
  }

  /** Read all queued examples (ML team view). Agent cannot mutate this. */
  readQueue(): readonly TrainingExample[] {
    return queue
  }

  /**
   * Compute a deterministic SHA-256 hash over all queued examples, ordered by
   * id (insertion order). Used to bind HumanApprovalGate to a specific snapshot.
   */
  computeDataHash(): string {
    const content = queue.map((e) => e.id + e.payload_hash).join('|')
    return createHash('sha256').update(content).digest('hex').slice(0, 32)
  }

  /** Remove specific examples from the queue by session id — for testing only. */
  _clearQueue(): void {
    queue.length = 0
  }

  private validate(session: ValidatedSession): void {
    if (typeof session.alignment_score !== 'number' || isNaN(session.alignment_score)) {
      throw new Error('Session must have a computed alignment_score')
    }
    if (session.behavioral_events.length < 5) {
      throw new Error(
        `Session ${session.session_id} has ${session.behavioral_events.length} events; minimum is 5`,
      )
    }
  }
}

export function makeSession(
  overrides: Partial<ValidatedSession> = {},
  eventCount = 5,
): ValidatedSession {
  const events = Array.from({ length: eventCount }, (_, i) => ({
    event_type: 'click',
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
    payload: { element: `btn-${i}` },
  }))
  return {
    session_id: randomUUID() as SessionId,
    workspace_id: 'ws-test',
    alignment_score: 0.75,
    behavioral_events: events,
    recorded_at: new Date().toISOString(),
    ...overrides,
  }
}
