import { defineEventHandler, setResponseHeader } from 'h3'
import { createOpenApiDocument } from '../utils/openapi-document'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  return createOpenApiDocument()
})
