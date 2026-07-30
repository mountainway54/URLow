import { generateShortCode } from './short-code'
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
  cacheSynchronized: boolean
}

type CreationCoordinator = Pick<ShortUrlCreationCoordinator, 'create'>
type ShortCodeGenerator = () => string

export async function createShortUrl(
  originalUrl: string,
  coordinator: CreationCoordinator,
  generate: ShortCodeGenerator = generateShortCode,
): Promise<ShortUrlCreationResult> {
  for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt += 1) {
    const code = generate()

    try {
      const mutation = await coordinator.create(code, originalUrl)
      return {
        code,
        originalUrl,
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
