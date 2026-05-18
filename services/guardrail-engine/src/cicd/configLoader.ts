import { readFileSync, existsSync } from 'fs'
import { load as yamlLoad } from 'js-yaml'
import type { CognArcConfig } from './types.js'

export function loadConfig(configPath = '.cognarc.yml'): CognArcConfig {
  if (!existsSync(configPath)) {
    return {
      version: '1.0',
      thresholds: {
        cognitive_load: { max: 80 },
        manipulation_risk: { max: 40 },
        comprehension_confidence: { min: 50 },
      },
      on_breach: { action: 'fail' },
    }
  }

  const raw = readFileSync(configPath, 'utf8')
  const parsed = yamlLoad(raw) as CognArcConfig

  if (parsed.version !== '1.0') {
    throw new Error(`Unsupported .cognarc.yml version: ${String(parsed.version)}. Expected "1.0"`)
  }

  return parsed
}

export function resolveThreshold(
  config: CognArcConfig,
  metric: 'cognitive_load' | 'manipulation_risk' | 'comprehension_confidence' | 'trust_coherence',
  environment?: string,
): { max?: number; min?: number } {
  const base = config.thresholds[metric]
  if (base === undefined) return {}

  let max = base.max
  let min = base.min

  // Environment-specific overrides take precedence
  if (environment !== undefined && base.environment !== undefined) {
    const envValue = base.environment[environment]
    if (envValue !== undefined) {
      if (max !== undefined) max = envValue
      if (min !== undefined) min = envValue
    }
  }

  const result: { max?: number; min?: number } = {}
  if (max !== undefined) result.max = max
  if (min !== undefined) result.min = min
  return result
}
