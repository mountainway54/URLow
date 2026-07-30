import { getRequestURL, setResponseStatus } from 'h3'
import { createShortUrlBodySchema } from '../schemas/short-url'
import { createShortUrl } from '../services/short-url-creation'
import { ShortUrlCreationCoordinator } from '../services/short-url-mutations'
import { ShortUrlRepository } from '../services/short-url-repository'
import { parseWorkerEnv } from '../utils/env'
import { withValidatedBody } from '../utils/middleware/validate-request-body'
import { shortUrlCreationErrorResponse } from '../utils/short-url-creation-response'

export default withValidatedBody(createShortUrlBodySchema, async (event, body) => {
  try {
    const cloudflare = event.context.cloudflare as { env?: unknown } | undefined
    const env = parseWorkerEnv(cloudflare?.env)
    const repository = new ShortUrlRepository(event)
    const coordinator = new ShortUrlCreationCoordinator(env.SHORT_URL_CACHE, repository)
    const result = await createShortUrl(body.originalUrl, coordinator)
    const origin = getRequestURL(event).origin

    setResponseStatus(event, 201)
    return {
      data: {
        code: result.code,
        originalUrl: result.originalUrl,
        shortUrl: `${origin}/${result.code}`,
      },
    }
  }
  catch (error) {
    console.error('Short URL creation request failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })

    const response = shortUrlCreationErrorResponse(error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
