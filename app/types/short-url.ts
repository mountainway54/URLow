export interface ShortUrlData {
  code: string
  originalUrl: string
  shortUrl: string
  note: string | null
  enabled: boolean
  hasManagementPassword: boolean
}

export interface ManagedShortUrlData extends ShortUrlData {
  createdAt: string
  updatedAt: string
}

export interface UpdatedShortUrlData extends ManagedShortUrlData {
  cacheSynchronized: boolean
  staleWindowWarning: string
}

export interface CreateShortUrlBody {
  originalUrl: string
  managementPassword?: string
  note?: string | null
}

export type UpdateShortUrlBody = Partial<
  Pick<ManagedShortUrlData, 'originalUrl' | 'note' | 'enabled'>
>

export interface ValidationIssue {
  path: string
  message: string
}

export type ShortUrlApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'SHORT_CODE_GENERATION_FAILED'
  | 'DATABASE_UNAVAILABLE'
  | 'MANAGEMENT_UNAUTHORIZED'
  | 'MANAGEMENT_FORBIDDEN'
  | 'SHORT_URL_NOT_FOUND'
  | 'MANAGEMENT_RATE_LIMITED'
  | 'MANAGEMENT_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR'

export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
    issues?: ValidationIssue[]
  }
}

export interface ApiDataEnvelope<TData> {
  data: TData
}
