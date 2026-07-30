import {
  encodeRedirectValue,
  redirectCacheKey,
  type RedirectCache,
} from './short-url-cache'

export const KV_STALE_WINDOW_WARNING = 'Other regions may observe an older redirect for approximately 60 seconds or longer.'

export interface ShortUrlCreationStore {
  insert(code: string, targetUrl: string): Promise<void>
}

export interface ShortUrlMutationStore extends ShortUrlCreationStore {
  updateTarget(code: string, targetUrl: string): Promise<void>
  disable(code: string): Promise<void>
  delete(code: string): Promise<void>
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

  async create(code: string, targetUrl: string): Promise<MutationResult> {
    await this.creationStore.insert(code, targetUrl)

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

  async updateTarget(code: string, targetUrl: string): Promise<MutationResult> {
    await this.cache.delete(redirectCacheKey(code))
    await this.store.updateTarget(code, targetUrl)

    try {
      await this.cache.put(redirectCacheKey(code), encodeRedirectValue(targetUrl))
      return this.result(true)
    }
    catch {
      return this.result(false)
    }
  }

  async disable(code: string): Promise<MutationResult> {
    await this.cache.delete(redirectCacheKey(code))
    await this.store.disable(code)
    return this.result(true)
  }

  async delete(code: string): Promise<MutationResult> {
    await this.cache.delete(redirectCacheKey(code))
    await this.store.delete(code)
    return this.result(true)
  }
}
