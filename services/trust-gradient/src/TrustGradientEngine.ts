import type { AgentActionType, OversightZone } from '@cognarc/types'
import { TrustGradientViolation, UnregisteredActionError } from '@cognarc/types'
import { ACTION_REGISTRY } from './registry.js'

export interface WorkspaceContext {
  workspace_id: string
  // Zone overrides can only be set by humans via .cognarc.yml, never by the agent.
  zone_overrides?: Partial<Record<AgentActionType, OversightZone>>
}

export class TrustGradientEngine {
  classify(action: AgentActionType, context: WorkspaceContext): OversightZone {
    if (!(action in ACTION_REGISTRY)) {
      throw new UnregisteredActionError(action)
    }

    const base = ACTION_REGISTRY[action]

    // Human-configured overrides from .cognarc.yml are applied here.
    // The agent cannot pass zone_overrides — they come from config only.
    const override = context.zone_overrides?.[action]
    if (override !== undefined) {
      this.validateOverride(action, base, override)
      return override
    }

    return base
  }

  // The agent is never the caller of this — only config loading calls it.
  // If somehow an agent-initiated downgrade reaches here, it throws.
  private validateOverride(
    action: AgentActionType,
    base: OversightZone,
    override: OversightZone,
  ): void {
    const zoneRank: Record<OversightZone, number> = {
      OBSERVE: 0,
      RECOMMEND: 1,
      ACT_AUTO: 2,
      ACT_GATED: 3,
    }
    if (zoneRank[override] < zoneRank[base]) {
      throw new TrustGradientViolation(
        `Cannot downgrade action "${action}" from ${base} to ${override} — ` +
          `this requires explicit PM approval and a config change, not a runtime override.`,
      )
    }
  }
}
