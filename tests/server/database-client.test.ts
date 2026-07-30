import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { withDatabase } from '../../server/database/client'

function eventWithHyperdrive(value: unknown): H3Event {
  return {
    context: { cloudflare: { env: { HYPERDRIVE: value } } },
  } as unknown as H3Event
}

function mockClient(options: { connectError?: Error } = {}) {
  return {
    connect: options.connectError
      ? vi.fn().mockRejectedValue(options.connectError)
      : vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
  }
}

describe('withDatabase', () => {
  it('uses the Hyperdrive connection string and closes after success', async () => {
    const client = mockClient()
    const factory = vi.fn().mockReturnValue(client)
    const operation = vi.fn().mockResolvedValue('ok')

    await expect(withDatabase(
      eventWithHyperdrive({ connectionString: 'postgresql://hyperdrive.internal/database' }),
      operation,
      factory as never,
    )).resolves.toBe('ok')

    expect(factory).toHaveBeenCalledWith('postgresql://hyperdrive.internal/database')
    expect(client.connect).toHaveBeenCalledOnce()
    expect(operation).toHaveBeenCalledOnce()
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('fails before creating a client when the binding is missing', async () => {
    const factory = vi.fn()
    process.env.DATABASE_URL = 'postgresql://must-not-be-used.invalid/database'

    try {
      await expect(withDatabase(eventWithHyperdrive(undefined), vi.fn(), factory)).rejects.toThrow()
      expect(factory).not.toHaveBeenCalled()
    }
    finally {
      delete process.env.DATABASE_URL
    }
  })

  it('closes the client when connect fails', async () => {
    const client = mockClient({ connectError: new Error('connect failed') })

    await expect(withDatabase(
      eventWithHyperdrive({ connectionString: 'postgresql://hyperdrive.internal/database' }),
      vi.fn(),
      vi.fn().mockReturnValue(client) as never,
    )).rejects.toThrow('connect failed')

    expect(client.connect).toHaveBeenCalledOnce()
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('closes the client when the database operation fails', async () => {
    const client = mockClient()

    await expect(withDatabase(
      eventWithHyperdrive({ connectionString: 'postgresql://hyperdrive.internal/database' }),
      vi.fn().mockRejectedValue(new Error('query failed')),
      vi.fn().mockReturnValue(client) as never,
    )).rejects.toThrow('query failed')

    expect(client.connect).toHaveBeenCalledOnce()
    expect(client.end).toHaveBeenCalledOnce()
  })
})
