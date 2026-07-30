import { ShortCodeGenerationExhaustedError } from '../services/short-url-creation'
import { ShortUrlPersistenceError } from '../services/short-url-repository'

const unableToCreateMessage = 'Unable to create short URL' as const

export type ShortUrlCreationErrorResponse =
  | {
      statusCode: 503
      body: {
        error: {
          code: 'SHORT_CODE_GENERATION_FAILED'
          message: 'Unable to allocate a unique short code'
        }
      }
    }
  | {
      statusCode: 503
      body: {
        error: {
          code: 'DATABASE_UNAVAILABLE'
          message: typeof unableToCreateMessage
        }
      }
    }
  | {
      statusCode: 500
      body: {
        error: {
          code: 'INTERNAL_ERROR'
          message: typeof unableToCreateMessage
        }
      }
    }

export function shortUrlCreationErrorResponse(error: unknown): ShortUrlCreationErrorResponse {
  if (error instanceof ShortCodeGenerationExhaustedError) {
    return {
      statusCode: 503,
      body: {
        error: {
          code: 'SHORT_CODE_GENERATION_FAILED',
          message: 'Unable to allocate a unique short code',
        },
      },
    }
  }

  if (error instanceof ShortUrlPersistenceError) {
    return {
      statusCode: 503,
      body: {
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: unableToCreateMessage,
        },
      },
    }
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: unableToCreateMessage,
      },
    },
  }
}
