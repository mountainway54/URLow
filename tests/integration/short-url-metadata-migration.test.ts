import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseMigrationDatabaseUrl } from '../../server/utils/migration-env'

const databaseUrl = process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip
const migrationSql = readFileSync(
  fileURLToPath(new URL('../../drizzle/0001_salty_red_wolf.sql', import.meta.url)),
  'utf8',
)
const migrationStatements = migrationSql
  .split('--> statement-breakpoint')
  .map(statement => statement.trim())
  .filter(Boolean)

async function executeMigration(client: pg.Client) {
  for (const statement of migrationStatements) {
    await client.query(statement)
  }
}

async function createLegacyTable(client: pg.Client) {
  await client.query(`
    CREATE TABLE short_urls (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      original_url text NOT NULL,
      code varchar(32) NOT NULL UNIQUE,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `)
}

describeWithDatabase('short_urls metadata migration', () => {
  let client: pg.Client

  beforeAll(async () => {
    client = new pg.Client({
      connectionString: parseMigrationDatabaseUrl(databaseUrl),
      ssl: { rejectUnauthorized: true },
    })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  it('backfills existing rows from their creation timestamp', async () => {
    const schema = `migration_success_${randomUUID().replaceAll('-', '')}`
    await client.query('BEGIN')

    try {
      await client.query(`CREATE SCHEMA "${schema}"`)
      await client.query(`SET LOCAL search_path TO "${schema}", public`)
      await createLegacyTable(client)
      await client.query(
        'INSERT INTO short_urls (original_url, code, created_at) VALUES ($1, $2, $3)',
        ['https://example.com/legacy', 'legacy', '2026-07-30T08:00:00Z'],
      )

      await executeMigration(client)

      const result = await client.query<{
        management_password_hash: string | null
        note: string | null
        enabled: boolean
        created_at: Date
        updated_at: Date
      }>('SELECT management_password_hash, note, enabled, created_at, updated_at FROM short_urls WHERE code = $1', ['legacy'])

      expect(result.rows[0]).toMatchObject({
        management_password_hash: null,
        note: null,
        enabled: true,
      })
      expect(result.rows[0]?.created_at.toISOString()).toBe('2026-07-30T08:00:00.000Z')
      expect(result.rows[0]?.updated_at.toISOString()).toBe('2026-07-30T08:00:00.000Z')
    }
    finally {
      await client.query('ROLLBACK')
    }
  })

  it('rolls back all migration statements when one statement fails', async () => {
    const schema = `migration_failure_${randomUUID().replaceAll('-', '')}`
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}", public`)
    await createLegacyTable(client)
    await client.query('ALTER TABLE short_urls ADD COLUMN note varchar(240)')
    await client.query('BEGIN')

    try {
      await expect(executeMigration(client)).rejects.toBeDefined()
      await client.query('ROLLBACK')

      const result = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'short_urls'
         ORDER BY ordinal_position`,
        [schema],
      )

      expect(result.rows.map(row => row.column_name)).toEqual([
        'id',
        'original_url',
        'code',
        'created_at',
        'note',
      ])
    }
    finally {
      await client.query('ROLLBACK').catch(() => undefined)
      await client.query('SET search_path TO public')
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    }
  })
})
