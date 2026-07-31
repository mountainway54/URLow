import type {
  ApiDataEnvelope,
  ApiErrorEnvelope,
  CreateShortUrlBody,
  ManagedShortUrlData,
  ShortUrlApiErrorCode,
  ShortUrlData,
  UpdatedShortUrlData,
  UpdateShortUrlBody,
  ValidationIssue,
} from '~/types/short-url'

const knownErrorCodes = new Set<ShortUrlApiErrorCode>([
  'VALIDATION_ERROR',
  'SHORT_CODE_GENERATION_FAILED',
  'DATABASE_UNAVAILABLE',
  'MANAGEMENT_UNAUTHORIZED',
  'MANAGEMENT_FORBIDDEN',
  'SHORT_URL_NOT_FOUND',
  'MANAGEMENT_RATE_LIMITED',
  'MANAGEMENT_UNAVAILABLE',
  'INTERNAL_ERROR',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numericStatus(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function errorEnvelope(value: unknown): ApiErrorEnvelope | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined

  const { code, message, issues } = value.error
  if (typeof code !== 'string' || typeof message !== 'string') return undefined

  const normalizedIssues = Array.isArray(issues)
    ? issues.filter((issue): issue is ValidationIssue =>
        isRecord(issue)
        && typeof issue.path === 'string'
        && typeof issue.message === 'string',
      )
    : undefined

  return {
    error: {
      code,
      message,
      ...(normalizedIssues ? { issues: normalizedIssues } : {}),
    },
  }
}

export class ShortUrlApiError extends Error {
  readonly statusCode?: number
  readonly code: ShortUrlApiErrorCode
  readonly issues: readonly ValidationIssue[]

  constructor(options: {
    statusCode?: number
    code: ShortUrlApiErrorCode
    issues?: readonly ValidationIssue[]
  }) {
    super('Short URL API request failed')
    this.name = 'ShortUrlApiError'
    this.statusCode = options.statusCode
    this.code = options.code
    this.issues = options.issues ?? []
  }
}

export function normalizeShortUrlApiError(error: unknown): ShortUrlApiError {
  if (error instanceof ShortUrlApiError) return error

  const errorRecord = isRecord(error) ? error : undefined
  const response = errorRecord && isRecord(errorRecord.response)
    ? errorRecord.response
    : undefined
  const data = errorEnvelope(
    response?.data
    ?? errorRecord?.data,
  )
  const rawCode = data?.error.code
  const code = rawCode && knownErrorCodes.has(rawCode as ShortUrlApiErrorCode)
    ? rawCode as ShortUrlApiErrorCode
    : 'UNKNOWN_ERROR'

  return new ShortUrlApiError({
    statusCode: numericStatus(response?.status)
      ?? numericStatus(response?.statusCode)
      ?? numericStatus(errorRecord?.statusCode)
      ?? numericStatus(errorRecord?.status),
    code,
    issues: data?.error.issues,
  })
}

async function request<TData>(
  path: string,
  options: Parameters<typeof $fetch>[1],
): Promise<TData> {
  try {
    const response = await $fetch<ApiDataEnvelope<TData>>(path, options)
    return response.data
  }
  catch (error) {
    throw normalizeShortUrlApiError(error)
  }
}

export function useShortUrlApi() {
  return {
    createShortUrl(body: CreateShortUrlBody) {
      return request<ShortUrlData>('/api/short-urls', {
        method: 'POST',
        body,
      })
    },

    getManagedShortUrl(code: string, managementPassword: string) {
      return request<ManagedShortUrlData>(
        `/api/short-urls/${encodeURIComponent(code)}/management`,
        {
          method: 'GET',
          headers: {
            'X-Management-Password': managementPassword,
          },
        },
      )
    },

    updateShortUrl(
      code: string,
      managementPassword: string,
      body: UpdateShortUrlBody,
    ) {
      return request<UpdatedShortUrlData>(
        `/api/short-urls/${encodeURIComponent(code)}`,
        {
          method: 'PATCH',
          headers: {
            'X-Management-Password': managementPassword,
          },
          body,
        },
      )
    },
  }
}
