import { z } from 'zod'

const shortCodePattern = /^[A-Za-z0-9_-]{4,32}$/u

const absoluteHttpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
})

const cacheValueSchema = z.discriminatedUnion('kind', [
  z.object({
    version: z.literal(1),
    kind: z.literal('redirect'),
    targetUrl: absoluteHttpUrl,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('missing'),
  }),
])

export type RedirectCacheValue = z.infer<typeof cacheValueSchema>
export type RedirectResolution =
  | { status: 302, targetUrl: string }
  | { status: 404 }
  | { status: 503 }

export interface RedirectCache {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface RedirectLookup {
  findTargetByCode(code: string): Promise<string | null>
}

export interface RedirectContext {
  waitUntil(promise: Promise<unknown>): void
}

export function isValidShortCode(code: string): boolean {
  return shortCodePattern.test(code)
}

export function redirectCacheKey(code: string): string {
  return `redirect:${code}`
}

export function encodeRedirectValue(targetUrl: string): string {
  return JSON.stringify(cacheValueSchema.parse({
    version: 1,
    kind: 'redirect',
    targetUrl,
  }))
}

export function encodeMissingValue(): string {
  return JSON.stringify({ version: 1, kind: 'missing' } satisfies RedirectCacheValue)
}

export function decodeCacheValue(value: string): RedirectCacheValue | null {
  try {
    return cacheValueSchema.parse(JSON.parse(value))
  }
  catch {
    return null
  }
}

function scheduleBackfill(context: RedirectContext, operation: Promise<void>): void {
  context.waitUntil(operation.catch((error) => {
    console.error('Redirect cache synchronization failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
  }))
}

export async function resolveRedirect(
  code: string,
  cache: RedirectCache,
  repository: RedirectLookup,
  context: RedirectContext,
): Promise<RedirectResolution> {
  if (!isValidShortCode(code)) {
    return { status: 404 }
  }

  const key = redirectCacheKey(code)
  let cachedValue: RedirectCacheValue | null = null

  try {
    const rawValue = await cache.get(key)
    cachedValue = rawValue === null ? null : decodeCacheValue(rawValue)
  }
  catch (error) {
    console.error('Redirect cache read failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
  }

  if (cachedValue?.kind === 'redirect') {
    return { status: 302, targetUrl: cachedValue.targetUrl }
  }

  if (cachedValue?.kind === 'missing') {
    return { status: 404 }
  }

  try {
    const targetUrl = await repository.findTargetByCode(code)

    if (targetUrl !== null) {
      scheduleBackfill(context, cache.put(key, encodeRedirectValue(targetUrl)))
      return { status: 302, targetUrl }
    }

    scheduleBackfill(context, cache.put(key, encodeMissingValue(), { expirationTtl: 60 }))
    return { status: 404 }
  }
  catch (error) {
    console.error('Redirect database lookup failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return { status: 503 }
  }
}
