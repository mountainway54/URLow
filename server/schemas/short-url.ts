import { z } from 'zod'

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

export const createShortUrlBodySchema = z.strictObject({
  originalUrl: absoluteHttpUrl,
})

export type CreateShortUrlBody = z.output<typeof createShortUrlBodySchema>
