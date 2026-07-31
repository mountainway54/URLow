import { describe, expect, it } from 'vitest'
import { createOpenApiDocument } from '../../server/utils/openapi-document'

describe('OpenAPI document', () => {
  it('describes exactly the four JSON API operations and their response statuses', () => {
    const document = createOpenApiDocument()

    expect(document.openapi).toBe('3.1.0')
    expect(document.info).toMatchObject({ title: 'URLow API', version: '1.0.0' })
    expect(document.servers).toEqual([{ url: '/', description: '目前的 URLow 部署' }])
    expect(Object.keys(document.paths ?? {}).sort()).toEqual([
      '/api/health/database',
      '/api/short-urls',
      '/api/short-urls/{code}',
      '/api/short-urls/{code}/management',
    ])
    expect(Object.keys(document.paths?.['/api/short-urls']?.post?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '500',
      '503',
    ])
    expect(Object.keys(document.paths?.['/api/short-urls/{code}/management']?.get?.responses ?? {}).sort()).toEqual([
      '200',
      '401',
      '403',
      '404',
      '429',
      '500',
      '503',
    ])
    expect(Object.keys(document.paths?.['/api/short-urls/{code}']?.patch?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '429',
      '500',
      '503',
    ])
    expect(Object.keys(document.paths?.['/api/health/database']?.get?.responses ?? {}).sort()).toEqual([
      '200',
      '503',
    ])
  })

  it('uses JSON request and response schemas with a required code path parameter', () => {
    const document = createOpenApiDocument()
    const createOperation = document.paths?.['/api/short-urls']?.post
    const managementOperation = document.paths?.['/api/short-urls/{code}/management']?.get

    expect(createOperation?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateShortUrlRequest' },
        },
      },
    })
    expect(createOperation?.responses?.['201']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateShortUrlResponse' },
        },
      },
    })
    expect(managementOperation?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        in: 'path',
        name: 'code',
        required: true,
      }),
    ]))
  })

  it('declares management header security only for protected operations', () => {
    const document = createOpenApiDocument()

    expect(document.components?.securitySchemes?.ManagementPassword).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-Management-Password',
      description: expect.any(String),
    })
    expect(document.paths?.['/api/short-urls/{code}/management']?.get?.security)
      .toEqual([{ ManagementPassword: [] }])
    expect(document.paths?.['/api/short-urls/{code}']?.patch?.security)
      .toEqual([{ ManagementPassword: [] }])
    expect(document.paths?.['/api/short-urls']?.post?.security).toBeUndefined()
    expect(document.paths?.['/api/health/database']?.get?.security).toBeUndefined()
    expect(JSON.stringify(document)).not.toMatch(/managementPasswordHash|\$2[aby]\$/)
  })

  it('uses Traditional Chinese descriptions with stable English identifiers', () => {
    const document = createOpenApiDocument()

    expect(document.paths?.['/api/short-urls']?.post).toMatchObject({
      operationId: 'createShortUrl',
      summary: '建立短網址',
      description: expect.stringMatching(/建立新的短網址/),
    })
    expect(document.paths?.['/api/health/database']?.get).toMatchObject({
      operationId: 'getDatabaseHealth',
      summary: '檢查資料庫狀態',
    })
    expect(document.components?.schemas).toHaveProperty('CreateShortUrlRequest')
    expect(document.components?.schemas).toHaveProperty('ManagementResponse')
  })
})
