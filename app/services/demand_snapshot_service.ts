import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import boardDataset from '#services/board_dataset'
import { ApproRepository, type ApproMessageRow } from '#app/repositories/appro_repository'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { isoDay } from '#app/utils/dates'
import { cacheNs } from '#services/cache_ns'
import {
  diffApproSnapshots,
  type ApproDiffNature,
  type ApproSnapshotRow,
} from '#app/domain/appro_snapshot_diff'
import { diffApproMessageSnapshots, type CbnMessageDiffEntry } from '#app/domain/cbn_message_diff'
import {
  diffCbnDrivers,
  driverDiffAmplitude,
  type DriverDiffEntry,
} from '#app/domain/cbn_driver_diff'
import { explainCbnMessages, type CbnExplanation } from '#app/domain/cbn_explanation'
import {
  couverture,
  jourIso,
  libelleMessage,
  type CouverturePhotos,
} from '#app/domain/snapshot_couverture'
import type { DemandSnapshotRow, ApproMessageSnapshotRow } from '#app/domain/snapshot_rows'
export type { DemandSnapshotRow, ApproMessageSnapshotRow } from '#app/domain/snapshot_rows'

/**
 * Photo quotidienne du besoin (#74 lot 1, absorbé par #98 lot 4).
 *
 * X3 ne versionne rien côté prévisions — cf. commentaire de la migration
 * `demand_snapshots`. Ce service capture 4 populations à un instant T, via les
 * repositories déjà en place (`board_dataset` pour OF/lignes de commande —
 * caches SWR existants, cf. #98 lots 1-2 — puis X3 direct pour stock/appros,
 * qui n'ont pas d'équivalent caché sans filtre d'article) :
 *
 *  - `of_ferme` / `of_planifie` / `of_suggestion` — `boardDataset.getOrders()`
 *  - `demande_ferme` / `demande_prevision` — `X3OrderLineRepository` (lignes
 *    ouvertes, sans fenêtre — une photo doit capter TOUTE la demande visible,
 *    pas seulement un horizon)
 *  - `stock` — `X3StockRepository.getStockLevels()`, quantité = stock STRICT
 *    (physique − alloué phys − alloué global), même convention que les
 *    moteurs de faisabilité
 *  - `appro` — `X3ReceptionRepository.getReceptionFlows()` (PORDERQ ouvertes)
 *
 * S'y ajoute, dans une table dédiée `appro_message_snapshots` (#138 lot 0), la
 * photo des **messages de replanification** du CBN — la population que le
 * module v2 doit expliquer. Table séparée parce qu'un message porte deux
 * champs propres (code du message, date proposée) : cf. la migration.
 *
 * Swap complet PAR DATE (delete + insert transactionnel), même motif que
 * `ReplicaSyncService.ingest()` : idempotent — rejouer `run()` pour la même
 * date remplace la photo au lieu de la dupliquer.
 *
 * Garde-fou explicite (critère d'acceptation #74) : une extraction VIDE
 * n'écrase jamais une photo existante. Une extraction totalement vide signale
 * presque toujours une panne X3, pas un état réel — remplacer une bonne photo
 * par du vide serait pire que ne rien faire.
 *
 * Le grain de ce garde-fou est l'ÉCHEC, pas le vide (#138 lot 0) : une source
 * dont l'extraction a levé n'est pas réécrite et conserve ce qu'un run
 * ANTÉRIEUR DU MÊME JOUR avait figé ; une source qui rend réellement zéro ligne
 * est effacée comme les autres. Confondre les deux ferait cohabiter dans une
 * même photo deux états du parc.
 */

/** Les deux populations d'une photo, une par table de destination. */
export interface SnapshotPayload {
  demand: DemandSnapshotRow[]
  messages: ApproMessageSnapshotRow[]
  /**
   * Sources dont l'extraction a LEVÉ pendant ce run. Elles ne sont pas
   * réécrites : ce qu'une écriture antérieure du même jour avait figé reste en
   * place (cf. `write`).
   *
   * C'est bien l'ÉCHEC qui protège, pas le vide. Une source absente du payload
   * sans être ici a réellement rendu zéro ligne, et ses lignes de l'écriture
   * précédente doivent disparaître — sinon la photo mélangerait deux états du
   * parc : les 120 OF planifiés de 04 h survivant à côté des mêmes 120 passés
   * en ferme à 15 h, comptés deux fois sans que rien ne le dise.
   */
  sourcesEnEchec: string[]
}

