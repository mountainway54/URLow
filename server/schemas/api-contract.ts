import { z } from 'zod'

const shortCodeSchema = z.string()
  .regex(/^[A-Za-z0-9]{8}$/)
  .meta({
    description: '由 8 個 Base62 字元組成的短碼。',
    example: 'aB3xY8qP',
  })

const httpUrlSchema = z.url().meta({
  description: 'HTTP(S) 絕對網址。',
  example: 'https://example.com/article',
})

const nullableNoteSchema = z.string().max(240).nullable().meta({
  description: '私人備註；未設定時為 null。',
  example: '行銷活動連結',
})

const isoDateTimeSchema = z.iso.datetime().meta({
  description: 'ISO 8601 UTC 日期時間。',
  example: '2026-07-31T00:01:00.000Z',
})

export const shortUrlDataSchema = z.strictObject({
  code: shortCodeSchema,
  originalUrl: httpUrlSchema.meta({ description: '已正規化的原始網址。' }),
  shortUrl: httpUrlSchema.meta({ description: '可分享的完整短網址。' }),
  note: nullableNoteSchema,
  enabled: z.boolean().meta({
    description: '短網址是否可繼續導向。',
    example: true,
  }),
  hasManagementPassword: z.boolean().meta({
    description: '此短網址是否設有管理密碼。',
    example: true,
  }),
}).meta({
  id: 'ShortUrlData',
  description: '短網址的公開建立結果。',
})

export const createShortUrlResponseSchema = z.strictObject({
  data: shortUrlDataSchema,
}).meta({
  id: 'CreateShortUrlResponse',
  description: '短網址建立成功回應。',
})

export const managementDataSchema = shortUrlDataSchema.extend({
  createdAt: isoDateTimeSchema.meta({ description: '短網址建立時間。' }),
  updatedAt: isoDateTimeSchema.meta({ description: '管理資料最後更新時間。' }),
}).meta({
  id: 'ManagementData',
  description: '通過授權後可讀取的短網址管理資料。',
})

export const managementResponseSchema = z.strictObject({
  data: managementDataSchema,
}).meta({
  id: 'ManagementResponse',
  description: '短網址管理資料查詢成功回應。',
})

export const updateShortUrlResponseSchema = z.strictObject({
  data: managementDataSchema.extend({
    cacheSynchronized: z.boolean().meta({
      description: '本次更新是否已同步至 redirect cache。',
      example: true,
    }),
    staleWindowWarning: z.string().min(1).meta({
      description: '跨區域 KV 最終一致性的提示。',
    }),
  }),
}).meta({
  id: 'UpdateShortUrlResponse',
  description: '短網址管理資料更新成功回應。',
})

export const validationErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION_ERROR'),
    message: z.literal('Request body is invalid'),
    issues: z.array(z.strictObject({
      path: z.string().meta({
        description: '驗證失敗的欄位路徑；整個 body 失敗時為空字串。',
        example: 'originalUrl',
      }),
      message: z.string().min(1).meta({
        description: '不含敏感資料的驗證錯誤說明。',
      }),
    })).min(1),
  }),
}).meta({
  id: 'ValidationErrorResponse',
  description: '請求內容驗證失敗回應。',
})

const errorEnvelope = <TCode extends [string, ...string[]]>(
  id: string,
  codes: TCode,
) => z.strictObject({
  error: z.strictObject({
    code: z.enum(codes).meta({ description: '穩定且可供程式判斷的錯誤代碼。' }),
    message: z.string().min(1).meta({ description: '不含敏感資料的錯誤說明。' }),
  }),
}).meta({ id })

export const creationErrorResponseSchema = errorEnvelope(
  'CreationErrorResponse',
  ['SHORT_CODE_GENERATION_FAILED', 'DATABASE_UNAVAILABLE', 'INTERNAL_ERROR'],
)

export const managementErrorResponseSchema = errorEnvelope(
  'ManagementErrorResponse',
  [
    'MANAGEMENT_UNAUTHORIZED',
    'MANAGEMENT_FORBIDDEN',
    'SHORT_URL_NOT_FOUND',
    'MANAGEMENT_RATE_LIMITED',
    'MANAGEMENT_UNAVAILABLE',
    'INTERNAL_ERROR',
  ],
)

export const databaseHealthOkResponseSchema = z.strictObject({
  status: z.literal('ok'),
}).meta({
  id: 'DatabaseHealthOkResponse',
  description: '資料庫可用時的健康檢查回應。',
})

export const databaseHealthErrorResponseSchema = z.strictObject({
  status: z.literal('error'),
  code: z.literal('DATABASE_UNAVAILABLE'),
}).meta({
  id: 'DatabaseHealthErrorResponse',
  description: '資料庫無法使用時的健康檢查回應。',
})
