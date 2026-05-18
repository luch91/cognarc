import { randomUUID } from 'crypto'
import type { Pool } from 'pg'
import type { AuditEntry, AgentActionType, OversightZone } from '@cognarc/types'

export interface AuditQueryFilters {
  workspace_id?: string | undefined
  action_type?: AgentActionType | undefined
  oversight_zone?: OversightZone | undefined
  from?: Date | undefined
  to?: Date | undefined
  limit?: number | undefined
}

export class AuditLog {
  constructor(private readonly pool: Pool) {}

  async append(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
    const id = randomUUID()
    const timestamp = new Date().toISOString()

    await this.pool.query(
      `INSERT INTO audit_log
         (id, timestamp, workspace_id, action_type, oversight_zone,
          triggering_scores, policy_rule_applied, alternatives_considered,
          authorising_human_or_policy, outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        timestamp,
        entry.workspace_id,
        entry.action_type,
        entry.oversight_zone,
        entry.triggering_scores !== undefined ? JSON.stringify(entry.triggering_scores) : null,
        entry.policy_rule_applied,
        entry.alternatives_considered ?? null,
        entry.authorising_human_or_policy,
        entry.outcome,
      ],
    )

    return { id, timestamp, ...entry }
  }

  async query(filters: AuditQueryFilters = {}): Promise<AuditEntry[]> {
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (filters.workspace_id !== undefined) {
      conditions.push(`workspace_id = $${i++}`)
      params.push(filters.workspace_id)
    }
    if (filters.action_type !== undefined) {
      conditions.push(`action_type = $${i++}`)
      params.push(filters.action_type)
    }
    if (filters.oversight_zone !== undefined) {
      conditions.push(`oversight_zone = $${i++}`)
      params.push(filters.oversight_zone)
    }
    if (filters.from !== undefined) {
      conditions.push(`timestamp >= $${i++}`)
      params.push(filters.from.toISOString())
    }
    if (filters.to !== undefined) {
      conditions.push(`timestamp <= $${i++}`)
      params.push(filters.to.toISOString())
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters.limit !== undefined ? `LIMIT $${i}` : ''
    if (filters.limit !== undefined) params.push(filters.limit)

    const result = await this.pool.query(
      `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC ${limit}`,
      params,
    )

    return result.rows as AuditEntry[]
  }
}