const INSERT_CHUNK = 400

/**
 * Jour LOCAL où une ligne a été écrite — la seule trace du fait qu'une photo a
 * été prise un autre jour que celui qu'elle prétend décrire (`snapshot:run
 * --date`, qui n'est pas un backfill : il fige l'état d'aujourd'hui sous une
 * date passée). Un faux historique que rien d'autre ne détecte, et que le lot 1
 * differait comme du réel.
 *
 * SQLite, seul moteur de la base applicative. Deux précautions :
 * - `created_at` est stocké en entier (epoch ms) par le driver, mais d'autres
 *   tables du repo le portent en texte ISO : le `CASE` couvre les deux plutôt
 *   que de rendre `NULL` en silence sur l'une des deux formes ;
 * - `localtime`, parce que `snapshot_date` est un jour LOCAL (`isoDay`) — sans
 *   lui, tout run passé entre minuit et 02 h serait déclaré antidaté.
 */
const JOUR_ECRITURE = `CASE WHEN typeof(created_at) = 'integer'
    THEN date(created_at / 1000, 'unixepoch', 'localtime')
    ELSE date(created_at, 'localtime') END`

/**
 * Les noms de source, en un seul endroit (#138 lot 0).
 *
 * `buildPayload` les écrit et `SOURCES_ATTENDUES` les relit pour dire « il en
 * manque une » : deux listes de littéraux se seraient séparées au premier
 * renommage, et le symptôme aurait été soit une alerte à chaque run, soit —
 * bien pire — un silence définitif sur une population perdue.
 */
export const SOURCE = {
  OF_FERME: 'of_ferme',
  OF_PLANIFIE: 'of_planifie',
  OF_SUGGESTION: 'of_suggestion',
  DEMANDE_FERME: 'demande_ferme',
  DEMANDE_PREVISION: 'demande_prevision',
  STOCK: 'stock',
  APPRO: 'appro',
  APPRO_SUGGESTION: 'appro_suggestion',
  /** Population de la table dédiée — pas une source de `demand_snapshots`. */
  MESSAGE: 'appro_message',
} as const

function isoDayOrNull(d: Date | null | undefined): string | null {
  return d ? isoDay(d) : null
}

/**
 * Une ligne d'extraction X3 → une ligne de photo des messages (#138 lot 0).
 *
 * Extraite du service pour être testable sans X3 joignable : c'est le seul
 * endroit du lot qui décide du CONTENU figé — et une photo fausse ne se
 * rattrape pas.
 *
 * Les dates arrivent déjà nettoyées de la sentinelle X3 `31-DEC-99`
 * (`appro_repository.parseDate` la rend `null`) : `mrpdat` nul veut dire « le
 * CBN ne propose pas de date », ce qui est le cas normal d'« inutile ».
 */
export function messageSnapshotRow(
  m: ApproMessageRow,
  snapshotDate: string
): ApproMessageSnapshotRow {
  return {
    snapshot_date: snapshotDate,
    vcrnum: m.numero,
    vcrlin: m.ligne,
    vcrseq: m.sequence,
    itmref: m.article,
    // `BPRNUM_0` vide existe sur ORDERS : la colonne est nullable, on ne fige
    // pas une chaîne vide qui se lirait plus tard comme un code fournisseur.
    fournisseur: m.fournisseur.length > 0 ? m.fournisseur : null,
    mrpmes: m.message,
    mrpdat: isoDayOrNull(m.dateProposee),
    enddat: isoDayOrNull(m.date),
    quantity: m.quantite,
  }
}

export interface SnapshotResult {
  date: string
  status: 'ok' | 'failed' | 'skipped-empty'
  rows: number
  durationMs: number
  /**
   * Lignes écrites par ce run, par source (`stock`, `appro_suggestion`, …,
   * `appro_message`). Vide sur `failed` et `skipped-empty`.
   *
   * Une source absente n'a rien écrit CE RUN-CI : soit son extraction a levé
   * (elle est alors dans `sourcesEnEchec` et ses lignes antérieures tiennent),
   * soit elle a rendu zéro ligne. Le rapprochement avec `SOURCES_ATTENDUES` est
   * ce qui transforme ce décompte en alerte — rôle des appelants (CLI,
   * provider nocturne), pas du service.
   */
  sourceBreakdown: Record<string, number>
  error?: string
}

