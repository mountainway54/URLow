import { compare, getRounds, hash } from 'bcryptjs'

export const MANAGEMENT_PASSWORD_COST = 10
export const MANAGEMENT_PASSWORD_MIN_LENGTH = 6
export const MANAGEMENT_PASSWORD_MAX_LENGTH = 72
export const MANAGEMENT_PASSWORD_MAX_BYTES = 72

export function normalizeManagementPassword(value: string): string {
  return value.trim()
}

export function validateManagementPassword(value: string): string {
  const normalized = normalizeManagementPassword(value)
  const characterCount = [...normalized].length
  const byteCount = new TextEncoder().encode(normalized).byteLength

  if (
    characterCount < MANAGEMENT_PASSWORD_MIN_LENGTH
    || characterCount > MANAGEMENT_PASSWORD_MAX_LENGTH
    || byteCount > MANAGEMENT_PASSWORD_MAX_BYTES
  ) {
    throw new Error('Management password must be 6-72 characters and at most 72 UTF-8 bytes')
  }

  return normalized
}

export async function hashManagementPassword(value: string): Promise<string> {
  return hash(validateManagementPassword(value), MANAGEMENT_PASSWORD_COST)
}

export async function verifyManagementPassword(value: string, passwordHash: string): Promise<boolean> {
  const normalized = normalizeManagementPassword(value)
  if (!normalized || new TextEncoder().encode(normalized).byteLength > MANAGEMENT_PASSWORD_MAX_BYTES) {
    return false
  }

  return compare(normalized, passwordHash)
}

export function managementPasswordCost(passwordHash: string): number {
  return getRounds(passwordHash)
}
