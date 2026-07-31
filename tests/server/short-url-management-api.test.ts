import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  managementErrorResponseSchema,
  managementResponseSchema,
  updateShortUrlResponseSchema,
  validationErrorResponseSchema,
} from '../../server/schemas/api-contract'
import {
  ManagementForbiddenError,
  ManagementInfrastructureError,
  ManagementRateLimitedError,
  ManagementUnauthorizedError,
} from '../../server/services/short-url-management'

const mocks = vi.hoisted(() => ({
  body: { note: ' revised ' } as unknown,
  authorize: vi.fn(),
  update: vi.fn(),
  setResponseStatus: vi.fn(),
  clientIp: '203.0.113.1' as string | undefined,
}))

vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    defineEventHandler: (handler: unknown) => handler,
    getRequestHeader: (_event: unknown, name: string) => name === 'cf-connecting-ip'
      ? mocks.clientIp
      : 'secret12',
    getRequestURL: () => new URL('https://urlow.example/api/short-urls/Abcd1234'),
    getRouterParam: () => 'Abcd1234',
    readBody: vi.fn(async () => mocks.body),
    setResponseStatus: mocks.setResponseStatus,
  }
})

vi.mock('../../server/services/short-url-management', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/short-url-management')>()
  return {
    ...original,
    ShortUrlManagementService: class {
      authorize = mocks.authorize
      update = mocks.update
    },
  }
})

import getHandler from '../../server/api/short-urls/[code]/management.get'
import patchHandler from '../../server/api/short-urls/[code].patch'

function record() {
  return {
    code: 'Abcd1234',
    originalUrl: 'https://example.com',
    managementPasswordHash: '$2b$10$never-public',
    note: 'private',
    enabled: true,
    createdAt: new Date('2026-07-31T00:00:00Z'),
    updatedAt: new Date('2026-07-31T00:01:00Z'),
  }
}

function event(localDevMarker?: unknown): H3Event {
  return {
    context: {
      cloudflare: {
        env: {
          HYPERDRIVE: { connectionString: 'postgresql://hyperdrive.internal/database' },
          SHORT_URL_CACHE: {
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
          },
          MANAGEMENT_RATE_LIMITER: { limit: vi.fn() },
          ...(localDevMarker === undefined ? {} : { URLOW_LOCAL_DEV: localDevMarker }),
        },
      },
    },
  } as unknown as H3Event
}

describe('short URL management API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.body = { note: ' revised ' }
    mocks.clientIp = '203.0.113.1'
    mocks.authorize.mockResolvedValue(record())
    mocks.update.mockResolvedValue({
      row: { ...record(), note: 'revised' },
      cacheSynchronized: true,
      staleWindowWarning: 'Other regions may observe an older redirect for approximately 60 seconds or longer.',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns safe private metadata after authorization', async () => {
    const response = await getHandler(event())
    expect(response).toMatchObject({
      data: {
        code: 'Abcd1234',
        note: 'private',
        hasManagementPassword: true,
      },
    })
    expect(managementResponseSchema.safeParse(response).success).toBe(true)
    expect(JSON.stringify(response)).not.toContain('never-public')
  })

  it('passes local-dev identity only for the exact local marker when IP is absent', async () => {
    mocks.clientIp = undefined

    await getHandler(event('true'))
    expect(mocks.authorize).toHaveBeenCalledWith('Abcd1234', 'secret12', 'local-dev')

    mocks.authorize.mockClear()
    await getHandler(event('TRUE'))
    expect(mocks.authorize).toHaveBeenCalledWith('Abcd1234', 'secret12', undefined)
  })

  it.each([
    [new ManagementUnauthorizedError(), 401, 'MANAGEMENT_UNAUTHORIZED'],
    [new ManagementForbiddenError(), 403, 'MANAGEMENT_FORBIDDEN'],
    [new ManagementRateLimitedError(), 429, 'MANAGEMENT_RATE_LIMITED'],
    [new ManagementInfrastructureError(), 503, 'MANAGEMENT_UNAVAILABLE'],
  ])('maps authorization errors without sensitive details', async (error, status, code) => {
    mocks.authorize.mockRejectedValue(error)
    const requestEvent = event()
    const response = await getHandler(requestEvent)
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(requestEvent, status)
    expect(response).toMatchObject({ error: { code } })
    expect(managementErrorResponseSchema.safeParse(response).success).toBe(true)
  })

  it('returns normalized PATCH metadata and cache synchronization state', async () => {
    const response = await patchHandler(event())
    expect(mocks.update).toHaveBeenCalledWith(
      'Abcd1234',
      'secret12',
      '203.0.113.1',
      { note: 'revised' },
    )
    expect(response).toMatchObject({
      data: {
        note: 'revised',
        cacheSynchronized: true,
        staleWindowWarning: expect.any(String),
      },
    })
    expect(updateShortUrlResponseSchema.safeParse(response).success).toBe(true)
  })

  it('rejects an empty PATCH before authorization', async () => {
    mocks.body = {}
    const requestEvent = event()
    const response = await patchHandler(requestEvent)
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(requestEvent, 400)
    expect(response).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect(validationErrorResponseSchema.safeParse(response).success).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
