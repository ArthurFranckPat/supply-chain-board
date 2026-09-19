import type { Article } from '#app/domain/models/article'

export interface DemandHorizon {
  value: number
  unit: number
}

/** Retourne la date de fin incluse de l'horizon demande X3 (menu 291). */
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
        if (end.getDay() !== 0 && end.getDay() !== 6) remaining--
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
    default:
      end.setDate(end.getDate() + horizon.value)
      return end
  }
}

export function isForecastInsideDemandHorizon(
  article: Pick<Article, 'demandHorizon'>,
  date: Date,
  today = new Date()
): boolean {
  const end = demandHorizonEnd(article.demandHorizon, today)
  return end !== null && date.getTime() <= end.getTime()
}
