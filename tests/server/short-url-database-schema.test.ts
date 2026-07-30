import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  shortUrls,
  type NewShortUrl,
  type ShortUrl,
} from '../../server/database/schema'

describe('short_urls Drizzle schema', () => {
  const columns = Object.fromEntries(
    getTableConfig(shortUrls).columns.map(column => [column.name, column]),
  )

  it('maps optional management metadata with database length limits', () => {
    expect(columns.management_password_hash).toMatchObject({
      name: 'management_password_hash',
      notNull: false,
      hasDefault: false,
    })
    expect(columns.management_password_hash?.getSQLType()).toBe('varchar(255)')

    expect(columns.note).toMatchObject({
      name: 'note',
      notNull: false,
      hasDefault: false,
    })
    expect(columns.note?.getSQLType()).toBe('varchar(240)')
  })

  it('maps enabled and timestamp state with non-null defaults', () => {
    expect(columns.enabled).toMatchObject({
      name: 'enabled',
      notNull: true,
      hasDefault: true,
      default: true,
    })
    expect(columns.enabled?.getSQLType()).toBe('boolean')

    expect(columns.created_at).toMatchObject({
      name: 'created_at',
      notNull: true,
      hasDefault: true,
    })
    expect(columns.created_at?.getSQLType()).toBe('timestamp with time zone')

    expect(columns.updated_at).toMatchObject({
      name: 'updated_at',
      notNull: true,
      hasDefault: true,
    })
    expect(columns.updated_at?.getSQLType()).toBe('timestamp with time zone')
  })

  it('infers optional insert fields and required select fields', () => {
    expectTypeOf<NewShortUrl>().toMatchTypeOf<{
      managementPasswordHash?: string | null
      note?: string | null
      enabled?: boolean
      updatedAt?: Date
    }>()

    expectTypeOf<ShortUrl>().toMatchTypeOf<{
      managementPasswordHash: string | null
      note: string | null
      enabled: boolean
      createdAt: Date
      updatedAt: Date
    }>()
  })
})
