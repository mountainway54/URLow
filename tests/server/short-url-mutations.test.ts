import { describe, expect, it, vi } from 'vitest'
import {
  KV_STALE_WINDOW_WARNING,
  ShortUrlCreationCoordinator,
  ShortUrlMutationCoordinator,
} from '../../server/services/short-url-mutations'
import { encodeRedirectValue } from '../../server/services/short-url-cache'

function setup() {
  const order: string[] = []
  const cache = {
    get: vi.fn(),
    put: vi.fn(async () => { order.push('cache.put') }),
    delete: vi.fn(async () => { order.push('cache.delete') }),
  }
  const store = {
    insert: vi.fn(async () => { order.push('database.insert') }),
    updateTarget: vi.fn(async () => { order.push('database.update') }),
    disable: vi.fn(async () => { order.push('database.disable') }),
    delete: vi.fn(async () => { order.push('database.delete') }),
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
    const store = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
    const coordinator = new ShortUrlCreationCoordinator(cache, store)

    await expect(coordinator.create('new-code', 'https://example.com/new')).resolves.toEqual({
      cacheSynchronized: true,
      staleWindowWarning: KV_STALE_WINDOW_WARNING,
    })
    expect(store.insert).toHaveBeenCalledWith('new-code', 'https://example.com/new')
  })

  it('inserts before overwriting a negative marker', async () => {
    const { order, cache, coordinator } = setup()
    await expect(coordinator.create('new-code', 'https://example.com/new')).resolves.toEqual({
      cacheSynchronized: true,
      staleWindowWarning: KV_STALE_WINDOW_WARNING,
    })
    expect(order).toEqual(['database.insert', 'cache.put'])
    expect(cache.put).toHaveBeenCalledWith(
      'redirect:new-code',
      encodeRedirectValue('https://example.com/new'),
    )
  })

  it('exposes create cache failure without compensating database delete', async () => {
    const { cache, store, coordinator } = setup()
    cache.put.mockRejectedValue(new Error('KV unavailable'))
    await expect(coordinator.create('new-code', 'https://example.com/new')).resolves.toEqual({
      cacheSynchronized: false,
      staleWindowWarning: KV_STALE_WINDOW_WARNING,
    })
    expect(store.insert).toHaveBeenCalledOnce()
    expect(store.delete).not.toHaveBeenCalled()
    expect(cache.delete).not.toHaveBeenCalled()
  })

  it('deletes cache, updates database, then puts the new target', async () => {
    const { order, coordinator } = setup()
    await coordinator.updateTarget('new-code', 'https://example.com/updated')
    expect(order).toEqual(['cache.delete', 'database.update', 'cache.put'])
  })

  it('reports update put failure while leaving the database update authoritative', async () => {
    const { cache, store, coordinator } = setup()
    cache.put.mockRejectedValue(new Error('KV unavailable'))
    await expect(coordinator.updateTarget('new-code', 'https://example.com/updated'))
      .resolves.toMatchObject({ cacheSynchronized: false })
    expect(store.updateTarget).toHaveBeenCalledOnce()
  })

  it.each([
    ['update', (coordinator: ShortUrlMutationCoordinator) => coordinator.updateTarget('new-code', 'https://example.com/updated'), 'updateTarget'],
    ['disable', (coordinator: ShortUrlMutationCoordinator) => coordinator.disable('new-code'), 'disable'],
    ['delete', (coordinator: ShortUrlMutationCoordinator) => coordinator.delete('new-code'), 'delete'],
  ] as const)('prevents %s database mutation when initial invalidation fails', async (_name, operation, method) => {
    const { cache, store, coordinator } = setup()
    cache.delete.mockRejectedValue(new Error('KV unavailable'))
    await expect(operation(coordinator)).rejects.toThrow('KV unavailable')
    expect(store[method]).not.toHaveBeenCalled()
  })

  it.each([
    ['disable', (coordinator: ShortUrlMutationCoordinator) => coordinator.disable('new-code')],
    ['delete', (coordinator: ShortUrlMutationCoordinator) => coordinator.delete('new-code')],
  ] as const)('orders %s as cache delete before database mutation', async (_name, operation) => {
    const { order, coordinator } = setup()
    await operation(coordinator)
    expect(order[0]).toBe('cache.delete')
    expect(order[1]).toMatch(/^database\./u)
  })
})
