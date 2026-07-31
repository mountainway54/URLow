import { describe, expect, it } from 'vitest'
import {
  hashManagementPassword,
  managementPasswordCost,
  normalizeManagementPassword,
  validateManagementPassword,
  verifyManagementPassword,
} from '../../server/services/management-password'

describe('management password', () => {
  it('normalizes surrounding whitespace', () => {
    expect(normalizeManagementPassword('  secret12  ')).toBe('secret12')
  })

  it.each([
    '12345',
    'a'.repeat(73),
    '密'.repeat(25),
  ])('rejects an invalid bcrypt input boundary', (value) => {
    expect(() => validateManagementPassword(value)).toThrow()
  })

  it.each([
    '123456',
    'a'.repeat(72),
    '密'.repeat(24),
  ])('accepts a valid bcrypt input boundary', (value) => {
    expect(validateManagementPassword(value)).toBe(value)
  })

  it('uses independent cost-10 salts and verifies normalized passwords', async () => {
    const first = await hashManagementPassword(' secret12 ')
    const second = await hashManagementPassword('secret12')

    expect(first).not.toBe(second)
    expect(managementPasswordCost(first)).toBe(10)
    await expect(verifyManagementPassword('  secret12 ', first)).resolves.toBe(true)
    await expect(verifyManagementPassword('incorrect', first)).resolves.toBe(false)
  })
})