/**
 * Ce qu'une photo COMPLÈTE contient (#138 lot 0) : huit sources dans
 * `demand_snapshots`, plus les messages dans leur table dédiée.
 *
 * Sert à dire « il en manque une ». Sans ce rapprochement, un CBN en échec
 * trente nuits d'affilée logge trente fois « ok, 28 000 lignes » sans que ni
 * les suggestions ni les messages ne soient jamais figés — le mode de
 * défaillance silencieuse que ce lot existe pour rendre impossible.
 */
export const SOURCES_ATTENDUES = Object.values(SOURCE)

export interface SnapshotDiagnostic {
  besoin: CouverturePhotos
  messages: CouverturePhotos
}

export class DemandSnapshotService {
  async run(date: Date = new Date(), source = 'manual'): Promise<SnapshotResult> {
    const dateStr = isoDay(date)
    return this.write(dateStr, source, () => this.buildPayload(dateStr))
  }

  /**
   * Jour de la photo la plus récente (`YYYY-MM-DD`), `null` si la table est vide.
   *
   * C'est le seul état durable dont dispose la planification quotidienne
   * (`demand_snapshot_provider.ts`) : ce service n'écrit pas d'`ingestion_log`,
   * volontairement (cf. `write()`). La photo elle-même fait donc office de
   * journal — ce qui suffit, puisque la question posée est exactement « la photo
   * du jour existe-t-elle ». Lu en base et non gardé en mémoire, pour la même
   * raison que `ReplicaSyncService.lastFullRuns()` : un redémarrage ne doit pas
   * pouvoir faire sauter une journée en silence.
   *
   * SQLite stocke `snapshot_date` en texte ISO de largeur fixe : `MAX()` y est
   * bien l'ordre chronologique.
   */
  async latestSnapshotDay(): Promise<string | null> {
    const row = await db.connection().from('demand_snapshots').max('snapshot_date as day').first()
    const day: unknown = (row as { day?: unknown } | null)?.day ?? null
    if (day === null || day === undefined) return null
    return jourIso(day)
  }

  /**
   * Lignes de la photo des suggestions d'un jour donné (source `appro_suggestion`).
   * `null` si aucune photo ce jour-là (le jour est l'identité de la photo).
   */
  async approSnapshots(dateStr: string): Promise<ApproSnapshotRow[] | null> {
    const rows = await db
      .connection()
      .from('demand_snapshots')
      .where('snapshot_date', dateStr)
      .andWhere('source', 'appro_suggestion')
    if (rows.length === 0) return null
    return rows.map((r) => ({
      article: String(r.itmref),
      fournisseur: r.fournisseur === null ? null : String(r.fournisseur),
      quantite: Number(r.quantity),
      echeance: r.date_echeance === null ? null : String(r.date_echeance),
    }))
  }

  /**
   * Les deux jours de photo des suggestions les plus récents, `[apres, avant]`.
   * `null` s'il n'y en a pas deux — un diff a besoin de deux points.
   *
   * Lus en base plutôt que déduits de la date du jour : un run nocturne manqué,
   * un week-end ou un lundi matin ne doivent pas rendre le diff indisponible
   * alors que deux photos comparables existent. Les deux jours rendus peuvent
   * donc être distants de plus d'un jour — l'écran affiche les dates.
   */
  async deuxDernieresPhotosAppro(): Promise<[string, string] | null> {
    const rows = await db
      .connection()
      .from('demand_snapshots')
      .where('source', 'appro_suggestion')
      .distinct('snapshot_date')
      .orderBy('snapshot_date', 'desc')
      .limit(2)
    if (rows.length < 2) return null
    const jour = (r: unknown): string => jourIso((r as { snapshot_date?: unknown }).snapshot_date)
    return [jour(rows[0]), jour(rows[1])]
  }

  /**
   * Diff inter-CBN des suggestions entre deux photos (#133) : apparues,
   * disparues, quantités > ±20 % et échéances > ±7 j (#112). Une photo
   * manquante d'un côté rend le diff indisponible (`null`) — pas de faux
   * « tout est apparu » sur un trou de données.
   */
  async diffAppro(apresDay: string, avantDay: string) {
    const [avant, apres] = await Promise.all([
      this.approSnapshots(avantDay),
      this.approSnapshots(apresDay),
    ])
    if (avant === null || apres === null) return null
    const entrees = diffApproSnapshots(avant, apres)
    const parNature: Record<ApproDiffNature, number> = {
      apparue: 0,
      disparue: 0,
      quantite: 0,
      date: 0,
    }
    for (const e of entrees) parNature[e.nature] += 1
    return { avant: avantDay, apres: apresDay, parNature, entrees }
  }

