import { z } from 'zod'

const hyperdriveSchema = z.object({
  connectionString: z.string().url().refine(
    value => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'Hyperdrive connectionString must use PostgreSQL',
  ),
})

const workerEnvSchema = z.object({
  HYPERDRIVE: hyperdriveSchema,
  SHORT_URL_CACHE: z.custom<KVNamespace>(
    value => typeof value === 'object' && value !== null
      && typeof (value as KVNamespace).get === 'function'
      && typeof (value as KVNamespace).put === 'function'
      && typeof (value as KVNamespace).delete === 'function',
    'SHORT_URL_CACHE binding is missing or malformed',
  ),
})

export type WorkerEnv = z.infer<typeof workerEnvSchema>

export function parseWorkerEnv(value: unknown): WorkerEnv {
  return workerEnvSchema.parse(value)
}

export function parseHyperdriveBinding(value: unknown): Hyperdrive {
  return hyperdriveSchema.parse(value) as Hyperdrive
}
