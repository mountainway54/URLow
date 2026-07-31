import type { RedirectCache } from './short-url-cache'
import { isValidShortCode } from './short-url-cache'
import { verifyManagementPassword } from './management-password'
import {
  ShortUrlMutationCoordinator,
  type ShortUrlCreationStore,
} from './short-url-mutations'

export interface ManagementRecord {
  code: string
  originalUrl: string
  managementPasswordHash: string | null
  note: string | null
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ManagementMutationInput {
  originalUrl?: string
  note?: string | null
  enabled?: boolean
}

export interface ShortUrlManagementStore {
  findManagementByCode(code: string): Promise<ManagementRecord | null>
  updateManagement(code: string, input: ManagementMutationInput): Promise<ManagementRecord | null>
}

export interface ManagementRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export class ManagementUnauthorizedError extends Error {
  constructor() {
    super('Management password is missing or invalid')
    this.name = 'ManagementUnauthorizedError'
  }
}

export class ManagementForbiddenError extends Error {
  constructor() {
    super('This short URL has no management password')
    this.name = 'ManagementForbiddenError'
  }
}

export class ManagementNotFoundError extends Error {
  constructor() {
    super('Short URL not found')
    this.name = 'ManagementNotFoundError'
  }
}

export class ManagementRateLimitedError extends Error {
  constructor() {
    super('Too many management verification attempts')
    this.name = 'ManagementRateLimitedError'
  }
}

export class ManagementInfrastructureError extends Error {
  constructor() {
    super('Short URL management is unavailable')
    this.name = 'ManagementInfrastructureError'
  }
}

export function managementRateLimitKey(clientIp: string, code: string): string {
  return `${clientIp}:${code}`
}

export async function authorizeManagement(
  code: string,
  presentedPassword: string | undefined,
  clientIp: string | undefined,
  rateLimiter: ManagementRateLimiter,
  store: ShortUrlManagementStore,
): Promise<ManagementRecord> {
  if (!isValidShortCode(code)) {
    throw new ManagementNotFoundError()
  }
  if (!clientIp) {
    throw new ManagementInfrastructureError()
  }

  let outcome: { success: boolean }
  try {
    outcome = await rateLimiter.limit({ key: managementRateLimitKey(clientIp, code) })
  }
  catch {
    throw new ManagementInfrastructureError()
  }
  if (!outcome.success) {
    throw new ManagementRateLimitedError()
  }

  if (!presentedPassword?.trim()) {
    throw new ManagementUnauthorizedError()
  }

  const record = await store.findManagementByCode(code)
  if (record === null) {
    throw new ManagementNotFoundError()
  }
  if (record.managementPasswordHash === null) {
    throw new ManagementForbiddenError()
  }
  if (!await verifyManagementPassword(presentedPassword, record.managementPasswordHash)) {
    throw new ManagementUnauthorizedError()
  }

  return record
}

export class ShortUrlManagementService {
  private readonly coordinator: ShortUrlMutationCoordinator

  constructor(
    cache: RedirectCache,
    private readonly store: ShortUrlManagementStore & ShortUrlCreationStore,
    private readonly rateLimiter: ManagementRateLimiter,
  ) {
    this.coordinator = new ShortUrlMutationCoordinator(cache, store)
  }

  authorize(
    code: string,
    password: string | undefined,
    clientIp: string | undefined,
  ): Promise<ManagementRecord> {
    return authorizeManagement(code, password, clientIp, this.rateLimiter, this.store)
  }

  async update(
    code: string,
    password: string | undefined,
    clientIp: string | undefined,
    input: ManagementMutationInput,
  ) {
    await this.authorize(code, password, clientIp)
    let result: Awaited<ReturnType<ShortUrlMutationCoordinator['update']>>
    try {
      result = await this.coordinator.update(code, input)
    }
    catch {
      throw new ManagementInfrastructureError()
    }
    if (result.row === null) {
      throw new ManagementNotFoundError()
    }
    return { ...result, row: result.row }
  }
}
