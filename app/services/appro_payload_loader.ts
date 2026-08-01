import { cacheNs } from '#services/cache_ns'
import { ApproRepository } from '#app/repositories/appro_repository'
import { buildApproPayload, type ApproPayload } from '#app/domain/appro'
import { isoLocalDay } from '#app/domain/shortages'

/**
 * Chargement du payload `/approvisionnements` (issue #103).
 *
 * Même motif que `reception_payload_loader` : le calcul vit dans un service, pas
 * dans le controller, pour qu'un futur tool agent puisse servir exactement la
 * même donnée que l'écran sans que les deux puissent diverger.
 */

/**
 * Horizon par défaut, en jours.
 *
 * 90 jours parce que c'est la borne au-delà de laquelle la population devient du
 * bruit : sur AE1, 698 des 5 568 suggestions échoient dans le trimestre, les
 * 4 870 autres après. Ce n'est PAS l'horizon de travail — mesuré, il est plus
 * proche de 30 jours (40 lignes, 13 fournisseurs) — mais la borne de ce qu'on
 * accepte de charger. Le filtrage fin est un choix d'affichage, et l'horizon
 * juste (dérivé du délai fournisseur) reste à trancher (#114).
 */
export const DEFAULT_HORIZON_DAYS = 90

/**
 * TTL du cache. Le CBN ne tourne qu'une fois par jour : entre deux runs, la
 * donnée est strictement identique. 30 min est donc large sans être risqué —
 * le grace period est configuré globalement (`config/cache.ts`), pas ici.
 */
const TTL_MS = 30 * 60 * 1000

export interface ApproPayloadResult extends ApproPayload {
  range: { to: string; horizonDays: number }
  /** Message X3 si l'extraction a échoué — l'écran l'affiche au lieu d'une page vide. */
  x3Error: string | null
}

const addDays = (iso: string, days: number): string => {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) return iso
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Payload complet, mis en cache.
 *
 * La clé de cache inclut l'horizon ET le jour : sans le jour, la file resterait
 * figée sur la photo de la veille alors que le CBN a tourné entre-temps, et le
 * SWR ne la réveillerait jamais — c'est un piège déjà rencontré quatre fois dans
 * ce dépôt.
 */
export async function loadApproPayload(horizonDays: number): Promise<ApproPayloadResult> {
  const today = isoLocalDay()
  const to = addDays(today, horizonDays)
  const range = { to, horizonDays }

  try {
    const payload = await cacheNs('appro').getOrSet({
      key: `appro:file:${today}:${horizonDays}`,
      ttl: TTL_MS,
      // 0 = vrai stale-while-revalidate. NE PAS mettre > 0 : le refresh sortirait
      // du background et une rejection non gérée ferait tomber le serveur (même
      // piège que board_dataset, suivi, ruptures).
      timeout: 0,
      factory: async () => {
        const source = await new ApproRepository().fetch(to)
        return buildApproPayload(source, today)
      },
    })
    return { ...payload, range, x3Error: null }
  } catch (error) {
    // Une erreur X3 ne doit pas rendre une page blanche : la coquille reste, et
    // la cause s'affiche. Même parti pris que `loadReceptionPayloadSafe`.
    return {
      dossiers: [],
      stats: {
        nbDossiers: 0,
        nbItems: 0,
        nbArticles: 0,
        nbSuggestions: 0,
        nbMessages: 0,
        parMessage: { 2: 0, 3: 0, 6: 0 },
      },
      range,
      x3Error: error instanceof Error ? error.message : String(error),
    }
  }
}
