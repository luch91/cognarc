import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3005),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  COGNARC_DB_URL: z
    .string()
    .default('postgresql://cognarc:password@localhost:5432/cognarc'),
  COGNARC_REDIS_URL: z.string().default('redis://localhost:6379'),
  COGNARC_AUDIT_WORM: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  COGNARC_POLICY_PATH: z.string().default('.cognarc.yml'),
})

function loadEnv(): z.infer<typeof EnvSchema> {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten())
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
