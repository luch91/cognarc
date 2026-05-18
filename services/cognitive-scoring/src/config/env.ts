import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  COGNARC_SCORING_ENGINE: z.enum(['mock', 'tribe-local', 'tribe-gcp']).default('mock'),
  GCP_TRIBE_ENDPOINT: z.string().url().optional(),
  TRIBE_LOCAL_ENDPOINT: z.string().url().default('http://localhost:8080'),
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
