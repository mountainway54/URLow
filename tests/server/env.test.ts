import { describe, expect, it } from 'vitest'
import { parseHyperdriveBinding } from '../../server/utils/env'
import { parseMigrationDatabaseUrl } from '../../server/utils/migration-env'

describe('migration configuration', () => {
  it('accepts a TLS PostgreSQL URL', () => {
    const value = 'postgresql://user:secret@example.test/database?sslmode=require'
    expect(parseMigrationDatabaseUrl(value)).toBe(value)
  })

  it.each([
    undefined,
    '',
    'https://example.test/database?sslmode=require',
    'postgresql://user:secret@example.test/database',
  ])('rejects missing or unsafe DATABASE_URL before SQL: %s', (value) => {
    expect(() => parseMigrationDatabaseUrl(value)).toThrow()
  })
})

describe('runtime configuration', () => {
  it('accepts the Hyperdrive binding connection string', () => {
    const binding = { connectionString: 'postgresql://hyperdrive.internal/database' }
    expect(parseHyperdriveBinding(binding)).toEqual(binding)
  })

  it.each([undefined, {}, { connectionString: '' }, { connectionString: 'https://example.test' }])(
    'rejects a missing or malformed Hyperdrive binding',
    (value) => expect(() => parseHyperdriveBinding(value)).toThrow(),
  )
})
