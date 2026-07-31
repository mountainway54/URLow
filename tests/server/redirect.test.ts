import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  encodeGoneValue,
  encodeMissingValue,
  encodeRedirectValue,
} from '../../server/services/short-url-cache'

const mocks = vi.hoisted(() => ({
  code: 'nuxt-guide',
  method: 'GET',
  setResponseStatus: vi.fn(),
  sendRedirect: vi.fn((_event, targetUrl, status) => ({ targetUrl, status })),
  findTargetByCode: vi.fn(),
}))

vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    defineEventHandler: (handler: unknown) => handler,
    getMethod: () => mocks.method,
    getRequestURL: () => new URL(`http://localhost/${mocks.code}`),
    setResponseStatus: mocks.setResponseStatus,
    sendRedirect: mocks.sendRedirect,
  }
})

vi.mock('../../server/services/short-url-repository', () => ({
  ShortUrlRepository: class {
    findTargetByCode = mocks.findTargetByCode
  },
}))

import handler from '../../server/middleware/short-url-redirect'

function eventWithCache(rawValue: string | null) {
  const pending: Promise<unknown>[] = []
  const cache = {
    get: vi.fn().mockResolvedValue(rawValue),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
  const event = {
    context: {
      cloudflare: {
        env: {
          HYPERDRIVE: { connectionString: 'postgresql://hyperdrive.internal/database' },
          SHORT_URL_CACHE: cache,
        },
        context: {
          waitUntil: vi.fn((promise: Promise<unknown>) => pending.push(promise)),
        },
      },
    },
  } as unknown as H3Event
  return { event, cache, pending }
}

describe('GET /:code redirect middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.code = 'nuxt-guide'
    mocks.method = 'GET'
    mocks.findTargetByCode.mockResolvedValue(null)
  })

  it('ignores non-GET requests', async () => {
    mocks.method = 'POST'
    const { event, cache } = eventWithCache(null)

    await expect(handler(event)).resolves.toBeUndefined()

    expect(cache.get).not.toHaveBeenCalled()
    expect(mocks.findTargetByCode).not.toHaveBeenCalled()
  })

  it('lets the Nuxt renderer handle the root path', async () => {
    mocks.code = ''
    const { event, cache } = eventWithCache(null)

    await expect(handler(event)).resolves.toBeUndefined()

    expect(mocks.setResponseStatus).not.toHaveBeenCalled()
    expect(cache.get).not.toHaveBeenCalled()
    expect(mocks.findTargetByCode).not.toHaveBeenCalled()
  })

  it('returns a positive cache hit without database access or writes', async () => {
    const { event, cache } = eventWithCache(encodeRedirectValue('https://example.com/target'))
    await expect(handler(event)).resolves.toEqual({
      status: 302,
      targetUrl: 'https://example.com/target',
    })
    expect(cache.get).toHaveBeenCalledWith('redirect:nuxt-guide')
    expect(cache.put).not.toHaveBeenCalled()
    expect(cache.delete).not.toHaveBeenCalled()
    expect(mocks.findTargetByCode).not.toHaveBeenCalled()
  })

  it('returns a negative cache hit without database access or writes', async () => {
    const { event, cache } = eventWithCache(encodeMissingValue())
    await handler(event)
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 404)
    expect(cache.put).not.toHaveBeenCalled()
    expect(cache.delete).not.toHaveBeenCalled()
    expect(mocks.findTargetByCode).not.toHaveBeenCalled()
  })

  it('returns 410 for a disabled cache hit', async () => {
    const { event } = eventWithCache(encodeGoneValue())
    await handler(event)
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 410)
    expect(mocks.findTargetByCode).not.toHaveBeenCalled()
  })

  it('returns a database-derived redirect and only schedules cache backfill', async () => {
    const { event, cache } = eventWithCache(null)
    mocks.findTargetByCode.mockResolvedValue({
      targetUrl: 'https://example.com/target',
      enabled: true,
    })
    await handler(event)
    expect(mocks.findTargetByCode).toHaveBeenCalledWith('nuxt-guide')
    expect(mocks.sendRedirect).toHaveBeenCalledWith(event, 'https://example.com/target', 302)
    expect(cache.put).toHaveBeenCalledOnce()
    expect(cache.delete).not.toHaveBeenCalled()
  })
})
