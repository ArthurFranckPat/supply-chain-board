import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Extraction X3 du module `/approvisionnements` (issue #103) : suggestions
 * d'achat du CBN et messages de replanification sur commandes fournisseur.
 *
 * ## Pourquoi une extraction DÉDIÉE, et pas `combined_orders_repository`
 *
 * `buildOrdersSql()` porte UNE condition par `WIPTYP`, partagée par construction
 * entre le chemin live et l'ingestion réplique — c'est ce qui garantit que les
 * deux rendent la même population. La condition WIPTYP=2 y vaut
 * `WIPSTA_0 IN (1, 2)` : les suggestions (`WIPSTA_0 = 3`) en sont exclues.
 *
 * L'élargir aurait servi une population plus large à TOUS les consommateurs du
 * board, et une directive de commit l'interdit explicitement : le matcher
 * `of-conso` (`createStockState`) somme les réceptions COMME DU STOCK, sans
 * regarder la date. Une ligne de plus dans WIPTYP=2 y devient du stock fantôme.
 *
 * D'où un SQL séparé, qui n'a aucun consommateur en commun avec le board. Le
 * couplage qu'on perd (deux définitions de « ligne ORDERS » à maintenir) est le
 * prix d'un board qu'on ne peut pas casser depuis ici.
 *
 * ## Pourquoi pas de table de réplique
 *
 * `REPLICA_READS` choisit une ARCHITECTURE, pas un détail : y brancher une table
 * imposerait d'écrire les deux modes. Le coût mesuré ne le justifie pas —
 * l'extraction complète des suggestions (5 568 lignes le 01/08/2026 sur AE1)
 * tient en UN appel de ~10 s, et le CBN ne tourne qu'une fois par jour. La
 * lecture directe, mise en cache, suffit. C'est le même régime que les tables
 * hors `syncAll()` quand leur âge les disqualifie : X3 direct.
 *
 * ## Deux populations, deux natures
 *
 * - **Suggestions (`WIPSTA_0 = 3`)** — le CBN les DÉTRUIT et les RECRÉE à chaque
 *   run : 5 560 des 5 568 lignes portaient `CREDAT_0` du jour même. Leur
 *   `VCRNUM_0` est donc renouvelé chaque nuit et ne peut servir de clé stable.
 * - **Messages (`MRPMES_0` sur `WIPSTA_0 = 1`)** — écrits EN PLACE sur une ligne
 *   qui persiste : `UPDDAT_0` du jour, `CREDAT_0` remontant à des mois. Ici
 *   `VCRNUM_0` + `VCRLIN_0` EST une clé stable.
 *
 * Ne pas unifier les deux sous une même notion d'identité : elles n'en ont pas
 * la même.
 */

/** Site de production. Même convention que `stock_valuation_repository`. */
const SITE = 'AE1'

/**
 * Valeurs du menu local **chapitre 318** (« Message CBN ») rencontrées sur AE1.
 *
 * Le chapitre en compte 14, mais le paramétrage du site
 * (`PARMRP.RPLUPDQTY_2 = 1`, « Aucune ») interdit les messages de quantité :
 * « augmenter », « diminuer » et les combinés 7-10 ne peuvent pas apparaître
 * ici. Mesuré le 01/08/2026 : 236 « avancer », 434 « retarder », 71 « inutile »,
 * et rien d'autre.
 *
 * `1` = « pas d'action » : c'est l'ABSENCE de message, pas un message neutre.
 */
export const MRP_MESSAGE = {
  AUCUN: 1,
  AVANCER: 2,
  RETARDER: 3,
  INUTILE: 6,
} as const

export type MrpMessageCode = 2 | 3 | 6

/** Une suggestion d'achat du CBN (`WIPTYP=2`, `WIPSTA=3`). */
export interface ApproSuggestionRow {
  /** Renouvelé à CHAQUE run du CBN — jamais une clé de décision. */
  numero: string
  article: string
  designation: string
  /** `ENDDAT_0` — échéance du besoin. */
  date: Date | null
  quantite: number
  fournisseur: string
  /** `ORI_0` : `6` sur l'essentiel du parc, `3` sur les consommables. */
  origine: string
}

/** Un message de replanification sur commande fournisseur ferme. */
export interface ApproMessageRow {
  /** `VCRNUM_0` + `VCRLIN_0` : stable d'un run à l'autre, contrairement aux suggestions. */
  numero: string
  ligne: number
  article: string
  designation: string
  /** `ENDDAT_0` — échéance actuelle de la commande. */
  date: Date | null
  /** `MRPDAT_0` — date que le CBN propose. Absente sur « inutile », qui n'en a pas besoin. */
  dateProposee: Date | null
  message: MrpMessageCode
  quantite: number
  fournisseur: string
}

type RawRow = Record<string, string | null>

const num = (v: string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const str = (v: string | null | undefined): string => (v ?? '').trim()

/**
 * X3 encode « pas de date » par `31-DEC-99`, que `parseX3Date` rend — correctement,
 * vu son format `dd-MMM-yy` — comme le 31/12/**1999**. Sans ce filtre, la sentinelle
 * devient une date réelle et lointainement passée : un message « avancer » afficherait
 * une proposition à -27 ans, et tout tri par date la remonterait en tête.
 *
 * Mesuré : la sentinelle porte 5 567 des 5 568 suggestions, et les messages
 * « inutile » (annuler), qui n'ont effectivement pas de date à proposer.
 *
 * Seuil à l'an 2000 plutôt qu'égalité stricte au 31/12/1999 : toute date antérieure
 * au millénaire est une sentinelle ou une saisie aberrante, jamais une échéance
 * d'approvisionnement.
 */
const SENTINEL_BEFORE = Date.UTC(2000, 0, 1)

const parseDate = (raw: string | null | undefined): Date | null => {
  const d = parseX3Date(raw)
  if (d === null) return null
  return d.getTime() < SENTINEL_BEFORE ? null : d
}

/**
 * `ITMSTA_0 = 1` (article actif) et `RMNEXTQTY_0 > 0` : mêmes garde-fous que
 * `buildOrdersSql`. Un article désactivé ou une ligne soldée n'appelle aucune
 * décision d'achat, et les laisser passer gonflerait la file de bruit pur.
 */
const suggestionsSql = (to: string): string => `
SELECT O.VCRNUM_0, O.ITMREF_0, I.ITMDES1_0, O.ENDDAT_0, O.RMNEXTQTY_0,
       O.BPRNUM_0, O.ORI_0
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
WHERE O.WIPTYP_0 = 2
  AND O.WIPSTA_0 = 3
  AND O.STOFCY_0 = '${SITE}'
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD')
`

/**
 * `MRPMES_0 <> 1` écarte l'absence de message. Pas de borne basse sur
 * `ENDDAT_0` : une commande dont l'échéance est DÉJÀ passée et que le CBN
 * demande d'avancer est le cas le plus urgent qui soit — la borner la ferait
 * disparaître.
 */
const messagesSql = (to: string): string => `
SELECT O.VCRNUM_0, O.VCRLIN_0, O.ITMREF_0, I.ITMDES1_0, O.ENDDAT_0, O.MRPDAT_0,
       O.MRPMES_0, O.RMNEXTQTY_0, O.BPRNUM_0
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
WHERE O.WIPTYP_0 = 2
  AND O.WIPSTA_0 = 1
  AND O.STOFCY_0 = '${SITE}'
  AND I.ITMSTA_0 = 1
  AND O.MRPMES_0 <> ${MRP_MESSAGE.AUCUN}
  AND O.RMNEXTQTY_0 > 0
  AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD')
`

/**
 * Noms des tiers, en requête SÉPARÉE plutôt qu'en `LEFT JOIN BPARTNER`.
 *
 * Ce n'est pas de la prudence : un `LEFT JOIN BPARTNER` combiné à un `GROUP BY`
 * a rendu `resultXml is nil` pendant l'instruction du sujet, alors que la
 * lecture directe de `BPARTNER` sur une liste de codes passe sans problème.
 * Deux appels courts valent mieux qu'un appel qui échoue.
 */
const partnersSql = (codes: string[]): string => `
SELECT BPRNUM_0, BPRNAM_0
FROM BPARTNER
WHERE BPRNUM_0 IN (${codes.map((c) => `'${c.replace(/'/g, "''")}'`).join(', ')})
`

const isMessageCode = (n: number): n is MrpMessageCode =>
  n === MRP_MESSAGE.AVANCER || n === MRP_MESSAGE.RETARDER || n === MRP_MESSAGE.INUTILE

export interface ApproFetchResult {
  suggestions: ApproSuggestionRow[]
  messages: ApproMessageRow[]
  /** Code tiers → raison sociale. Un code absent de `BPARTNER` n'a pas d'entrée. */
  fournisseurs: Record<string, string>
}

export class ApproRepository {
  /**
   * Les deux populations + les noms de tiers, en trois appels SOAP séquentiels.
   *
   * Séquentiel et non parallèle : le coût de `ZSOAPSQL` est CPU côté X3, et le
   * pool `X3Database` est à 1. Paralléliser a déjà été tenté ailleurs sans gain.
   *
   * @param toIso Borne haute d'échéance, incluse (format `YYYY-MM-DD`).
   */
  async fetch(toIso: string): Promise<ApproFetchResult> {
    const to = toIso.replace(/-/g, '')
    const db = new X3Database()
    let sugRows: RawRow[] = []
    let msgRows: RawRow[] = []
    let partRows: RawRow[] = []
    try {
      sugRows = await db.raw(suggestionsSql(to))
      msgRows = await db.raw(messagesSql(to))

      const codes = [
        ...new Set(
          [...sugRows, ...msgRows].map((r) => str(r.BPRNUM_0)).filter((c) => c.length > 0)
        ),
      ]
      if (codes.length > 0) partRows = await db.raw(partnersSql(codes))
    } finally {
      await db.destroy()
    }

    const suggestions: ApproSuggestionRow[] = sugRows.map((row) => ({
      numero: str(row.VCRNUM_0),
      article: str(row.ITMREF_0),
      designation: str(row.ITMDES1_0),
      date: parseDate(row.ENDDAT_0),
      quantite: num(row.RMNEXTQTY_0),
      fournisseur: str(row.BPRNUM_0),
      origine: str(row.ORI_0),
    }))

    const messages: ApproMessageRow[] = msgRows.flatMap((row) => {
      const code = num(row.MRPMES_0)
      // Un code hors des trois attendus signifierait que le paramétrage du site a
      // changé. L'écarter plutôt que l'afficher sans libellé : une ligne muette
      // dans une file de décision est pire qu'une ligne absente.
      if (!isMessageCode(code)) return []
      return [
        {
          numero: str(row.VCRNUM_0),
          ligne: num(row.VCRLIN_0),
          article: str(row.ITMREF_0),
          designation: str(row.ITMDES1_0),
          date: parseDate(row.ENDDAT_0),
          dateProposee: parseDate(row.MRPDAT_0),
          message: code,
          quantite: num(row.RMNEXTQTY_0),
          fournisseur: str(row.BPRNUM_0),
        },
      ]
    })

    const fournisseurs: Record<string, string> = {}
    for (const row of partRows) {
      const code = str(row.BPRNUM_0)
      if (code.length > 0) fournisseurs[code] = str(row.BPRNAM_0)
    }

    return { suggestions, messages, fournisseurs }
  }
}
