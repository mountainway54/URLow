import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const variableName = 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE'

function parseDevVars(source) {
  const entries = new Map()

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf('=')
    if (separator <= 0) {
      throw new Error('.dev.vars contains an invalid line')
    }

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/u, '$2')
    entries.set(key, value)
  }

  const unexpected = [...entries.keys()].filter(key => key !== variableName)
  if (unexpected.length > 0) {
    throw new Error(`.dev.vars may only define ${variableName}`)
  }

  const connectionString = entries.get(variableName)
  if (!connectionString) {
    throw new Error(`${variableName} is required in .dev.vars`)
  }

  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode') !== 'require') {
    throw new Error(`${variableName} must be a PostgreSQL URL with sslmode=require`)
  }

  return connectionString
}

const connectionString = parseDevVars(await readFile('.dev.vars', 'utf8'))
const wranglerEntry = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)
const child = spawn(
  process.execPath,
  [
    fileURLToPath(wranglerEntry),
    'dev',
    '--var',
    'URLOW_LOCAL_DEV:true',
    ...process.argv.slice(2),
  ],
  {
  stdio: 'inherit',
  env: {
    ...process.env,
    [variableName]: connectionString,
  },
  },
)

child.on('error', (error) => {
  console.error('Unable to start Wrangler', { errorType: error.name })
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
