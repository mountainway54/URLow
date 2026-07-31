import { readFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createShortUrlBodySchema } from '../../server/schemas/short-url'
import { withValidatedBody } from '../../server/utils/middleware/validate-request-body'

const h3Mocks = vi.hoisted(() => ({
  body: undefined as unknown,
  readError: undefined as Error | undefined,
  setResponseStatus: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    defineEventHandler: (handler: unknown) => handler,
    readBody: h3Mocks.readBody,
    setResponseStatus: h3Mocks.setResponseStatus,
  }
})

function event() {
  return { context: {} } as never
}

describe('route-scoped short URL request validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.body = undefined
    h3Mocks.readError = undefined
    h3Mocks.readBody.mockImplementation(async () => {
      if (h3Mocks.readError) throw h3Mocks.readError
      return h3Mocks.body
    })
  })

  it('passes a trimmed HTTP(S) URL to the route handler', async () => {
    h3Mocks.body = { originalUrl: ' https://example.com/path?source=test ' }
    const route = vi.fn(async (_event, body) => body)
    const handler = withValidatedBody(createShortUrlBodySchema, route)

    await expect(handler(event())).resolves.toEqual({
      originalUrl: 'https://example.com/path?source=test',
      note: null,
    })
    expect(route).toHaveBeenCalledOnce()
  })

  it.each([
    ['non-object body', 'https://example.com'],
    ['missing field', {}],
    ['unknown field', { originalUrl: 'https://example.com', code: 'custom' }],
    ['empty URL', { originalUrl: '   ' }],
    ['over 2048 characters', { originalUrl: `https://example.com/${'a'.repeat(2030)}` }],
    ['relative URL', { originalUrl: '/relative' }],
    ['non-HTTP URL', { originalUrl: 'ftp://example.com/file' }],
  ])('returns a stable 400 for %s before invoking the route', async (_name, body) => {
    h3Mocks.body = body
    const route = vi.fn()
    const requestEvent = event()
    const handler = withValidatedBody(createShortUrlBodySchema, route)

    const result = await handler(requestEvent)

    expect(h3Mocks.setResponseStatus).toHaveBeenCalledWith(requestEvent, 400)
    expect(result).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body is invalid',
        issues: expect.any(Array),
      },
    })
    expect(route).not.toHaveBeenCalled()
  })

  it('accepts an originalUrl whose normalized value is exactly 2048 characters', async () => {
    const value = `https://example.com/${'a'.repeat(2028)}`
    expect(value).toHaveLength(2048)
    h3Mocks.body = { originalUrl: value }
    const route = vi.fn(async (_event, body) => body)

    await expect(withValidatedBody(createShortUrlBodySchema, route)(event()))
      .resolves.toEqual({ originalUrl: value, note: null })
  })

  it('normalizes malformed JSON to the same safe 400 contract', async () => {
    h3Mocks.readError = new SyntaxError('Unexpected token with secret payload')
    const route = vi.fn()
    const requestEvent = event()

    const result = await withValidatedBody(createShortUrlBodySchema, route)(requestEvent)

    expect(h3Mocks.setResponseStatus).toHaveBeenCalledWith(requestEvent, 400)
    expect(result).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body is invalid',
        issues: [{ path: '', message: 'Request body must be valid JSON' }],
      },
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(route).not.toHaveBeenCalled()
  })

  it('is not registered as global middleware or imported by existing GET routes', async () => {
    const [healthSource, redirectSource] = await Promise.all([
      readFile('server/api/health/database.get.ts', 'utf8'),
      readFile('server/middleware/short-url-redirect.ts', 'utf8'),
    ])

    expect(healthSource).not.toContain('validate-request-body')
    expect(redirectSource).not.toContain('validate-request-body')
  })
})
