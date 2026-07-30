import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseMigrationDatabaseUrl } from '../../server/utils/migration-env'

const databaseUrl = process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('short_urls migration', () => {
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

  it('applies defaults when optional management metadata is omitted', async () => {
    await client.query('BEGIN')

    try {
      const result = await client.query<{
        management_password_hash: string | null
        note: string | null
        enabled: boolean
        updated_at: Date
      }>(
        `INSERT INTO short_urls (original_url, code)
         VALUES ($1, $2)
         RETURNING management_password_hash, note, enabled, updated_at`,
        ['https://example.com/defaults', 'metadata-defaults'],
      )

      expect(result.rows[0]).toMatchObject({
        management_password_hash: null,
        note: null,
        enabled: true,
      })
      expect(result.rows[0]?.updated_at).toBeInstanceOf(Date)
    }
    finally {
      await client.query('ROLLBACK')
    }
  })

  it.each([
    {
      name: 'management password hashes longer than 255 characters',
      column: 'management_password_hash',
      value: 'h'.repeat(256),
      errorCode: '22001',
    },
    {
      name: 'notes longer than 240 characters',
      column: 'note',
      value: 'n'.repeat(241),
      errorCode: '22001',
    },
    {
      name: 'a null enabled state',
      column: 'enabled',
      value: null,
      errorCode: '23502',
    },
    {
      name: 'a null updated timestamp',
      column: 'updated_at',
      value: null,
      errorCode: '23502',
    },
  ])('rejects $name', async ({ column, value, errorCode }) => {
    await client.query('BEGIN')

    try {
      await expect(client.query(
        `INSERT INTO short_urls (original_url, code, "${column}") VALUES ($1, $2, $3)`,
        ['https://example.com/invalid-metadata', `invalid-${column.slice(0, 20)}`, value],
      )).rejects.toMatchObject({ code: errorCode })
    }
    finally {
      await client.query('ROLLBACK')
    }
  })

  it('rejects duplicate nuxt-guide codes', async () => {
    await client.query('BEGIN')

    try {
      await client.query('DELETE FROM short_urls WHERE code = $1', ['nuxt-guide'])
      await client.query(
        'INSERT INTO short_urls (original_url, code) VALUES ($1, $2)',
        ['https://nuxt.com/docs/guide', 'nuxt-guide'],
      )

      await expect(client.query(
        'INSERT INTO short_urls (original_url, code) VALUES ($1, $2)',
        ['https://nuxt.com/docs/getting-started', 'nuxt-guide'],
      )).rejects.toMatchObject({ code: '23505' })
    }
    finally {
      await client.query('ROLLBACK')
    }
  })
})
