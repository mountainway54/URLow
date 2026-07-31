import {
  getRequestHeader,
  getRequestURL,
  getRouterParam,
  setResponseStatus,
} from 'h3'
import { updateShortUrlBodySchema } from '../../schemas/short-url'
import {
  resolveManagementClientIdentity,
  ShortUrlManagementService,
} from '../../services/short-url-management'
import { ShortUrlRepository } from '../../services/short-url-repository'
import { parseManagementRateLimiter, parseWorkerEnv } from '../../utils/env'
import {
  managementData,
  shortUrlManagementErrorResponse,
} from '../../utils/short-url-management-response'
import { withValidatedBody } from '../../utils/middleware/validate-request-body'

export default withValidatedBody(updateShortUrlBodySchema, async (event, body) => {
  try {
    const cloudflare = event.context.cloudflare as { env?: unknown } | undefined
    const env = parseWorkerEnv(cloudflare?.env)
    const rawEnv = cloudflare?.env as {
      MANAGEMENT_RATE_LIMITER?: unknown
      URLOW_LOCAL_DEV?: unknown
    } | undefined
    const code = getRouterParam(event, 'code') ?? ''
    const service = new ShortUrlManagementService(
      env.SHORT_URL_CACHE,
      new ShortUrlRepository(event),
      parseManagementRateLimiter(rawEnv?.MANAGEMENT_RATE_LIMITER),
    )
    const result = await service.update(
      code,
      getRequestHeader(event, 'x-management-password'),
      resolveManagementClientIdentity(
        getRequestHeader(event, 'cf-connecting-ip'),
        rawEnv?.URLOW_LOCAL_DEV,
      ),
      body,
    )

    return {
      data: {
        ...managementData(result.row, getRequestURL(event).origin),
        cacheSynchronized: result.cacheSynchronized,
        staleWindowWarning: result.staleWindowWarning,
      },
    }
  }
  catch (error) {
    console.error('Short URL management update failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    const response = shortUrlManagementErrorResponse(error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
