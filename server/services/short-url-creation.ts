import { generateShortCode } from './short-code'
import { hashManagementPassword } from './management-password'
import type { ShortUrlCreationCoordinator } from './short-url-mutations'
import { ShortCodeCollisionError } from './short-url-repository'

const MAX_SHORT_CODE_ATTEMPTS = 5

export class ShortCodeGenerationExhaustedError extends Error {
  constructor() {
    super('Unable to allocate a unique short code')
    this.name = 'ShortCodeGenerationExhaustedError'
  }
}

export interface ShortUrlCreationResult {
  code: string
  originalUrl: string
  note: string | null
  enabled: true
  hasManagementPassword: boolean
  cacheSynchronized: boolean
}

type CreationCoordinator = Pick<ShortUrlCreationCoordinator, 'create'>
type ShortCodeGenerator = () => string
type PasswordHasher = (password: string) => Promise<string>

export interface ShortUrlCreationInput {
  originalUrl: string
  managementPassword?: string
  note?: string | null
}

export async function createShortUrl(
  input: ShortUrlCreationInput | string,
  coordinator: CreationCoordinator,
  generate: ShortCodeGenerator = generateShortCode,
  hashPassword: PasswordHasher = hashManagementPassword,
): Promise<ShortUrlCreationResult> {
  const creationInput = typeof input === 'string' ? { originalUrl: input } : input
  const managementPasswordHash = creationInput.managementPassword
    ? await hashPassword(creationInput.managementPassword)
    : null
  const note = creationInput.note ?? null

  for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt += 1) {
    const code = generate()

    try {
      const mutation = await coordinator.create(code, creationInput.originalUrl, {
        managementPasswordHash,
        note,
      })
      return {
        code,
        originalUrl: creationInput.originalUrl,
        note,
        enabled: true,
        hasManagementPassword: managementPasswordHash !== null,
        cacheSynchronized: mutation.cacheSynchronized,
      }
    }
    catch (error) {
      if (error instanceof ShortCodeCollisionError) continue
      throw error
    }
  }

  throw new ShortCodeGenerationExhaustedError()
}
