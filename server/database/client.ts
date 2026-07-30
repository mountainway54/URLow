import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import type { H3Event } from 'h3'
import { parseHyperdriveBinding } from '../utils/env'
import * as schema from './schema'

export type Database = NodePgDatabase<typeof schema>

type PgClient = Pick<pg.Client, 'connect' | 'end'> & pg.Client
type ClientFactory = (connectionString: string) => PgClient

function getHyperdrive(event: H3Event): Hyperdrive {
  const cloudflare = event.context.cloudflare as { env?: { HYPERDRIVE?: unknown } } | undefined
  return parseHyperdriveBinding(cloudflare?.env?.HYPERDRIVE)
}

function defaultClientFactory(connectionString: string): PgClient {
  return new pg.Client({ connectionString })
}

export async function withDatabase<T>(
  event: H3Event,
  operation: (database: Database) => Promise<T>,
  createClient: ClientFactory = defaultClientFactory,
): Promise<T> {
  const hyperdrive = getHyperdrive(event)
  const client = createClient(hyperdrive.connectionString)

  try {
    await client.connect()
    return await operation(drizzle(client, { schema }))
  }
  finally {
    await client.end()
  }
}
