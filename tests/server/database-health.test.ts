import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  databaseHealthErrorResponseSchema,
  databaseHealthOkResponseSchema,
} from '../../server/schemas/api-contract'
import { getDatabaseHealth } from '../../server/services/database-health'

const event = { context: {} } as H3Event

describe('database health endpoint contract', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the exact success response after SELECT 1', async () => {
    const execute = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    const run = vi.fn(async (_event, operation) => operation({ execute }))

    const result = await getDatabaseHealth(event, run as never)
    expect(result).toEqual({
      statusCode: 200,
      body: { status: 'ok' },
    })
    expect(databaseHealthOkResponseSchema.safeParse(result.body).success).toBe(true)
    expect(execute).toHaveBeenCalledOnce()
  })

  it.each([
    ['configuration', new Error('postgresql://admin:password@secret.neon.tech/database')],
    ['connection', Object.assign(new Error('connect ECONNREFUSED secret.neon.tech'), { name: 'ConnectionError' })],
    ['query', Object.assign(new Error('password authentication failed for admin'), { name: 'DatabaseError' })],
  ])('returns a sanitized 503 for %s failure', async (_kind, error) => {
    const run = vi.fn().mockRejectedValue(error)
    const result = await getDatabaseHealth(event, run)
    const serialized = JSON.stringify(result)

    expect(result).toEqual({
      statusCode: 503,
      body: { status: 'error', code: 'DATABASE_UNAVAILABLE' },
    })
    expect(databaseHealthErrorResponseSchema.safeParse(result.body).success).toBe(true)
    expect(serialized).not.toMatch(/postgres|neon|admin|password|ECONNREFUSED/i)
  })
})
