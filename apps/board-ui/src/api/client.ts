import { ApiError } from '@/api/core'
export { ApiError }

import { schedulerApi } from '@/api/repositories/scheduler'
import { calendarApi } from '@/api/repositories/calendar'
import { capacityApi } from '@/api/repositories/capacity'
import { analyseApi } from '@/api/repositories/analyse'
import { feasibilityApi } from '@/api/repositories/feasibility'
import { stockApi } from '@/api/repositories/stock'

/**
 * Monolithic API client (preserved for backward compatibility).
 * Prefer importing domain-specific repositories directly:
 *   import { schedulerApi } from '@/api/repositories/scheduler'
 */
export const apiClient = {
  ...schedulerApi,
  ...calendarApi,
  ...capacityApi,
  ...analyseApi,
  ...feasibilityApi,
  ...stockApi,
}
