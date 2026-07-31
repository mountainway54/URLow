import { z } from 'zod'

export interface HyperdriveBinding {
  connectionString: string
}

export interface KvNamespaceBinding {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export class ManagementRateLimiterBindingError extends Error {
  constructor() {
    super('MANAGEMENT_RATE_LIMITER binding is missing or malformed')
    this.name = 'ManagementRateLimiterBindingError'
  }
}

const hyperdriveSchema = z.object({
  connectionString: z.string().url().refine(
    value => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'Hyperdrive connectionString must use PostgreSQL',
  ),
})

const workerEnvSchema = z.object({
  HYPERDRIVE: hyperdriveSchema,
  SHORT_URL_CACHE: z.custom<KvNamespaceBinding>(
    value => typeof value === 'object' && value !== null
      && typeof (value as KvNamespaceBinding).get === 'function'
      && typeof (value as KvNamespaceBinding).put === 'function'
      && typeof (value as KvNamespaceBinding).delete === 'function',
    'SHORT_URL_CACHE binding is missing or malformed',
  ),
})

const managementRateLimiterSchema = z.custom<RateLimitBinding>(
  value => typeof value === 'object' && value !== null
    && typeof (value as RateLimitBinding).limit === 'function',
  'MANAGEMENT_RATE_LIMITER binding is missing or malformed',
)

export type WorkerEnv = z.infer<typeof workerEnvSchema>

export function parseWorkerEnv(value: unknown): WorkerEnv {
  return workerEnvSchema.parse(value)
}

export function parseHyperdriveBinding(value: unknown): HyperdriveBinding {
  return hyperdriveSchema.parse(value)
}

export function parseManagementRateLimiter(value: unknown): RateLimitBinding {
  const result = managementRateLimiterSchema.safeParse(value)
  if (!result.success) {
    throw new ManagementRateLimiterBindingError()
  }
  return result.data
}