  /**
   * Lignes de la photo des messages d'un jour donné (#138 lot 1).
   * `null` si aucune photo ce jour-là.
   */
  async messageSnapshots(dateStr: string): Promise<ApproMessageSnapshotRow[] | null> {
    const rows = await db
      .connection()
      .from('appro_message_snapshots')
      .where('snapshot_date', dateStr)
    if (rows.length === 0) return null
    return rows.map((r) => ({
      snapshot_date: String(r.snapshot_date).slice(0, 10),
      vcrnum: String(r.vcrnum),
      vcrlin: Number(r.vcrlin),
      vcrseq: String(r.vcrseq),
      itmref: String(r.itmref),
      fournisseur: r.fournisseur === null ? null : String(r.fournisseur),
      mrpmes: Number(r.mrpmes),
      mrpdat: r.mrpdat === null ? null : String(r.mrpdat).slice(0, 10),
      enddat: r.enddat === null ? null : String(r.enddat).slice(0, 10),
      quantity: Number(r.quantity),
    }))
  }

  /**
   * Les deux jours de photo des messages les plus récents, `[apres, avant]`.
   * Même logique que `deuxDernieresPhotosAppro` : on lit en base, pas depuis la
   * date du jour, pour survivre aux week-ends/pannes.
   */
  async deuxDernieresPhotosMessages(): Promise<[string, string] | null> {
    const rows = await db
      .connection()
      .from('appro_message_snapshots')
      .distinct('snapshot_date')
      .orderBy('snapshot_date', 'desc')
      .limit(2)
    if (rows.length < 2) return null
    const jour = (r: unknown): string => jourIso((r as { snapshot_date?: unknown }).snapshot_date)
    return [jour(rows[0]), jour(rows[1])]
  }

  /**
   * Les deux jours de photo du BESOIN les plus récents, `[apres, avant]`.
   *
   * Distinct de `deuxDernieresPhotosMessages` : les deux tables peuvent diverger
   * d'un jour quand l'extraction CBN échoue seule (garde-fou par source, lot 0).
   */
  async deuxDernieresPhotosBesoin(): Promise<[string, string] | null> {
    const rows = await db
      .connection()
      .from('demand_snapshots')
      .distinct('snapshot_date')
      .orderBy('snapshot_date', 'desc')
      .limit(2)
    if (rows.length < 2) return null
    const jour = (r: unknown): string => jourIso((r as { snapshot_date?: unknown }).snapshot_date)
    return [jour(rows[0]), jour(rows[1])]
  }

  /**
   * Liste des photos disponibles pour le sélecteur de dates (§5.1).
   * Tri décroissant (plus récente d'abord), avec décompte par photo.
   */
  async listSnapshots(): Promise<Array<{ date: string; lignes: number; sources: number }>> {
    const rows = await db
      .connection()
      .from('demand_snapshots')
      .select('snapshot_date')
      .count('* as lignes')
      .countDistinct('source as sources')
      .groupBy('snapshot_date')
      .orderBy('snapshot_date', 'desc')
    return rows.map((r: Record<string, unknown>) => ({
      date: jourIso((r as { snapshot_date?: unknown }).snapshot_date),
      lignes: Number(r.lignes),
      sources: Number(r.sources),
    }))
  }

  /**
   * Diff pur des messages entre deux photos (#138 lot 1).
   * `null` si l'une des deux photos manque — pas de faux "tout est apparu".
   */
  async diffMessages(
    apresDay: string,
    avantDay: string
  ): Promise<{
    avant: string
    apres: string
    parNature: Record<string, number>
    entrees: CbnMessageDiffEntry[]
  } | null> {
    const [avant, apres] = await Promise.all([
      this.messageSnapshots(avantDay),
      this.messageSnapshots(apresDay),
    ])
    if (avant === null || apres === null) return null
    const entrees = diffApproMessageSnapshots(avant, apres)
    const parNature: Record<string, number> = {
      apparue: 0,
      disparue: 0,
      intensifiee: 0,
      attenuee: 0,
      modifiee: 0,
    }
    for (const e of entrees) parNature[e.nature] = (parNature[e.nature] ?? 0) + 1
    return { avant: avantDay, apres: apresDay, parNature, entrees }
  }

