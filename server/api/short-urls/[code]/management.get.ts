import {
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  getRouterParam,
  setResponseStatus,
} from 'h3'
import {
  resolveManagementClientIdentity,
  ShortUrlManagementService,
} from '../../../services/short-url-management'
import { ShortUrlRepository } from '../../../services/short-url-repository'
import { parseManagementRateLimiter, parseWorkerEnv } from '../../../utils/env'
import {
  managementData,
  shortUrlManagementErrorResponse,
} from '../../../utils/short-url-management-response'

export default defineEventHandler(async (event) => {
  try {
    const cloudflare = event.context.cloudflare as { env?: unknown } | undefined
    const env = parseWorkerEnv(cloudflare?.env)
    const rawEnv = cloudflare?.env as {
      MANAGEMENT_RATE_LIMITER?: unknown
      URLOW_LOCAL_DEV?: unknown
    } | undefined
    const code = getRouterParam(event, 'code') ?? ''
    const password = getRequestHeader(event, 'x-management-password')
    const clientIdentity = resolveManagementClientIdentity(
      getRequestHeader(event, 'cf-connecting-ip'),
      rawEnv?.URLOW_LOCAL_DEV,
    )
    const service = new ShortUrlManagementService(
      env.SHORT_URL_CACHE,
      new ShortUrlRepository(event),
      parseManagementRateLimiter(rawEnv?.MANAGEMENT_RATE_LIMITER),
    )
    const record = await service.authorize(code, password, clientIdentity)

    return { data: managementData(record, getRequestURL(event).origin) }
  }
  catch (error) {
    console.error('Short URL management lookup failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    const response = shortUrlManagementErrorResponse(error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
