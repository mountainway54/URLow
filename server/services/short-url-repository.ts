import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { withDatabase } from '../database/client'
import { shortUrls } from '../database/schema'
import type { RedirectLookup } from './short-url-cache'

export class ShortUrlRepository implements RedirectLookup {
  constructor(private readonly event: H3Event) {}

  async findTargetByCode(code: string): Promise<string | null> {
    return withDatabase(this.event, async (database) => {
      const rows = await database
        .select({ targetUrl: shortUrls.originalUrl })
        .from(shortUrls)
        .where(eq(shortUrls.code, code))
        .limit(1)

      return rows[0]?.targetUrl ?? null
    })
  }
}