  /**
   * Diff des drivers par article entre deux photos (#138 lot 1).
   * `null` si l'une des deux photos manque.
   * Mis en cache FOREVER par couple de jours : une photo est immuable une fois
   * écrite, donc le diff l'est aussi. Enrichi (désignation/famille) et trié par
   * amplitude décroissante AVANT le cache — les filtres/limites s'appliquent
   * APRÈS, sur le résultat complet mémorisé (§5.3, §5.4).
   */
  async diffDrivers(
    apresDay: string,
    avantDay: string
  ): Promise<{ avant: string; apres: string; entrees: DriverDiffEntry[] } | null> {
    const cached = await cacheNs('appro').getOrSetForever({
      key: `appro:drivers:${avantDay}:${apresDay}:v5`,
      factory: async () => {
        const conn = db.connection()
        const [avantRows, apresRows] = await Promise.all([
          conn.from('demand_snapshots').where('snapshot_date', avantDay),
          conn.from('demand_snapshots').where('snapshot_date', apresDay),
        ])
        if (avantRows.length === 0 || apresRows.length === 0) return null
        const toRow = (r: Record<string, unknown>): DemandSnapshotRow => ({
          snapshot_date: String(r.snapshot_date).slice(0, 10),
          source: String(r.source),
          itmref: String(r.itmref),
          vcrnum: r.vcrnum === null ? null : String(r.vcrnum),
          vcrlin: r.vcrlin === null ? null : String(r.vcrlin),
          quantity: Number(r.quantity),
          date_echeance: r.date_echeance === null ? null : String(r.date_echeance).slice(0, 10),
          fournisseur: r.fournisseur === null ? null : String(r.fournisseur),
        })
        const avant: DemandSnapshotRow[] = avantRows.map(toRow)
        const apres: DemandSnapshotRow[] = apresRows.map(toRow)
        let entrees = diffCbnDrivers(avant, apres)

        if (entrees.length > 0) {
          const codes = [...new Set(entrees.map((e) => e.article))]
          const chunkSize = 900
          const map = new Map<
            string,
            { designation: string | null; famille: string | null; categorie: string | null }
          >()
          for (let i = 0; i < codes.length; i += chunkSize) {
            const chunk = codes.slice(i, i + chunkSize)
            const rows = await conn
              .from('static_articles')
              .whereIn('code', chunk)
              .select('code', 'description', 'famille', 'category')
            for (const r of rows as Array<Record<string, unknown>>) {
              const code = String((r as Record<string, unknown>).code)
              const desc = (r as Record<string, unknown>).description
              const fam = (r as Record<string, unknown>).famille
              const cat = (r as Record<string, unknown>).category
              map.set(code, {
                designation: desc === null || desc === undefined ? null : String(desc) || null,
                famille: fam === null || fam === undefined ? null : String(fam) || null,
                categorie: cat === null || cat === undefined ? null : String(cat),
              })
            }
          }
          // Exclure les articles dont la catégorie commence par Z (même règle que stock_valuation et BOM)
          const zSet = new Set<string>()
          for (const [code, v] of map.entries()) {
            if (v.categorie !== null && v.categorie.startsWith('Z')) zSet.add(code)
          }
          if (zSet.size > 0) entrees = entrees.filter((e) => !zSet.has(e.article))

          // Enrichissement désignation/famille (§5.2) : jointure static_articles
          // sur les seuls articles présents dans le diff, pas un LEFT JOIN sur
          // toute la photo.
          entrees = entrees.map((e) => {
            const hit = map.get(e.article)
            return {
              ...e,
              designation: hit?.designation ?? null,
              famille: hit?.famille ?? null,
            }
          })
        }

        // Tri par amplitude relative décroissante (§5.3) AVANT tout bornage.
        entrees = [...entrees].sort((a, b) => driverDiffAmplitude(b) - driverDiffAmplitude(a))

        return { avant: avantDay, apres: apresDay, entrees }
      },
    })
    if (cached === null) return null
    // Valeur en lecture seule (cache_ns.ts) — copie défensive avant de la
    // rendre à l'appelant qui pourrait filtrer/trier/slicer.
    return { avant: cached.avant, apres: cached.apres, entrees: [...cached.entrees] }
  }

