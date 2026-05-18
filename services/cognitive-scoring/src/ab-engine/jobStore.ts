import type { ABComparisonResult } from './types.js'

export interface ABJob {
  id: string
  status: 'pending' | 'complete' | 'error'
  created_at: string
  completed_at?: string
  result?: ABComparisonResult
  error?: string
}

// In-memory store — in production this would be Redis with TTL.
const jobs = new Map<string, ABJob>()

export function createJob(id: string): ABJob {
  const job: ABJob = {
    id,
    status: 'pending',
    created_at: new Date().toISOString(),
  }
  jobs.set(id, job)
  return job
}

export function completeJob(id: string, result: ABComparisonResult): void {
  const job = jobs.get(id)
  if (!job) return
  job.status = 'complete'
  job.completed_at = new Date().toISOString()
  job.result = result
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.status = 'error'
  job.completed_at = new Date().toISOString()
  job.error = error
}

export function getJob(id: string): ABJob | undefined {
  return jobs.get(id)
}
