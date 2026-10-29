import { validateDecision, validateIntegration } from '../src/api/adminValidation.js'

describe('Gate 3 server-side input guards', () => {
  test('requires a meaningful decision justification', () => {
    expect(() => validateDecision('approved', 'short')).toThrow()
    expect(() => validateDecision('rejected', 'This decision is supported by review.')).not.toThrow()
    expect(() => validateDecision('expired', 'This decision is supported by review.')).toThrow()
  })
  test('disallows credential-like values in public integration metadata', () => {
    expect(() => validateIntegration('github', 'Release automation', 'luch91/cognarc')).not.toThrow()
    expect(() => validateIntegration('github', 'Release automation', 'api_key=secret-value')).toThrow()
    expect(() => validateIntegration('unknown', 'Release automation', 'public-project')).toThrow()
  })
})
