import { z } from 'zod'
import { createDocument } from 'zod-openapi'
import {
  createShortUrlResponseSchema,
  creationErrorResponseSchema,
  databaseHealthErrorResponseSchema,
  databaseHealthOkResponseSchema,
  managementErrorResponseSchema,
  managementResponseSchema,
  updateShortUrlResponseSchema,
  validationErrorResponseSchema,
} from '../schemas/api-contract'
import {
  createShortUrlBodySchema,
  updateShortUrlBodySchema,
} from '../schemas/short-url'

const json = <TSchema extends z.ZodType>(schema: TSchema, example?: unknown) => ({
  'application/json': {
    schema,
    ...(example === undefined ? {} : { example }),
  },
})

const codePathParamsSchema = z.object({
  code: z.string()
    .regex(/^[A-Za-z0-9]{8}$/)
    .meta({
      description: '要查詢或更新的 8 字元短碼。',
      example: 'Abcd1234',
    }),
})

const managementSecurity = [{ ManagementPassword: [] }]

export function createOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'URLow API',
      version: '1.0.0',
      description: 'URLow 短網址建立、管理與服務健康檢查 API。',
    },
    servers: [{ url: '/', description: '目前的 URLow 部署' }],
    tags: [
      { name: 'Short URLs', description: '建立與管理短網址。' },
      { name: 'Health', description: '檢查後端服務狀態。' },
    ],
    components: {
      securitySchemes: {
        ManagementPassword: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Management-Password',
          description: '短網址建立時設定的管理密碼。密碼只會送至受保護的管理 API。',
        },
      },
    },
    paths: {
      '/api/short-urls': {
        post: {
          tags: ['Short URLs'],
          operationId: 'createShortUrl',
          summary: '建立短網址',
          description: '建立新的短網址，可選填管理密碼與私人備註。',
          requestBody: {
            required: true,
            description: '短網址建立內容。',
            content: json(createShortUrlBodySchema, {
              originalUrl: 'https://example.com/article',
              note: '行銷活動連結',
            }),
          },
          responses: {
            201: {
              description: '短網址建立成功。',
              content: json(createShortUrlResponseSchema, {
                data: {
                  code: 'aB3xY8qP',
                  originalUrl: 'https://example.com/article',
                  shortUrl: 'https://urlow.example/aB3xY8qP',
                  note: '行銷活動連結',
                  enabled: true,
                  hasManagementPassword: false,
                },
              }),
            },
            400: {
              description: '請求內容無效。',
              content: json(validationErrorResponseSchema),
            },
            500: {
              description: '建立短網址時發生未預期錯誤。',
              content: json(creationErrorResponseSchema),
            },
            503: {
              description: '短碼配置失敗或資料庫暫時無法使用。',
              content: json(creationErrorResponseSchema),
            },
          },
        },
      },
      '/api/short-urls/{code}/management': {
        get: {
          tags: ['Short URLs'],
          operationId: 'getShortUrlManagement',
          summary: '查詢短網址管理資料',
          description: '驗證管理密碼後，取得私人備註與管理狀態。',
          security: managementSecurity,
          requestParams: { path: codePathParamsSchema },
          responses: {
            200: {
              description: '已取得短網址管理資料。',
              content: json(managementResponseSchema),
            },
            401: {
              description: '管理密碼缺少或不正確。',
              content: json(managementErrorResponseSchema),
            },
            403: {
              description: '此短網址未設定管理密碼，無法管理。',
              content: json(managementErrorResponseSchema),
            },
            404: {
              description: '找不到指定的短網址。',
              content: json(managementErrorResponseSchema),
            },
            429: {
              description: '管理驗證嘗試次數過多。',
              content: json(managementErrorResponseSchema),
            },
            500: {
              description: '查詢管理資料時發生未預期錯誤。',
              content: json(managementErrorResponseSchema),
            },
            503: {
              description: '短網址管理服務暫時無法使用。',
              content: json(managementErrorResponseSchema),
            },
          },
        },
      },
      '/api/short-urls/{code}': {
        patch: {
          tags: ['Short URLs'],
          operationId: 'updateShortUrl',
          summary: '更新短網址',
          description: '驗證管理密碼後，部分更新原始網址、私人備註或啟用狀態。',
          security: managementSecurity,
          requestParams: { path: codePathParamsSchema },
          requestBody: {
            required: true,
            description: '至少包含一個要更新的欄位。',
            content: json(updateShortUrlBodySchema, {
              note: '更新後的私人備註',
              enabled: false,
            }),
          },
          responses: {
            200: {
              description: '短網址管理資料已更新。',
              content: json(updateShortUrlResponseSchema),
            },
            400: {
              description: '請求內容無效。',
              content: json(validationErrorResponseSchema),
            },
            401: {
              description: '管理密碼缺少或不正確。',
              content: json(managementErrorResponseSchema),
            },
            403: {
              description: '此短網址未設定管理密碼，無法管理。',
              content: json(managementErrorResponseSchema),
            },
            404: {
              description: '找不到指定的短網址。',
              content: json(managementErrorResponseSchema),
            },
            429: {
              description: '管理驗證嘗試次數過多。',
              content: json(managementErrorResponseSchema),
            },
            500: {
              description: '更新管理資料時發生未預期錯誤。',
              content: json(managementErrorResponseSchema),
            },
            503: {
              description: '短網址管理服務暫時無法使用。',
              content: json(managementErrorResponseSchema),
            },
          },
        },
      },
      '/api/health/database': {
        get: {
          tags: ['Health'],
          operationId: 'getDatabaseHealth',
          summary: '檢查資料庫狀態',
          description: '執行輕量查詢，確認後端資料庫是否可用。',
          responses: {
            200: {
              description: '資料庫可正常使用。',
              content: json(databaseHealthOkResponseSchema, { status: 'ok' }),
            },
            503: {
              description: '資料庫目前無法使用。',
              content: json(databaseHealthErrorResponseSchema, {
                status: 'error',
                code: 'DATABASE_UNAVAILABLE',
              }),
            },
          },
        },
      },
    },
  })
}
