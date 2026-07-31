import {
  ManagementForbiddenError,
  ManagementInfrastructureError,
  ManagementNotFoundError,
  ManagementRateLimitedError,
  ManagementUnauthorizedError,
} from '../services/short-url-management'
import { ShortUrlPersistenceError } from '../services/short-url-repository'
import { ManagementRateLimiterBindingError } from './env'

interface ErrorResponse {
  statusCode: number
  body: { error: { code: string, message: string } }
}

export function shortUrlManagementErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ManagementUnauthorizedError) {
    return {
      statusCode: 401,
      body: { error: { code: 'MANAGEMENT_UNAUTHORIZED', message: 'Management password is missing or invalid' } },
    }
  }
  if (error instanceof ManagementForbiddenError) {
    return {
      statusCode: 403,
      body: { error: { code: 'MANAGEMENT_FORBIDDEN', message: 'This short URL cannot be managed' } },
    }
  }
  if (error instanceof ManagementNotFoundError) {
    return {
      statusCode: 404,
      body: { error: { code: 'SHORT_URL_NOT_FOUND', message: 'Short URL not found' } },
    }
  }
  if (error instanceof ManagementRateLimitedError) {
    return {
      statusCode: 429,
      body: { error: { code: 'MANAGEMENT_RATE_LIMITED', message: 'Too many management verification attempts' } },
    }
  }
  if (
    error instanceof ManagementInfrastructureError
    || error instanceof ShortUrlPersistenceError
    || error instanceof ManagementRateLimiterBindingError
  ) {
    return {
      statusCode: 503,
      body: { error: { code: 'MANAGEMENT_UNAVAILABLE', message: 'Short URL management is unavailable' } },
    }
  }
  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Unable to manage short URL' } },
  }
}

export function managementData(record: {
  code: string
  originalUrl: string
  note: string | null
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}, origin: string) {
  return {
    code: record.code,
    originalUrl: record.originalUrl,
    shortUrl: `${origin}/${record.code}`,
    note: record.note,
    enabled: record.enabled,
    hasManagementPassword: true,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}
