import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const shortUrls = pgTable('short_urls', {
  id: uuid('id').defaultRandom().primaryKey(),
  originalUrl: text('original_url').notNull(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ShortUrl = typeof shortUrls.$inferSelect
export type NewShortUrl = typeof shortUrls.$inferInsert
