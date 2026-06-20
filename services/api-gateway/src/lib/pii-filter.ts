const PII_KEYS = new Set([
  'email', 'name', 'firstName', 'first_name', 'lastName', 'last_name',
  'phone', 'phoneNumber', 'phone_number', 'address', 'ssn', 'dob',
  'date_of_birth', 'dateOfBirth', 'ip', 'ipAddress', 'ip_address',
  'creditCard', 'credit_card', 'password', 'secret',
])

export function stripPII(props: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (PII_KEYS.has(key)) continue
    if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) continue
    clean[key] = value
  }
  return clean
}
