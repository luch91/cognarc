import type { TierName } from './types.js'

const TIER_LIMITS: Record<TierName, number> = {
  free: 100,
  growth: 1000,
}

interface Bucket {
  tokens: number
  lastRefill: number
}

// Sliding-window token bucket, in-memory.
// In production replace with Redis INCR + TTL for cross-instance consistency.
export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private tiers = new Map<string, TierName>()

  setTier(workspaceId: string, tier: TierName): void {
    this.tiers.set(workspaceId, tier)
  }

  // Returns { allowed: true } or { allowed: false, retryAfterMs }
  consume(workspaceId: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const tier = this.tiers.get(workspaceId) ?? 'free'
    const limit = TIER_LIMITS[tier]
    const now = Date.now()
    const windowMs = 60_000

    let bucket = this.buckets.get(workspaceId)
    if (bucket === undefined) {
      bucket = { tokens: limit, lastRefill: now }
      this.buckets.set(workspaceId, bucket)
    }

    // Refill tokens based on elapsed time (partial refill)
    const elapsed = now - bucket.lastRefill
    const refill = Math.floor((elapsed / windowMs) * limit)
    if (refill > 0) {
      bucket.tokens = Math.min(limit, bucket.tokens + refill)
      bucket.lastRefill = now
    }

    if (bucket.tokens <= 0) {
      const retryAfterMs = windowMs - elapsed
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) }
    }

    bucket.tokens--
    return { allowed: true }
  }

  // For testing
  _reset(): void {
    this.buckets.clear()
    this.tiers.clear()
  }
}

export const globalRateLimiter = new RateLimiter()
