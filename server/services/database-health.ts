import { sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { withDatabase, type Database } from '../database/client'

export type DatabaseHealthResult =
  | { statusCode: 200, body: { status: 'ok' } }
  | { statusCode: 503, body: { status: 'error', code: 'DATABASE_UNAVAILABLE' } }

type DatabaseRunner = <T>(
  event: H3Event,
  operation: (database: Database) => Promise<T>,
) => Promise<T>

export async function getDatabaseHealth(
  event: H3Event,
  run: DatabaseRunner = withDatabase,
): Promise<DatabaseHealthResult> {
  try {
    await run(event, database => database.execute(sql`SELECT 1`))
    return { statusCode: 200, body: { status: 'ok' } }
  }
  catch (error) {
    console.error('Database health check failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return {
      statusCode: 503,
      body: { status: 'error', code: 'DATABASE_UNAVAILABLE' },
    }
  }
}
