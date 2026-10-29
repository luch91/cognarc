export const INTEGRATION_PROVIDERS = [
  'segment','amplitude','mixpanel','posthog','ga4','braintrust',
  'langfuse','wandb','arize','github','llm',
] as const
export type IntegrationProvider = typeof INTEGRATION_PROVIDERS[number]

export function validateDecision(decision: string, justification: string):
  asserts decision is 'approved' | 'rejected' {
  if (decision !== 'approved' && decision !== 'rejected') throw new Error('Invalid decision')
  const n = justification.trim().length
  if (n < 12 || n > 2000) throw new Error('Justification must contain 12 to 2000 characters')
}

export function validateIntegration(provider: string, label: string, reference: string):
  asserts provider is IntegrationProvider {
  if (!INTEGRATION_PROVIDERS.includes(provider as IntegrationProvider)) throw new Error('Unsupported provider')
  if (!label.trim() || label.trim().length > 100) throw new Error('Label must contain 1 to 100 characters')
  if (reference.length > 300) throw new Error('Reference cannot exceed 300 characters')
  if (/sk-[a-z0-9]{12}|api[_-]?key[ ]*[:=]|bearer[ ]+[a-z0-9]/i.test(reference)) {
    throw new Error('Do not enter credentials or API secrets in a public reference field')
  }
}
