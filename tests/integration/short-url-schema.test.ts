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
