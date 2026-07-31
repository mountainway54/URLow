import { eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { withDatabase } from '../database/client'
import { shortUrls } from '../database/schema'
import type { RedirectLookup } from './short-url-cache'
import type { ShortUrlCreationStore } from './short-url-mutations'
import type {
  ManagementMutationInput,
  ManagementRecord,
  ShortUrlManagementStore,
} from './short-url-management'

export class ShortCodeCollisionError extends Error {
  constructor() {
    super('A generated short code already exists')
    this.name = 'ShortCodeCollisionError'
  }
}

export class ShortUrlPersistenceError extends Error {
  constructor(_cause?: unknown) {
    super('Short URL persistence is unavailable')
    this.name = 'ShortUrlPersistenceError'
  }
}

interface PostgreSqlError {
  code?: unknown
  constraint?: unknown
}

export function isShortCodeConstraintViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const databaseError = error as PostgreSqlError
  return databaseError.code === '23505'
    && databaseError.constraint === 'short_urls_code_unique'
}

export class ShortUrlRepository implements RedirectLookup, ShortUrlCreationStore, ShortUrlManagementStore {
  constructor(private readonly event: H3Event) {}

  async insert(
    code: string,
    targetUrl: string,
    metadata: { managementPasswordHash: string | null, note: string | null } = {
      managementPasswordHash: null,
      note: null,
    },
  ): Promise<void> {
    try {
      await withDatabase(this.event, async (database) => {
        await database.insert(shortUrls).values({
          code,
          originalUrl: targetUrl,
          managementPasswordHash: metadata.managementPasswordHash,
          note: metadata.note,
        })
      })
    }
    catch (error) {
      if (isShortCodeConstraintViolation(error)) {
        throw new ShortCodeCollisionError()
      }

      console.error('Short URL database insert failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
      throw new ShortUrlPersistenceError(error)
    }
  }

  async findTargetByCode(code: string): Promise<{ targetUrl: string, enabled: boolean } | null> {
    return withDatabase(this.event, async (database) => {
      const rows = await database
        .select({
          targetUrl: shortUrls.originalUrl,
          enabled: shortUrls.enabled,
        })
        .from(shortUrls)
        .where(eq(shortUrls.code, code))
        .limit(1)

      return rows[0] ?? null
    })
  }

  async findManagementByCode(code: string): Promise<ManagementRecord | null> {
    try {
      return await withDatabase(this.event, async (database) => {
        const rows = await database
          .select({
            code: shortUrls.code,
            originalUrl: shortUrls.originalUrl,
            managementPasswordHash: shortUrls.managementPasswordHash,
            note: shortUrls.note,
            enabled: shortUrls.enabled,
            createdAt: shortUrls.createdAt,
            updatedAt: shortUrls.updatedAt,
          })
          .from(shortUrls)
          .where(eq(shortUrls.code, code))
          .limit(1)

        return rows[0] ?? null
      })
    }
    catch (error) {
      console.error('Short URL management lookup failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
      throw new ShortUrlPersistenceError(error)
    }
  }

  async updateManagement(code: string, input: ManagementMutationInput): Promise<ManagementRecord | null> {
    try {
      return await withDatabase(this.event, async (database) => {
        const rows = await database
          .update(shortUrls)
          .set({
            ...input,
            updatedAt: sql`now()`,
          })
          .where(eq(shortUrls.code, code))
          .returning({
            code: shortUrls.code,
            originalUrl: shortUrls.originalUrl,
            managementPasswordHash: shortUrls.managementPasswordHash,
            note: shortUrls.note,
            enabled: shortUrls.enabled,
            createdAt: shortUrls.createdAt,
            updatedAt: shortUrls.updatedAt,
          })

        return rows[0] ?? null
      })
    }
    catch (error) {
      console.error('Short URL management update failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
      throw new ShortUrlPersistenceError(error)
    }
  }
}