  /**
   * Explication : croise diff messages × diff drivers (#138 lot 1).
   * `null` si l'une des deux photos manque côté messages ou côté besoin.
   */
  async explainMessages(
    apresDay: string,
    avantDay: string
  ): Promise<{
    avant: string
    apres: string
    nbMessages: number
    nbDrivers: number
    explications: CbnExplanation[]
  } | null> {
    // Mis en cache sur le COUPLE de jours : une photo est immuable une fois
    // écrite, donc le croisement de deux photos l'est aussi. Sans cache, chaque
    // chargement de la page relit deux journées entières de `demand_snapshots`
    // — 67 787 lignes mesurées pour le couple 05/08–06/08 — pour rendre une
    // liste de corrélations qui ne bougera plus jamais.
    //
    // `getOrSetForever` et non `getOrSet` : il n'y a pas de fraîcheur à
    // rattraper, la clé change d'elle-même quand une nouvelle photo arrive.
    // Valeur en LECTURE SEULE (cf. `cache_ns.ts`) — personne ne la mute ici.
    const cached = await cacheNs('appro').getOrSetForever({
      key: `appro:explications:${avantDay}:${apresDay}`,
      factory: async () => {
        const [m, d] = await Promise.all([
          this.diffMessages(apresDay, avantDay),
          this.diffDrivers(apresDay, avantDay),
        ])
        if (m === null || d === null) return null
        return {
          nbMessages: m.entrees.length,
          nbDrivers: d.entrees.length,
          explications: explainCbnMessages(m.entrees, d.entrees),
        }
      },
    })
    if (cached === null) return null
    const { nbMessages, nbDrivers, explications } = cached
    // Les deux diffs bruts ne sortent PAS d'ici : `drivers` est le diff de
    // ~250 000 lignes de photo, et l'écran n'en lit que les corrélations déjà
    // rattachées à chaque message. Qui les veut a `/messages-diff` et
    // `/drivers-diff`, faits pour ça. On ne garde que les décomptes, qui
    // suffisent à dire « le diff a bien tourné ».
    return { avant: avantDay, apres: apresDay, nbMessages, nbDrivers, explications }
  }

  /**
   * État de l'historique des photos, pour `node ace snapshot:diagnose` (#138
   * lot 0). Aucun appel X3 : la question posée est « qu'a-t-on accumulé », pas
   * « qu'y a-t-il dans X3 ».
   *
   * Le lot 0 est invisible côté UI — ce diagnostic est le SEUL moyen de vérifier
   * que l'horloge de maturation tourne avant que le lot 1 n'existe.
   */
  async diagnostic(): Promise<SnapshotDiagnostic> {
    const conn = db.connection()
    const [besoin, messages] = await Promise.all([
      conn
        .from('demand_snapshots')
        .select('snapshot_date', 'source')
        .select(conn.raw(`${JOUR_ECRITURE} as ecrit_le`))
        .count('* as n')
        .groupBy('snapshot_date', 'source', 'ecrit_le'),
      conn
        .from('appro_message_snapshots')
        .select('snapshot_date', 'mrpmes')
        .select(conn.raw(`${JOUR_ECRITURE} as ecrit_le`))
        .count('* as n')
        .groupBy('snapshot_date', 'mrpmes', 'ecrit_le'),
    ])
    return {
      besoin: couverture(besoin, (r) => String(r.source)),
      messages: couverture(messages, (r) => libelleMessage(Number(r.mrpmes))),
    }
  }

