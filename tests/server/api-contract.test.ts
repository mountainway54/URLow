import { describe, expect, it } from 'vitest'
import {
  createShortUrlResponseSchema,
  databaseHealthErrorResponseSchema,
  databaseHealthOkResponseSchema,
  managementErrorResponseSchema,
  managementResponseSchema,
  updateShortUrlResponseSchema,
  validationErrorResponseSchema,
} from '../../server/schemas/api-contract'

const managementData = {
  code: 'Abcd1234',
  originalUrl: 'https://example.com/article',
  shortUrl: 'https://urlow.example/Abcd1234',
  note: 'private',
  enabled: true,
  hasManagementPassword: true,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:01:00.000Z',
}

describe('API response contracts', () => {
  it('accepts the documented success response shapes', () => {
    expect(createShortUrlResponseSchema.safeParse({
      data: {
        code: 'aB3xY8qP',
        originalUrl: 'https://example.com/article',
        shortUrl: 'https://urlow.example/aB3xY8qP',
        note: null,
        enabled: true,
        hasManagementPassword: false,
      },
    }).success).toBe(true)
    expect(managementResponseSchema.safeParse({ data: managementData }).success).toBe(true)
    expect(updateShortUrlResponseSchema.safeParse({
      data: {
        ...managementData,
        cacheSynchronized: true,
        staleWindowWarning: 'Other regions may observe an older redirect for approximately 60 seconds or longer.',
      },
    }).success).toBe(true)
    expect(databaseHealthOkResponseSchema.safeParse({ status: 'ok' }).success).toBe(true)
    expect(databaseHealthErrorResponseSchema.safeParse({
      status: 'error',
      code: 'DATABASE_UNAVAILABLE',
    }).success).toBe(true)
  })

  it('accepts stable validation and management error envelopes', () => {
    expect(validationErrorResponseSchema.safeParse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body is invalid',
        issues: [{ path: 'originalUrl', message: 'originalUrl must use HTTP or HTTPS' }],
      },
    }).success).toBe(true)
    expect(managementErrorResponseSchema.safeParse({
      error: {
        code: 'MANAGEMENT_UNAUTHORIZED',
        message: 'Management password is missing or invalid',
      },
    }).success).toBe(true)
  })

  it('rejects contract drift and sensitive response fields', () => {
    expect(createShortUrlResponseSchema.safeParse({
      data: {
        code: 'aB3xY8qP',
        originalUrl: 'https://example.com/article',
        shortUrl: 'https://urlow.example/aB3xY8qP',
        note: null,
        enabled: 'true',
        hasManagementPassword: false,
      },
    }).success).toBe(false)
    expect(managementResponseSchema.safeParse({
      data: {
        ...managementData,
        managementPasswordHash: '$2b$10$never-public',
      },
    }).success).toBe(false)
  })
})
