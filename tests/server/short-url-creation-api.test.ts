import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ShortCodeGenerationExhaustedError,
} from '../../server/services/short-url-creation'
import { ShortUrlPersistenceError } from '../../server/services/short-url-repository'

const mocks = vi.hoisted(() => ({
  body: { originalUrl: 'https://example.com/article' } as unknown,
  createShortUrl: vi.fn(),
  setResponseStatus: vi.fn(),
}))

vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    defineEventHandler: (handler: unknown) => handler,
    getRequestURL: () => new URL('https://urlow.example/api/short-urls'),
    readBody: vi.fn(async () => mocks.body),
    setResponseStatus: mocks.setResponseStatus,
  }
})

vi.mock('../../server/services/short-url-creation', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/short-url-creation')>()
  return { ...original, createShortUrl: mocks.createShortUrl }
})

import handler from '../../server/api/short-urls.post'

function event(): H3Event {
  return {
    context: {
      cloudflare: {
        env: {
          HYPERDRIVE: {
            connectionString: 'postgresql://hyperdrive.internal/database',
          },
          SHORT_URL_CACHE: {
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
          },
        },
      },
    },
  } as unknown as H3Event
}

describe('POST /api/short-urls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.body = { originalUrl: 'https://example.com/article' }
    mocks.createShortUrl.mockResolvedValue({
      code: 'aB3xY8qP',
      originalUrl: 'https://example.com/article',
      note: null,
      enabled: true,
      hasManagementPassword: false,
      cacheSynchronized: true,
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the exact 201 response using the request origin', async () => {
    const requestEvent = event()

    await expect(handler(requestEvent)).resolves.toEqual({
      data: {
        code: 'aB3xY8qP',
        originalUrl: 'https://example.com/article',
        shortUrl: 'https://urlow.example/aB3xY8qP',
        note: null,
        enabled: true,
        hasManagementPassword: false,
      },
    })
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(requestEvent, 201)
  })

  it('returns validation errors before invoking creation I/O', async () => {
    mocks.body = { originalUrl: 'javascript:alert(1)' }
    const requestEvent = event()

    await expect(handler(requestEvent)).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(requestEvent, 400)
    expect(mocks.createShortUrl).not.toHaveBeenCalled()
  })

  it.each([
    [
      new ShortCodeGenerationExhaustedError(),
      503,
      {
        error: {
          code: 'SHORT_CODE_GENERATION_FAILED',
          message: 'Unable to allocate a unique short code',
        },
      },
    ],
    [
      new ShortUrlPersistenceError('postgresql://admin:password@secret.neon.tech/database'),
      503,
      {
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Unable to create short URL',
        },
      },
    ],
    [
      new Error('unexpected secret stack'),
      500,
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to create short URL',
        },
      },
    ],
  ])('maps a service failure to a sanitized response', async (error, status, body) => {
    mocks.createShortUrl.mockRejectedValue(error)
    const requestEvent = event()

    const result = await handler(requestEvent)

    expect(mocks.setResponseStatus).toHaveBeenCalledWith(requestEvent, status)
    expect(result).toEqual(body)
    expect(JSON.stringify(result)).not.toMatch(/postgres|admin|password|neon|secret|stack/i)
  })
})
