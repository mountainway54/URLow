export const BASE62_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

const SHORT_CODE_LENGTH = 8
const REJECTION_LIMIT = Math.floor(256 / BASE62_ALPHABET.length) * BASE62_ALPHABET.length

export type RandomFill = (bytes: Uint8Array) => Uint8Array

function defaultRandomFill(bytes: Uint8Array): Uint8Array {
  return crypto.getRandomValues(bytes)
}

export function generateShortCode(fillRandom: RandomFill = defaultRandomFill): string {
  let code = ''

  while (code.length < SHORT_CODE_LENGTH) {
    const bytes = fillRandom(new Uint8Array(SHORT_CODE_LENGTH - code.length))

    for (const byte of bytes) {
      if (byte >= REJECTION_LIMIT) continue

      code += BASE62_ALPHABET[byte % BASE62_ALPHABET.length]
      if (code.length === SHORT_CODE_LENGTH) break
    }
  }

  return code
}
