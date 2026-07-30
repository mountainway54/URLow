import { defineEventHandler, setResponseStatus } from 'h3'
import { getDatabaseHealth } from '../../services/database-health'

export default defineEventHandler(async (event) => {
  const result = await getDatabaseHealth(event)
  setResponseStatus(event, result.statusCode)
  return result.body
})