  /**
   * Swap complet + garde-fou, isolé de l'extraction X3 — même découpage que
   * `ReplicaSyncService.ingest(table, source, fetch)`, `protected` pour la même
   * raison : seule cette logique (transaction, garde-fou vide, journalisation)
   * est testable sans X3 joignable. `tests/unit/demand_snapshot_service.test.ts`
   * la rejoue via une sous-classe qui expose cette méthode.
   */
  protected async write(
    dateStr: string,
    source: string,
    fetchRows: () => Promise<SnapshotPayload>
  ): Promise<SnapshotResult> {
    const start = Date.now()

    try {
      const { demand, messages, sourcesEnEchec } = await fetchRows()

      // Les huit sources de `demand` viennent de quatre repositories distincts :
      // les voir TOUTES vides ne décrit aucun état réel du parc, c'est une panne.
      // On n'écrit alors rien du tout, messages compris — ils sortent du même run.
      if (demand.length === 0) {
        logger.warn(
          { date: dateStr, source },
          '[snapshot] extraction vide — écriture annulée, photo existante préservée'
        )
        return {
          date: dateStr,
          status: 'skipped-empty',
          rows: 0,
          durationMs: Date.now() - start,
          sourceBreakdown: {},
          error: 'extraction vide — écriture annulée, photo existante (si any) préservée',
        }
      }

      // Le même garde-fou, appliqué à la GRANULARITÉ de l'échec : seules les
      // sources dont l'extraction a levé échappent au swap. Tout le reste est
      // effacé puis réécrit, y compris ce qui est revenu vide — une source
      // réellement à zéro doit voir ses lignes antérieures disparaître, sinon
      // la photo mélange deux états du parc (cf. `SnapshotPayload`).
      //
      // Concrètement : run nocturne complet à 04 h, puis `snapshot:run` relancé
      // à la main à 15 h pendant qu'X3 sature. L'appel CBN lève → les 5 469
      // suggestions et les 777 messages figés la nuit restent en place, au lieu
      // de disparaître et de laisser /approvisionnements sans diff.
      if (sourcesEnEchec.length > 0) {
        logger.warn(
          { date: dateStr, source, sourcesEnEchec },
          `[snapshot] sources en échec, non réécrites : ${sourcesEnEchec.join(', ')}`
        )
      }
      const ecritMessages = !sourcesEnEchec.includes(SOURCE.MESSAGE)

      const conn = db.connection()
      const trx = await conn.transaction()
      try {
        const suppression = trx.from('demand_snapshots').where('snapshot_date', dateStr)
        // `whereNotIn` avec une liste vide rendrait `where 1 = 1` : inutile mais
        // surtout illisible dans les logs SQL. Le cas nominal n'a aucun échec.
        if (sourcesEnEchec.length > 0) suppression.whereNotIn('source', sourcesEnEchec)
        await suppression.delete()
        for (let i = 0; i < demand.length; i += INSERT_CHUNK) {
          await trx
            .table('demand_snapshots')
            .insert(
              demand.slice(i, i + INSERT_CHUNK).map((r) => ({ ...r, created_at: new Date() }))
            )
        }
        if (ecritMessages) {
          await trx.from('appro_message_snapshots').where('snapshot_date', dateStr).delete()
          for (let i = 0; i < messages.length; i += INSERT_CHUNK) {
            await trx
              .table('appro_message_snapshots')
              .insert(
                messages.slice(i, i + INSERT_CHUNK).map((r) => ({ ...r, created_at: new Date() }))
              )
          }
        }
        await trx.commit()
      } catch (error) {
        await trx.rollback()
        throw error
      }

      const sourceBreakdown: Record<string, number> = {}
      for (const r of demand) sourceBreakdown[r.source] = (sourceBreakdown[r.source] ?? 0) + 1
      if (ecritMessages) sourceBreakdown[SOURCE.MESSAGE] = messages.length

      const rows = demand.length + (ecritMessages ? messages.length : 0)
      const durationMs = Date.now() - start
      // `source` ('manual' | 'scheduler' | 'cli') sert d'observabilité minimale
      // (critère d'acceptation) : à défaut d'un journal dédié, un log applicatif
      // suffit pour ce lot — un `ingestion_log`-like viendrait avec le lot 2 s'il
      // s'avère nécessaire (verdicts UI, historique des runs).
      logger.info(
        { date: dateStr, source, rows, durationMs, sourceBreakdown },
        `[snapshot] ${dateStr} : ${rows} lignes en ${durationMs} ms`
      )
      return { date: dateStr, status: 'ok', rows, durationMs, sourceBreakdown }
    } catch (error) {
      const message = (error as Error)?.message ?? String(error)
      const durationMs = Date.now() - start
      logger.error({ date: dateStr, source, err: message }, `[snapshot] échec ${dateStr}`)
      return {
        date: dateStr,
        status: 'failed',
        rows: 0,
        durationMs,
        sourceBreakdown: {},
        error: message,
      }
    }
  }

