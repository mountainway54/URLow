import {
  encodeGoneValue,
  encodeRedirectValue,
  redirectCacheKey,
  type RedirectCache,
} from './short-url-cache'
import type { ManagementRecord } from './short-url-management'

export const KV_STALE_WINDOW_WARNING = 'Other regions may observe an older redirect for approximately 60 seconds or longer.'

export interface ShortUrlCreationStore {
  insert(
    code: string,
    targetUrl: string,
    metadata?: { managementPasswordHash: string | null, note: string | null },
  ): Promise<void>
}

export interface ShortUrlMutationStore extends ShortUrlCreationStore {
  updateManagement(
    code: string,
    input: { originalUrl?: string, note?: string | null, enabled?: boolean },
  ): Promise<ManagementRecord | null>
}

export interface MutationResult {
  cacheSynchronized: boolean
  staleWindowWarning: typeof KV_STALE_WINDOW_WARNING
}

export class ShortUrlCreationCoordinator {
  constructor(
    protected readonly cache: RedirectCache,
    private readonly creationStore: ShortUrlCreationStore,
  ) {}

  async create(
    code: string,
    targetUrl: string,
    metadata: { managementPasswordHash: string | null, note: string | null } = {
      managementPasswordHash: null,
      note: null,
    },
  ): Promise<MutationResult> {
    await this.creationStore.insert(code, targetUrl, metadata)

    try {
      await this.cache.put(redirectCacheKey(code), encodeRedirectValue(targetUrl))
      return this.result(true)
    }
    catch (error) {
      console.error('Short URL cache synchronization failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
      return this.result(false)
    }
  }

  protected result(cacheSynchronized: boolean): MutationResult {
    return {
      cacheSynchronized,
      staleWindowWarning: KV_STALE_WINDOW_WARNING,
    }
  }
}

export class ShortUrlMutationCoordinator extends ShortUrlCreationCoordinator {
  constructor(
    cache: RedirectCache,
    private readonly store: ShortUrlMutationStore,
  ) {
    super(cache, store)
  }

  async update(
    code: string,
    input: { originalUrl?: string, note?: string | null, enabled?: boolean },
  ): Promise<MutationResult & { row: ManagementRecord | null }> {
    await this.cache.delete(redirectCacheKey(code))
    const row = await this.store.updateManagement(code, input)
    if (row === null) {
      return { ...this.result(true), row: null }
    }

    try {
      await this.cache.put(
        redirectCacheKey(code),
        row.enabled ? encodeRedirectValue(row.originalUrl) : encodeGoneValue(),
      )
      return { ...this.result(true), row }
    }
    catch (error) {
      console.error('Short URL cache synchronization failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
      return { ...this.result(false), row }
    }
  }
}
