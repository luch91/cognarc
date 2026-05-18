import type { Redis } from 'ioredis'
import { KillSwitchActiveError } from '@cognarc/types'

const KEY_PREFIX = 'cognarc:kill-switch:'

export class GlobalKillSwitch {
  constructor(private readonly redis: Redis) {}

  async activate(workspaceId: string): Promise<void> {
    await this.redis.set(`${KEY_PREFIX}${workspaceId}`, '1')
  }

  isActive(workspaceId: string): boolean {
    // Synchronous check — relies on a cached value set via activateSync or activate.
    // For synchronous gate checks the caller must have pre-fetched state.
    // Use checkAndThrow() for the authoritative async path.
    throw new Error(
      'Use checkAndThrow() or isActiveAsync() for authoritative kill switch checks.',
    )
  }

  async isActiveAsync(workspaceId: string): Promise<boolean> {
    const val = await this.redis.get(`${KEY_PREFIX}${workspaceId}`)
    return val === '1'
  }

  async checkAndThrow(workspaceId: string): Promise<void> {
    if (await this.isActiveAsync(workspaceId)) {
      throw new KillSwitchActiveError(workspaceId)
    }
  }

  async deactivate(workspaceId: string, _humanId: string): Promise<void> {
    await this.redis.del(`${KEY_PREFIX}${workspaceId}`)
  }
}
