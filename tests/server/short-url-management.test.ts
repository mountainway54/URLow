import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authorizeManagement,
  ManagementForbiddenError,
  ManagementInfrastructureError,
  ManagementNotFoundError,
  ManagementRateLimitedError,
  ManagementUnauthorizedError,
  managementRateLimitKey,
} from '../../server/services/short-url-management'
import { hashManagementPassword } from '../../server/services/management-password'

const storedHash = await hashManagementPassword('secret12')

function dependencies() {
  return {
    limiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    store: {
      findManagementByCode: vi.fn().mockResolvedValue({
        code: 'Abcd1234',
        originalUrl: 'https://example.com',
        managementPasswordHash: storedHash,
        note: 'private',
        enabled: true,
        createdAt: new Date('2026-07-31T00:00:00Z'),
        updatedAt: new Date('2026-07-31T00:00:00Z'),
      }),
      updateManagement: vi.fn(),
    },
  }
}

describe('short URL management authorization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('builds isolated IP and code keys', () => {
    expect(managementRateLimitKey('203.0.113.1', 'Abcd1234')).toBe('203.0.113.1:Abcd1234')
  })

  it('authorizes after limiter and lookup', async () => {
    const { limiter, store } = dependencies()
    await expect(authorizeManagement(
      'Abcd1234',
      ' secret12 ',
      '203.0.113.1',
      limiter,
      store,
    )).resolves.toMatchObject({ note: 'private' })
    expect(limiter.limit).toHaveBeenCalledWith({ key: '203.0.113.1:Abcd1234' })
    expect(store.findManagementByCode).toHaveBeenCalledOnce()
  })

  it('returns 429 semantics before lookup when limiter rejects', async () => {
    const { limiter, store } = dependencies()
    limiter.limit.mockResolvedValue({ success: false })
    await expect(authorizeManagement('Abcd1234', 'secret12', '203.0.113.1', limiter, store))
      .rejects.toBeInstanceOf(ManagementRateLimitedError)
    expect(store.findManagementByCode).not.toHaveBeenCalled()
  })

  it('admits ten attempts and rejects the eleventh before lookup', async () => {
    let attempts = 0
    const limiter = {
      limit: vi.fn(async () => ({ success: ++attempts <= 10 })),
    }
    const { store } = dependencies()

    for (let index = 0; index < 10; index += 1) {
      await expect(authorizeManagement('Abcd1234', undefined, '203.0.113.1', limiter, store))
        .rejects.toBeInstanceOf(ManagementUnauthorizedError)
    }
    await expect(authorizeManagement('Abcd1234', undefined, '203.0.113.1', limiter, store))
      .rejects.toBeInstanceOf(ManagementRateLimitedError)
    expect(limiter.limit).toHaveBeenCalledTimes(11)
    expect(store.findManagementByCode).not.toHaveBeenCalled()
  })

  it.each([
    [undefined, ManagementUnauthorizedError],
    ['', ManagementUnauthorizedError],
  ])('rejects a missing password after consuming an attempt', async (password, errorType) => {
    const { limiter, store } = dependencies()
    await expect(authorizeManagement('Abcd1234', password, '203.0.113.1', limiter, store))
      .rejects.toBeInstanceOf(errorType)
    expect(limiter.limit).toHaveBeenCalledOnce()
    expect(store.findManagementByCode).not.toHaveBeenCalled()
  })

  it('rejects an unknown code', async () => {
    const { limiter, store } = dependencies()
    store.findManagementByCode.mockResolvedValue(null)
    await expect(authorizeManagement('Abcd1234', 'secret12', '203.0.113.1', limiter, store))
      .rejects.toBeInstanceOf(ManagementNotFoundError)
  })

  it('rejects a permanently unmanageable row', async () => {
    const { limiter, store } = dependencies()
    store.findManagementByCode.mockResolvedValue({
      ...(await store.findManagementByCode()),
      managementPasswordHash: null,
    })
    await expect(authorizeManagement('Abcd1234', 'secret12', '203.0.113.1', limiter, store))
      .rejects.toBeInstanceOf(ManagementForbiddenError)
  })

  it('fails closed when trusted client IP or limiter is unavailable', async () => {
    const { limiter, store } = dependencies()
    await expect(authorizeManagement('Abcd1234', 'secret12', undefined, limiter, store))
      .rejects.toBeInstanceOf(ManagementInfrastructureError)
    limiter.limit.mockRejectedValue(new Error('unavailable'))
    await expect(authorizeManagement('Abcd1234', 'secret12', '203.0.113.1', limiter, store))
      .rejects.toBeInstanceOf(ManagementInfrastructureError)
  })
})
