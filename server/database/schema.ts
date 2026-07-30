import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const shortUrls = pgTable('short_urls', {
  id: uuid('id').defaultRandom().primaryKey(),
  originalUrl: text('original_url').notNull(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  managementPasswordHash: varchar('management_password_hash', { length: 255 }),
  note: varchar('note', { length: 240 }),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ShortUrl = typeof shortUrls.$inferSelect
export type NewShortUrl = typeof shortUrls.$inferInsert
