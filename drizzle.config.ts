import { defineConfig } from 'drizzle-kit'
import { parseMigrationDatabaseUrl } from './server/utils/migration-env'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: parseMigrationDatabaseUrl(process.env.DATABASE_URL),
  },
})
