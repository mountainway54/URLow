import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('cf:dev secret isolation', () => {
  it('uses the dedicated .dev.vars wrapper and never references DATABASE_URL', async () => {
    const script = await readFile('scripts/cf-dev.mjs', 'utf8')

    expect(script).toContain('CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE')
    expect(script).toContain("readFile('.dev.vars'")
    expect(script).toContain("'--var'")
    expect(script).toContain("'URLOW_LOCAL_DEV:true'")
    expect(script).toContain('...process.argv.slice(2)')
    expect(script).not.toContain('DATABASE_URL')
  })
})
