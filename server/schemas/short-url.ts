import { z } from 'zod'
import {
  MANAGEMENT_PASSWORD_MAX_BYTES,
  MANAGEMENT_PASSWORD_MAX_LENGTH,
  MANAGEMENT_PASSWORD_MIN_LENGTH,
  normalizeManagementPassword,
} from '../services/management-password'

const absoluteHttpUrl = z.string()
  .trim()
  .min(1, 'originalUrl is required')
  .max(2048, 'originalUrl must be at most 2048 characters')
  .url('originalUrl must be an absolute URL')
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    }
    catch {
      return false
    }
  }, 'originalUrl must use HTTP or HTTPS')
  .meta({
    description: '要縮短或更新的 HTTP(S) 絕對網址，會先移除前後空白。',
    example: 'https://example.com/article',
  })

const optionalNote = z.union([
  z.string()
    .transform(value => value.trim())
    .refine(value => value.length <= 240, 'note must be at most 240 characters')
    .transform(value => value || null),
  z.null(),
]).meta({
  description: '私人備註；空字串或只有空白時會正規化為 null。',
  example: '行銷活動連結',
})

export const createShortUrlBodySchema = z.strictObject({
  originalUrl: absoluteHttpUrl,
  managementPassword: z.string()
    .transform(normalizeManagementPassword)
    .refine(
      value => value.length === 0
        || (
          [...value].length >= MANAGEMENT_PASSWORD_MIN_LENGTH
          && [...value].length <= MANAGEMENT_PASSWORD_MAX_LENGTH
          && new TextEncoder().encode(value).byteLength <= MANAGEMENT_PASSWORD_MAX_BYTES
        ),
      'managementPassword must be 6-72 characters and at most 72 UTF-8 bytes',
    )
    .transform(value => value || undefined)
    .optional()
    .meta({
      description: '選填的管理密碼，須為 6 至 72 個 Unicode 字元且不超過 72 UTF-8 bytes。',
    }),
  note: optionalNote
    .optional()
    .transform(value => value ?? null),
}).meta({
  id: 'CreateShortUrlRequest',
  description: '建立短網址的請求內容。',
})

export type CreateShortUrlBody = z.output<typeof createShortUrlBodySchema>

export const updateShortUrlBodySchema = z.strictObject({
  originalUrl: absoluteHttpUrl.optional(),
  note: optionalNote.optional(),
  enabled: z.boolean().optional().meta({
    description: '短網址是否可繼續導向。',
    example: true,
  }),
}).refine(
  value => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
).meta({
  id: 'UpdateShortUrlRequest',
  description: '短網址管理欄位的部分更新內容，至少需要一個欄位。',
})

export type UpdateShortUrlBody = z.output<typeof updateShortUrlBodySchema>
