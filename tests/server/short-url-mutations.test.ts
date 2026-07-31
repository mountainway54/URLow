import { describe, expect, it, vi } from 'vitest'
import {
  encodeGoneValue,
  encodeRedirectValue,
} from '../../server/services/short-url-cache'
import {
  KV_STALE_WINDOW_WARNING,
  ShortUrlCreationCoordinator,
  ShortUrlMutationCoordinator,
} from '../../server/services/short-url-mutations'

function record(enabled = true) {
  return {
    code: 'new-code',
    originalUrl: 'https://example.com/updated',
    managementPasswordHash: '$2b$10$hash',
    note: null,
    enabled,
    createdAt: new Date('2026-07-31T00:00:00Z'),
    updatedAt: new Date('2026-07-31T00:01:00Z'),
  }
}

function setup(enabled = true) {
  const order: string[] = []
  const cache = {
    get: vi.fn(),
    put: vi.fn(async () => { order.push('cache.put') }),
    delete: vi.fn(async () => { order.push('cache.delete') }),
  }
  const store = {
    insert: vi.fn(async () => { order.push('database.insert') }),
    updateManagement: vi.fn(async () => {
      order.push('database.update')
      return record(enabled)
    }),
  }
  return { order, cache, store, coordinator: new ShortUrlMutationCoordinator(cache, store) }
}

describe('active cache synchronization for mutations', () => {
  it('supports creation with an insert-only store', async () => {
    const cache = {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
    }
    const store = { insert: vi.fn().mockResolvedValue(undefined) }
    const coordinator = new ShortUrlCreationCoordinator(cache, store)

    await expect(coordinator.create('new-code', 'https://example.com/new')).resolves.toEqual({
      cacheSynchronized: true,
      staleWindowWarning: KV_STALE_WINDOW_WARNING,
    })
    expect(store.insert).toHaveBeenCalledWith(
      'new-code',
      'https://example.com/new',
      { managementPasswordHash: null, note: null },
    )
  })

  it('inserts before overwriting a negative marker', async () => {
    const { order, cache, coordinator } = setup()
    await coordinator.create('new-code', 'https://example.com/new')
    expect(order).toEqual(['database.insert', 'cache.put'])
    expect(cache.put).toHaveBeenCalledWith(
      'redirect:new-code',
      encodeRedirectValue('https://example.com/new'),
    )
  })

  it('exposes create cache failure without compensating database delete', async () => {
    const { cache, store, coordinator } = setup()
    cache.put.mockRejectedValue(new Error('KV unavailable'))
    await expect(coordinator.create('new-code', 'https://example.com/new'))
      .resolves.toMatchObject({ cacheSynchronized: false })
    expect(store.insert).toHaveBeenCalledOnce()
    expect(cache.delete).not.toHaveBeenCalled()
  })

  it('deletes cache, updates database, then puts the resulting target', async () => {
    const { order, cache, coordinator } = setup()
    await coordinator.update('new-code', { originalUrl: 'https://example.com/updated' })
    expect(order).toEqual(['cache.delete', 'database.update', 'cache.put'])
    expect(cache.put).toHaveBeenCalledWith(
      'redirect:new-code',
      encodeRedirectValue('https://example.com/updated'),
    )
  })

  it('stores a gone value after disabling', async () => {
    const { cache, coordinator } = setup(false)
    await coordinator.update('new-code', { enabled: false })
    expect(cache.put).toHaveBeenCalledWith('redirect:new-code', encodeGoneValue())
  })

  it('reports post-update put failure while preserving the row', async () => {
    const { cache, store, coordinator } = setup()
    cache.put.mockRejectedValue(new Error('KV unavailable'))
    await expect(coordinator.update('new-code', { note: 'revised' })).resolves.toMatchObject({
      cacheSynchronized: false,
      staleWindowWarning: KV_STALE_WINDOW_WARNING,
      row: { note: null },
    })
    expect(store.updateManagement).toHaveBeenCalledOnce()
  })

  it('prevents database mutation when initial invalidation fails', async () => {
    const { cache, store, coordinator } = setup()
    cache.delete.mockRejectedValue(new Error('KV unavailable'))
    await expect(coordinator.update('new-code', { enabled: false })).rejects.toThrow('KV unavailable')
    expect(store.updateManagement).not.toHaveBeenCalled()
  })
})
