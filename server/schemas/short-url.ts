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

const optionalNote = z.union([
  z.string()
    .transform(value => value.trim())
    .refine(value => value.length <= 240, 'note must be at most 240 characters')
    .transform(value => value || null),
  z.null(),
])

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
    .optional(),
  note: optionalNote
    .optional()
    .transform(value => value ?? null),
})

export type CreateShortUrlBody = z.output<typeof createShortUrlBodySchema>

export const updateShortUrlBodySchema = z.strictObject({
  originalUrl: absoluteHttpUrl.optional(),
  note: optionalNote.optional(),
  enabled: z.boolean().optional(),
}).refine(
  value => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
)

export type UpdateShortUrlBody = z.output<typeof updateShortUrlBodySchema>
