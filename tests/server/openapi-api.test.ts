import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setResponseHeader: vi.fn(),
}))

vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    defineEventHandler: (handler: unknown) => handler,
    setResponseHeader: mocks.setResponseHeader,
  }
})

import handler from '../../server/api/openapi.json.get'

describe('GET /api/openapi.json', () => {
  it('returns the public document without Cloudflare runtime bindings', async () => {
    const event = { context: {} } as H3Event

    const response = await handler(event)

    expect(mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'content-type',
      'application/json; charset=utf-8',
    )
    expect(response).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'URLow API', version: '1.0.0' },
      servers: [{ url: '/' }],
    })
    expect(Object.keys(response.paths ?? {})).toHaveLength(4)
  })
})
