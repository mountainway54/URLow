import {
  defineEventHandler,
  getMethod,
  getRequestURL,
  sendRedirect,
  setResponseStatus,
} from 'h3'
import { resolveRedirect } from '../services/short-url-cache'
import { ShortUrlRepository } from '../services/short-url-repository'
import { parseWorkerEnv } from '../utils/env'

export default defineEventHandler(async (event) => {
  if (!['GET', 'HEAD'].includes(getMethod(event))) {
    return
  }

  const pathMatch = /^\/([^/]+)\/?$/u.exec(getRequestURL(event).pathname)
  if (!pathMatch) {
    return
  }

  let code: string
  try {
    code = decodeURIComponent(pathMatch[1] ?? '')
  }
  catch {
    setResponseStatus(event, 404)
    return
  }

  if (!/^[A-Za-z0-9_-]{4,32}$/u.test(code)) {
    setResponseStatus(event, 404)
    return
  }

  const cloudflare = event.context.cloudflare as {
    env?: unknown
    context?: { waitUntil(promise: Promise<unknown>): void }
  } | undefined

  try {
    const env = parseWorkerEnv(cloudflare?.env)
    const executionContext = cloudflare?.context
    if (!executionContext) {
      throw new Error('Cloudflare execution context is unavailable')
    }

    const result = await resolveRedirect(
      code,
      env.SHORT_URL_CACHE,
      new ShortUrlRepository(event),
      executionContext,
    )

    if (result.status === 302) {
      return sendRedirect(event, result.targetUrl, 302)
    }

    setResponseStatus(event, result.status)
  }
  catch (error) {
    console.error('Redirect request failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    setResponseStatus(event, 503)
  }
})
