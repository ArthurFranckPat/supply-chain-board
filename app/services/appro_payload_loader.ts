import { cacheNs } from '#services/cache_ns'
import { ApproRepository } from '#app/repositories/appro_repository'
import {
  buildApproPayload,
  filtreFenetreDerivee,
  type ApproPayload,
  type ApproItem,
} from '#app/domain/appro'
import { attacheTriage } from '#app/domain/appro_triage'
import { computeFingerprint, estOverride, type ApproDecision } from '#app/domain/appro_decision'
import { ApproDecisionRepository } from '#app/repositories/appro_decision_repository'
import { isoLocalDay } from '#app/domain/shortages'

/**
 * Chargement du payload `/approvisionnements` (issue #103).
 *
 * Même motif que `reception_payload_loader` : le calcul vit dans un service, pas
 * dans le controller, pour qu'un futur tool agent puisse servir exactement la
 * même donnée que l'écran sans que les deux puissent diverger.
 */

/**
 * Borne de chargement de la vue dérivée (#114), en jours.
 *
 * 90 jours parce que c'est la borne au-delà de laquelle la population devient du
 * bruit : sur AE1, 698 des 5 568 suggestions échoient dans le trimestre, les
 * 4 870 autres après. Le délai de réappro max mesuré est 70 j — 90 j couvre la
 * fenêtre dérivée (`échéance ≤ aujourd'hui + délai`) sans rien tronquer. C'est
 * une borne de chargement, PAS la file affichée : la vue par défaut applique
 * ensuite `filtreFenetreDerivee` par article.
 */
export const DEFAULT_HORIZON_DAYS = 90
const LOAD_BOUND_DAYS = DEFAULT_HORIZON_DAYS

/**
 * TTL du cache. Le CBN ne tourne qu'une fois par jour : entre deux runs, la
 * donnée est strictement identique. 30 min est donc large sans être risqué —
 * le grace period est configuré globalement (`config/cache.ts`), pas ici.
 */
const TTL_MS = 30 * 60 * 1000

export interface ApproPayloadResult extends ApproPayload {
  range: { to: string; horizonDays: number | null }
  /** Message X3 si l'extraction a échoué — l'écran l'affiche au lieu d'une page vide. */
  x3Error: string | null
  /** Décisions acheteur rattachées à cette file (ledger #134). */
  decisions: { nb: number; overrides: number }
}

const addDays = (iso: string, days: number): string => {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) return iso
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Clé logique d'une ligne de la file pour le ledger : fingerprint #112 pour une
 * suggestion (survit à la recréation CBN), `M:VCRNUM:VCRLIN` pour un message
 * (clé stable directe — c'est `item.cle` lui-même, #107).
 */
const cleLogiqueItem = (fournisseur: string, item: ApproItem): string =>
  item.nature === 'suggestion'
    ? computeFingerprint(fournisseur, item.article, item.echeance, item.quantite)
    : item.cle

/**
 * Rattache les décisions du ledger à chaque ligne de la file, HORS cache (#134) :
 * une décision prise il y a une seconde doit s'afficher immédiatement, sans
 * attendre l'expiration du TTL de 30 min de la file X3. Fait aussi tourner
 * l'expiration par absence (#112) : une clé disparue 3 runs passe expirée.
 *
 * Pur sur le payload (nouvel objet, items enrichis) ; l'I/O ledger est ici, à
 * la charge de l'appelant.
 */
async function attacheDecisions(payload: ApproPayload): Promise<ApproPayload> {
  const repo = new ApproDecisionRepository()
  const cles: string[] = []
  for (const dossier of payload.dossiers) {
    for (const item of dossier.items) cles.push(cleLogiqueItem(dossier.fournisseur, item))
  }

  const parCle = await repo.latestParCle(cles)
  await repo.expireAbsents(cles)

  const decisionDe = (row: {
    statut: ApproDecision['statut']
    decidedAt: string
  }): ApproDecision => ({
    statut: row.statut,
    decidedAt: row.decidedAt,
  })

  const dossiers = payload.dossiers.map((dossier) => ({
    ...dossier,
    items: dossier.items.map((item) => {
      const row = parCle.get(cleLogiqueItem(dossier.fournisseur, item))
      return { ...item, decision: row === undefined ? null : decisionDe(row) }
    }),
  }))
  return { ...payload, dossiers }
}

/**
 * Override rate (#134) : part des décisions qui contredisent le verdict du
 * moteur (`estOverride`, appro_decision.ts) — le signal d'une règle fausse ou
 * d'un master data pourri (#106, boucle de feedback).
 */
function compteOverrides(items: ApproItem[]): number {
  let overrides = 0
  for (const item of items) {
    if (estOverride(item.triage?.verdict, item.decision?.statut)) overrides += 1
  }
  return overrides
}

/**
 * Payload complet, mis en cache.
 *
 * La clé de cache inclut l'horizon ET le jour : sans le jour, la file resterait
 * figée sur la photo de la veille alors que le CBN a tourné entre-temps, et le
 * SWR ne la réveillerait jamais — c'est un piège déjà rencontré quatre fois dans
 * ce dépôt.
 */
/**
 * `null` = vue dérivée par défaut (#114) : chaque suggestion entre dans la file
 * quand `échéance ≤ aujourd'hui + délai de réappro` (`filtreFenetreDerivee`).
 * La borne de chargement est alors `LOAD_BOUND_DAYS` (le délai max mesuré sur
 * AE1 est 70 j ; 90 j couvre). Un horizon numérique = fenêtre fixe 30/60/90 j.
 */
export async function loadApproPayload(horizonDays: number | null): Promise<ApproPayloadResult> {
  const today = isoLocalDay()
  const derived = horizonDays === null
  const to = addDays(today, derived ? LOAD_BOUND_DAYS : horizonDays)
  const range = { to, horizonDays }

  try {
    const payload = await cacheNs('appro').getOrSet({
      key: `appro:file:${today}:${horizonDays ?? 'derivee'}`,
      ttl: TTL_MS,
      // 0 = vrai stale-while-revalidate. NE PAS mettre > 0 : le refresh sortirait
      // du background et une rejection non gérée ferait tomber le serveur (même
      // piège que board_dataset, suivi, ruptures).
      timeout: 0,
      factory: async () => {
        const source = await new ApproRepository().fetch(to)
        let brut = buildApproPayload(source, today)
        if (derived) brut = filtreFenetreDerivee(brut, today)
        return attacheTriage(brut)
      },
    })
    const avecDecisions = await attacheDecisions(payload)
    const items = avecDecisions.dossiers.flatMap((d) => d.items)
    return {
      ...avecDecisions,
      range,
      x3Error: null,
      decisions: {
        nb: items.filter((i) => i.decision !== null).length,
        overrides: compteOverrides(items),
      },
    }
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
      decisions: { nb: 0, overrides: 0 },
    }
  }
}
