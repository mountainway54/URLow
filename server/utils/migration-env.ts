import { z } from 'zod'

const databaseUrlSchema = z.string().min(1, 'DATABASE_URL is required').transform((value, context) => {
  let url: URL

  try {
    url = new URL(value)
  }
  catch {
    context.addIssue({ code: 'custom', message: 'DATABASE_URL must be a valid URL' })
    return z.NEVER
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    context.addIssue({ code: 'custom', message: 'DATABASE_URL must use PostgreSQL' })
  }

  if (url.searchParams.get('sslmode') !== 'require') {
    context.addIssue({ code: 'custom', message: 'DATABASE_URL must include sslmode=require' })
  }

  return value
})

export function parseMigrationDatabaseUrl(value: string | undefined): string {
  return databaseUrlSchema.parse(value)
}
