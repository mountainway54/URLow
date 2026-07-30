import { describe, expect, it, vi } from 'vitest'
import { redirectCacheKey, resolveRedirect } from '../../server/services/short-url-cache'

function dependencies() {
  return {
    cache: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    repository: {
      findTargetByCode: vi.fn().mockResolvedValue(null),
    },
    context: {
      waitUntil: vi.fn(),
    },
  }
}

describe('validated edge redirect lookup', () => {
  it.each([
    'Ab_1',
    'a'.repeat(32),
    'nuxt-guide',
  ])('uses redirect:<code> for valid code %s', async (code) => {
    const { cache, repository, context } = dependencies()
    await resolveRedirect(code, cache, repository, context)
    expect(cache.get).toHaveBeenCalledWith(redirectCacheKey(code))
  })

  it.each([
    'abc',
    'a'.repeat(33),
    'bad.code',
    '含中文',
    'bad code',
  ])('returns 404 without I/O for invalid code %s', async (code) => {
    const { cache, repository, context } = dependencies()
    await expect(resolveRedirect(code, cache, repository, context)).resolves.toEqual({ status: 404 })
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
    expect(repository.findTargetByCode).not.toHaveBeenCalled()
    expect(context.waitUntil).not.toHaveBeenCalled()
  })
})
