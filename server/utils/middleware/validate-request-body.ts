import {
  defineEventHandler,
  readBody,
  setResponseStatus,
  type H3Event,
} from 'h3'
import { z, type ZodType } from 'zod'

export interface ValidationIssue {
  path: string
  message: string
}

export interface ValidationErrorBody {
  error: {
    code: 'VALIDATION_ERROR'
    message: 'Request body is invalid'
    issues: ValidationIssue[]
  }
}

type ValidatedBodyHandler<TSchema extends ZodType> = (
  event: H3Event,
  body: z.output<TSchema>,
) => unknown | Promise<unknown>

function validationError(issues: ValidationIssue[]): ValidationErrorBody {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request body is invalid',
      issues,
    },
  }
}

export function withValidatedBody<TSchema extends ZodType>(
  schema: TSchema,
  handler: ValidatedBodyHandler<TSchema>,
) {
  return defineEventHandler(async (event) => {
    let body: unknown

    try {
      body = await readBody(event)
    }
    catch {
      setResponseStatus(event, 400)
      return validationError([{
        path: '',
        message: 'Request body must be valid JSON',
      }])
    }

    const result = schema.safeParse(body)
    if (!result.success) {
      setResponseStatus(event, 400)
      return validationError(result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })))
    }

    return handler(event, result.data)
  })
}
