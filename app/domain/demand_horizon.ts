import type { Article } from '#app/domain/models/article'

/** Unité X3 du champ ITMFACILIT.FOHUOT_0 (menu 291). */
export type DemandHorizonUnit = 0 | 1 | 2 | 3 | 4 | 5

export interface DemandHorizon {
  value: number
  unit: number
}

/** Retourne la date de fin incluse de l'horizon demande X3. */
export function demandHorizonEnd(
  horizon: DemandHorizon | undefined,
  today = new Date()
): Date | null {
  if (!horizon || !Number.isFinite(horizon.value) || horizon.value <= 0) return null

  const end = new Date(today)
  end.setHours(23, 59, 59, 999)
  switch (horizon.unit) {
    case 2: {
      let remaining = Math.trunc(horizon.value)
      while (remaining > 0) {
        end.setDate(end.getDate() + 1)
        const day = end.getDay()
        if (day !== 0 && day !== 6) remaining--
      }
      return end
    }
    case 3:
      end.setDate(end.getDate() + horizon.value * 7)
      return end
    case 4:
      end.setDate(end.getDate() + horizon.value * 14)
      return end
    case 5:
      end.setMonth(end.getMonth() + horizon.value)
      return end
    case 0:
    case 1:
    default:
      end.setDate(end.getDate() + horizon.value)
      return end
  }
}

/** X3 ignore une prévision dont la date tombe dans l'horizon demande. */
export function isForecastInsideDemandHorizon(
  article: Pick<Article, 'demandHorizon'>,
  date: Date,
  today = new Date()
): boolean {
  const end = demandHorizonEnd(article.demandHorizon, today)
  return end !== null && date.getTime() <= end.getTime()
}