  private async buildPayload(dateStr: string): Promise<SnapshotPayload> {
    const out: DemandSnapshotRow[] = []
    const messages: ApproMessageSnapshotRow[] = []
    const sourcesEnEchec: string[] = []

    const { mos } = await boardDataset.getOrders()
    for (const mo of mos) {
      const src =
        mo.status === 1
          ? SOURCE.OF_FERME
          : mo.status === 2
            ? SOURCE.OF_PLANIFIE
            : SOURCE.OF_SUGGESTION
      out.push({
        snapshot_date: dateStr,
        source: src,
        itmref: mo.article,
        vcrnum: mo.numOf,
        vcrlin: null,
        quantity: mo.quantity,
        date_echeance: isoDayOrNull(mo.endDate),
        fournisseur: null,
      })
    }

    const lines = await new X3OrderLineRepository().getOpenOrderLines()
    for (const l of lines) {
      out.push({
        snapshot_date: dateStr,
        source: l.nature === 'COMMANDE' ? SOURCE.DEMANDE_FERME : SOURCE.DEMANDE_PREVISION,
        itmref: l.article,
        vcrnum: l.numCommande,
        vcrlin: l.ligne,
        quantity: l.quantite,
        date_echeance: isoDayOrNull(l.dateLivraison),
        fournisseur: null,
      })
    }

    const stock = await new X3StockRepository().getStockLevels()
    for (const s of stock) {
      out.push({
        snapshot_date: dateStr,
        source: SOURCE.STOCK,
        itmref: s.article,
        vcrnum: null,
        vcrlin: null,
        quantity: s.physique - s.allouePhys - s.alloueGlobal,
        date_echeance: null,
        fournisseur: null,
      })
    }

    const receptions = await new X3ReceptionRepository().getReceptionFlows()
    for (const f of receptions) {
      if (f.origin.type !== 'reception') continue
      out.push({
        snapshot_date: dateStr,
        source: SOURCE.APPRO,
        itmref: f.article,
        vcrnum: f.origin.id,
        vcrlin: null,
        quantity: f.quantity,
        date_echeance: isoDayOrNull(f.date),
        fournisseur: f.origin.supplier,
      })
    }

    // Deux populations CBN, un seul appel (`ApproRepository.fetch` les rend
    // ensemble) — horizon 18 mois, le même pour les deux (#138 : 777 messages
    // sur 777 tiennent sous cet horizon, il n'en coupe aucun).
    //
    // - Suggestions (WIPTYP=2, WIPSTA=3) — #133. Population COMPLÈTE (~5 600
    //   lignes mesurées #108) : c'est elle qui permet de voir une suggestion
    //   APPARAÎTRE avant son horizon utile. `VCRNUM` recréé chaque run → la clé
    //   du diff est le contenu (appro_snapshot_diff.ts).
    // - Messages de replanification (WIPTYP=2, WIPSTA=1, `MRPMES_0 <> 1`) —
    //   #138 lot 0. Écrits EN PLACE sur une ligne qui persiste : la clé
    //   `VCRNUM:VCRLIN:VCRSEQ` y est stable, figée telle quelle.
    //   777 lignes/jour en PROD.
    //
    // Source ISOLÉE — la SEULE du lot : une erreur X3 ici ne doit pas faire
    // perdre la photo des autres populations (X3 ne versionne rien, une photo
    // manquée est manquée). Les quatre extractions ci-dessus n'ont pas de
    // try/catch : si elles lèvent, `write` rend `failed` et n'écrit rien —
    // c'est ce qui rend leur absence du payload univoque (zéro ligne réelle,
    // jamais une panne), et donc `sourcesEnEchec` fiable comme critère de
    // préservation.
    try {
      const appro = await new ApproRepository().fetch(approSnapshotTo())
      for (const s of appro.suggestions) {
        out.push({
          snapshot_date: dateStr,
          source: SOURCE.APPRO_SUGGESTION,
          itmref: s.article,
          vcrnum: s.numero,
          vcrlin: null,
          quantity: s.quantite,
          date_echeance: isoDayOrNull(s.date),
          fournisseur: s.fournisseur,
        })
      }
      for (const m of appro.messages) messages.push(messageSnapshotRow(m, dateStr))
    } catch (error) {
      sourcesEnEchec.push(SOURCE.APPRO_SUGGESTION, SOURCE.MESSAGE)
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        '[snapshot] population CBN indisponible — suggestions ET messages non réécrits'
      )
    }

    return { demand: out, messages, sourcesEnEchec }
  }
}

/** Borne de la photo des suggestions : horizon 18 mois (#108, population complète). */
const APPRO_SNAPSHOT_HORIZON_DAYS = 548
const approSnapshotTo = (): string => {
  const d = new Date(Date.now() + APPRO_SNAPSHOT_HORIZON_DAYS * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const demandSnapshotService = new DemandSnapshotService()
export default demandSnapshotService
