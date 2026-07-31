import { describe, expect, it, vi } from 'vitest'
import {
  createShortUrl,
  ShortCodeGenerationExhaustedError,
} from '../../server/services/short-url-creation'
import {
  isShortCodeConstraintViolation,
  ShortCodeCollisionError,
  ShortUrlPersistenceError,
} from '../../server/services/short-url-repository'

function coordinator() {
  return {
    create: vi.fn().mockResolvedValue({
      cacheSynchronized: true,
      staleWindowWarning: 'warning',
    }),
  }
}

describe('short URL creation orchestration', () => {
  it('classifies only the agreed PostgreSQL unique constraint as a collision', () => {
    expect(isShortCodeConstraintViolation({
      code: '23505',
      constraint: 'short_urls_code_unique',
    })).toBe(true)
    expect(isShortCodeConstraintViolation({
      code: '23505',
      constraint: 'another_unique_constraint',
    })).toBe(false)
    expect(isShortCodeConstraintViolation({ code: '08006' })).toBe(false)
  })

  it('returns the first persisted code after one attempt', async () => {
    const mutation = coordinator()
    const generate = vi.fn().mockReturnValue('aB3xY8qP')

    await expect(createShortUrl('https://example.com/article', mutation, generate))
      .resolves.toEqual({
        code: 'aB3xY8qP',
        originalUrl: 'https://example.com/article',
        note: null,
        enabled: true,
        hasManagementPassword: false,
        cacheSynchronized: true,
      })
    expect(mutation.create).toHaveBeenCalledOnce()
  })

  it('retries a short-code collision and uses the second code', async () => {
    const mutation = coordinator()
    mutation.create
      .mockRejectedValueOnce(new ShortCodeCollisionError())
      .mockResolvedValueOnce({ cacheSynchronized: true, staleWindowWarning: 'warning' })
    const generate = vi.fn()
      .mockReturnValueOnce('AAAAAAAA')
      .mockReturnValueOnce('BBBBBBBB')

    await expect(createShortUrl('https://example.com', mutation, generate))
      .resolves.toMatchObject({ code: 'BBBBBBBB' })
    expect(mutation.create).toHaveBeenCalledTimes(2)
    expect(mutation.create).toHaveBeenNthCalledWith(
      1,
      'AAAAAAAA',
      'https://example.com',
      { managementPasswordHash: null, note: null },
    )
    expect(mutation.create).toHaveBeenNthCalledWith(
      2,
      'BBBBBBBB',
      'https://example.com',
      { managementPasswordHash: null, note: null },
    )
  })

  it('stops after five collisions without a sixth insert attempt', async () => {
    const mutation = coordinator()
    mutation.create.mockRejectedValue(new ShortCodeCollisionError())
    const generate = vi.fn()
      .mockReturnValueOnce('AAAAAAAA')
      .mockReturnValueOnce('BBBBBBBB')
      .mockReturnValueOnce('CCCCCCCC')
      .mockReturnValueOnce('DDDDDDDD')
      .mockReturnValueOnce('EEEEEEEE')

    await expect(createShortUrl('https://example.com', mutation, generate))
      .rejects.toBeInstanceOf(ShortCodeGenerationExhaustedError)
    expect(mutation.create).toHaveBeenCalledTimes(5)
    expect(generate).toHaveBeenCalledTimes(5)
  })

  it('does not retry a non-collision persistence error', async () => {
    const mutation = coordinator()
    const error = new ShortUrlPersistenceError()
    mutation.create.mockRejectedValue(error)
    const generate = vi.fn().mockReturnValue('AAAAAAAA')

    await expect(createShortUrl('https://example.com', mutation, generate)).rejects.toBe(error)
    expect(mutation.create).toHaveBeenCalledOnce()
  })

  it('preserves successful creation when KV synchronization fails', async () => {
    const mutation = coordinator()
    mutation.create.mockResolvedValue({
      cacheSynchronized: false,
      staleWindowWarning: 'warning',
    })

    await expect(createShortUrl(
      'https://example.com',
      mutation,
      vi.fn().mockReturnValue('AAAAAAAA'),
    )).resolves.toEqual({
      code: 'AAAAAAAA',
      originalUrl: 'https://example.com',
      note: null,
      enabled: true,
      hasManagementPassword: false,
      cacheSynchronized: false,
    })
  })

  it('hashes management password once and passes only the hash to persistence', async () => {
    const mutation = coordinator()
    const hashPassword = vi.fn().mockResolvedValue('$2b$10$stored')

    await expect(createShortUrl(
      {
        originalUrl: 'https://example.com',
        managementPassword: 'secret12',
        note: 'private',
      },
      mutation,
      vi.fn().mockReturnValue('AAAAAAAA'),
      hashPassword,
    )).resolves.toMatchObject({
      note: 'private',
      hasManagementPassword: true,
    })
    expect(hashPassword).toHaveBeenCalledWith('secret12')
    expect(mutation.create).toHaveBeenCalledWith(
      'AAAAAAAA',
      'https://example.com',
      { managementPasswordHash: '$2b$10$stored', note: 'private' },
    )
  })
})
