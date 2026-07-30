import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('cf:dev secret isolation', () => {
  it('uses the dedicated .dev.vars wrapper and never references DATABASE_URL', async () => {
    const script = await readFile('scripts/cf-dev.mjs', 'utf8')

    expect(script).toContain('CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE')
    expect(script).toContain("readFile('.dev.vars'")
    expect(script).not.toContain('DATABASE_URL')
  })
})
