import { describe, expect, it, vi } from 'vitest'
import { BASE62_ALPHABET, generateShortCode } from '../../server/services/short-code'

describe('secure Base62 short-code generation', () => {
  it('returns exactly eight Base62 characters', () => {
    const fill = vi.fn((bytes: Uint8Array) => {
      bytes.set([0, 25, 26, 51, 52, 61, 1, 60])
      return bytes
    })

    expect(generateShortCode(fill)).toBe('AZaz09B8')
    expect(fill).toHaveBeenCalledOnce()
  })

  it('rejects bytes outside the largest unbiased Base62 range', () => {
    let call = 0
    const fill = vi.fn((bytes: Uint8Array) => {
      call += 1
      bytes.fill(call === 1 ? 248 : 0)
      return bytes
    })

    expect(generateShortCode(fill)).toBe('AAAAAAAA')
    expect(fill).toHaveBeenCalledTimes(2)
  })

  it('exports the agreed alphabet without ambiguous extra characters', () => {
    expect(BASE62_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
    expect(BASE62_ALPHABET).toHaveLength(62)
  })
})
