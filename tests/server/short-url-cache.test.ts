import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  encodeMissingValue,
  encodeGoneValue,
  encodeRedirectValue,
  resolveRedirect,
} from '../../server/services/short-url-cache'

function setup(rawValue: string | null = null) {
  const pending: Promise<unknown>[] = []
  return {
    pending,
    cache: {
      get: vi.fn().mockResolvedValue(rawValue),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    repository: {
      findTargetByCode: vi.fn().mockResolvedValue(null),
    },
    context: {
      waitUntil: vi.fn((promise: Promise<unknown>) => pending.push(promise)),
    },
  }
}

describe('KV read-through redirect resolution', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns a positive hit without PostgreSQL', async () => {
    const dependencies = setup(encodeRedirectValue('https://example.com/target'))
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 302, targetUrl: 'https://example.com/target' })
    expect(dependencies.repository.findTargetByCode).not.toHaveBeenCalled()
  })

  it('returns a negative hit without PostgreSQL', async () => {
    const dependencies = setup(encodeMissingValue())
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 404 })
    expect(dependencies.repository.findTargetByCode).not.toHaveBeenCalled()
  })

  it('returns a gone hit without PostgreSQL', async () => {
    const dependencies = setup(encodeGoneValue())
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 410 })
    expect(dependencies.repository.findTargetByCode).not.toHaveBeenCalled()
  })

  it.each([
    'not-json',
    '{"version":2,"kind":"missing"}',
    '{"version":1,"kind":"unknown"}',
    '{"version":1,"kind":"redirect","targetUrl":"javascript:alert(1)"}',
  ])('treats invalid cache value as a miss: %s', async (rawValue) => {
    const dependencies = setup(rawValue)
    dependencies.repository.findTargetByCode.mockResolvedValue({
      targetUrl: 'https://example.com/target',
      enabled: true,
    })
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 302, targetUrl: 'https://example.com/target' })
    expect(dependencies.repository.findTargetByCode).toHaveBeenCalledOnce()
  })

  it('falls back to PostgreSQL after a KV read error', async () => {
    const dependencies = setup()
    dependencies.cache.get.mockRejectedValue(new Error('KV unavailable'))
    dependencies.repository.findTargetByCode.mockResolvedValue({
      targetUrl: 'https://example.com/target',
      enabled: true,
    })
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 302, targetUrl: 'https://example.com/target' })
  })

  it('schedules a positive backfill when PostgreSQL finds a row', async () => {
    const dependencies = setup()
    dependencies.repository.findTargetByCode.mockResolvedValue({
      targetUrl: 'https://example.com/target',
      enabled: true,
    })
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 302, targetUrl: 'https://example.com/target' })
    expect(dependencies.cache.put).toHaveBeenCalledWith(
      'redirect:nuxt-guide',
      encodeRedirectValue('https://example.com/target'),
    )
    expect(dependencies.context.waitUntil).toHaveBeenCalledOnce()
  })

  it('schedules a gone backfill when PostgreSQL finds a disabled row', async () => {
    const dependencies = setup()
    dependencies.repository.findTargetByCode.mockResolvedValue({
      targetUrl: 'https://example.com/target',
      enabled: false,
    })
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 410 })
    expect(dependencies.cache.put).toHaveBeenCalledWith(
      'redirect:nuxt-guide',
      encodeGoneValue(),
    )
  })

  it('schedules a 60-second negative backfill when PostgreSQL confirms absence', async () => {
    const dependencies = setup()
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 404 })
    expect(dependencies.cache.put).toHaveBeenCalledWith(
      'redirect:nuxt-guide',
      encodeMissingValue(),
      { expirationTtl: 60 },
    )
  })

  it('keeps 404 when a negative backfill exhausts quota', async () => {
    const dependencies = setup()
    dependencies.cache.put.mockRejectedValue(Object.assign(new Error('quota'), { name: 'QuotaError' }))
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 404 })
    await Promise.all(dependencies.pending)
    expect(console.error).toHaveBeenCalledWith(
      'Redirect cache synchronization failed',
      { errorType: 'QuotaError' },
    )
  })

  it('returns 503 when cache cannot resolve and PostgreSQL is unavailable', async () => {
    const dependencies = setup()
    dependencies.repository.findTargetByCode.mockRejectedValue(new Error('database unavailable'))
    await expect(resolveRedirect('nuxt-guide', dependencies.cache, dependencies.repository, dependencies.context))
      .resolves.toEqual({ status: 503 })
  })
})
