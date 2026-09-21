/**
 * Export CSV du détail de la charge — ce qui compose les barres du graphe
 * /charge, toutes postes × toutes périodes visibles confondues.
 *
 * Il s'appuie sur `loadChargeDetailRows` (charge_detail_loader) : les lignes
 * exportées sont donc STRICTEMENT celles que la table de détail affiche pour
 * chaque barre (mêmes entrées X3, même `chargeDay`, même moteur de matching,
 * et le même cache). Un fichier exporté ne peut pas mentir sur ce que montre
 * l'écran.
 *
 * Côté serveur (et non dans le navigateur) parce que la vue commande coûte une
 * explosion de nomenclature : la faire ici, une seule fois pour tout l'horizon,
 * est le seul montage qui tienne ; la refaire par bucket dans le client serait
 * prohibitif et dupliquerait un moteur qui ne doit avoir qu'une maison.
 *
 * Le filtrage est celui de l'écran, à l'identique : la page envoie la liste des
 * postes VISIBLES (ateliers + recherche déjà appliqués), les segments actifs et
 * les clés des buckets affichés (maille hebdo déjà tronquée par le payload).
 */

import { createHash } from 'node:crypto'
import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import { atelierLabel } from '#app/domain/atelier'
import { isoDay } from '#app/utils/dates'
import { csvDateFr, csvNumber, csvQty, toCsv } from '#app/utils/csv'
import { chargeBucketRange, chargeHorizon, type OfDateMode } from '#services/load_payload_loader'
import {
  loadChargeDetailRows,
  type ChargeDetailCmdRowT,
  type ChargeDetailOfRowT,
  type ChargeDetailView,
  type ChargeGran,
  type ChargeSegField,
} from '#services/charge_detail_loader'
import { OrderLineOverrideStore } from '#services/order_line_override_store'

/** Cran de quantité exporté — miroir de `LoadQtyMode` côté client. */
export type ChargeExportQtyMode = 'brut' | 'net' | 'reste'

export interface ChargeExportParams {
  start?: string
  ofDate?: OfDateMode
  view: ChargeDetailView
  gran: ChargeGran
  qtyMode: ChargeExportQtyMode
  applyDemandHorizon?: boolean
  /** Ids de segments actifs (OF : f/p/s ; commande : commande/prevision). */
  segments?: string[]
  /** Codes des postes VISIBLES à l'écran (ateliers + recherche appliqués). */
  postes?: string[]
  /** Clés des buckets affichés (`monthKeys` / `weekKeys` du payload). */
  buckets?: string[]
  version?: string
  refresh?: boolean
}

/** Une ligne du CSV — les champs absents selon la vue restent `null`. */
export interface ChargeExportRow {
  poste: string
  posteLabel: string
  atelier: string
  atelierLabel: string
  bucketKey: string
  bucketLabel: string
  fromIso: string
  toIso: string
  seg: ChargeSegField
  article: string
  designation: string | null
  // Vue OF
  numOf: string | null
  statutLabel: string | null
  dateBesoin: string | null
  // Vue commande
  numCommande: string | null
  ligne: string | null
  client: string | null
  pfArticle: string | null
  depth: number | null
  dateX3Iso: string | null
  dateOverrideIso: string | null
  // Valeurs — quantité (pièces) et heures de poste, au cran demandé.
  qty: number
  hours: number
}

export interface ChargeExportData {
  view: ChargeDetailView
  gran: ChargeGran
  qtyMode: ChargeExportQtyMode
  rows: ChargeExportRow[]
  x3Error: string | null
}

/** Erreur de paramètre — le contrôleur la traduit en 400. */
export class ChargeExportBadRequest extends Error {}

/** Ids de segments → champs de `LoadPeriod` retenus (miroir de `segKeys` client). */
const OF_SEG_FIELDS: Record<string, ChargeSegField[]> = { f: ['f'], p: ['p'], s: ['s'] }
const CMD_SEG_FIELDS: Record<string, ChargeSegField[]> = {
  commande: ['f', 'fi'],
  prevision: ['s', 'si'],
}

function segFieldsFor(view: ChargeDetailView, ids?: string[]): Set<ChargeSegField> {
  const table = view === 'of' ? OF_SEG_FIELDS : CMD_SEG_FIELDS
  if (!ids || ids.length === 0) return new Set(Object.values(table).flat())
  const out = new Set<ChargeSegField>()
  for (const id of ids) for (const key of table[id] ?? []) out.add(key)
  // Un id inconnu ne doit pas produire un fichier vide : on retombe sur tout.
  return out.size ? out : new Set(Object.values(table).flat())
}

/** Libellé de segment, aligné sur la légende du graphe (cf. `segLabel` client). */
export function segLabelFr(view: ChargeDetailView, key: ChargeSegField): string {
  if (key === 'fi') return 'Induit (ferme)'
  if (key === 'si') return 'Induit (prévision)'
  if (view === 'commande') return key === 's' ? 'Prévision' : 'Commande'
  return key === 'f' ? 'Ferme' : key === 'p' ? 'Planifié' : 'Suggéré'
}

/** Clé de cache stable et bornée — évite de porter des dizaines de codes en clair. */
function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12)
}

interface ExportBucket {
  key: string
  label: string
  fromIso: string
  toIso: string
}

export async function loadChargeExport(params: ChargeExportParams): Promise<ChargeExportData> {
  const version = params.version && /^[a-z0-9]{4,24}$/i.test(params.version) ? params.version : null

  // Buckets : ceux que l'écran affiche. Une clé illisible est un 400, jamais un
  // intervalle par défaut — un fichier plausible mais faux se propage loin.
  const bucketKeys = (params.buckets ?? []).map((k) => k.trim()).filter(Boolean)
  if (bucketKeys.length === 0) throw new ChargeExportBadRequest('Aucune période à exporter')
  const buckets: ExportBucket[] = bucketKeys.map((key) => {
    const range = chargeBucketRange(params.gran, key)
    if (!range) throw new ChargeExportBadRequest(`Période illisible : ${key}`)
    return { key, label: range.label, fromIso: isoDay(range.from), toIso: isoDay(range.to) }
  })

  const postes = [...new Set((params.postes ?? []).map((p) => p.trim()).filter(Boolean))].sort()
  if (postes.length === 0) throw new ChargeExportBadRequest('Aucun poste à exporter')
  const posteFilter = new Set(postes)
  const fields = segFieldsFor(params.view, params.segments)

  const { monthStart } = chargeHorizon(params.start)
  const ofDate = params.ofDate === 'end' ? 'end' : 'start'
  const applyDemandHorizon = params.applyDemandHorizon ?? true
  const force = !!params.refresh

  // Empreinte des overrides de date : sur la branche live, l'export redate la
  // demande comme la barre ; une clé qui l'ignorerait servirait le fichier
  // d'avant le déplacement.
  const ovSig = await new OrderLineOverrideStore().signature().catch(() => 'none')
  const cacheKey = [
    'export:charge:s1',
    isoDay(monthStart),
    version ?? 'live',
    params.view,
    params.gran,
    ofDate,
    `h${applyDemandHorizon ? 1 : 0}`,
    params.qtyMode,
    `seg${[...fields].sort().join('')}`,
    `p${shortHash(postes.join(','))}`,
    `b${shortHash(bucketKeys.join(','))}`,
    `ov${ovSig}`,
  ].join(':')
  if (force) await cacheNs('charge').delete({ key: cacheKey })

  return cacheNs('charge').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: stamped(async (): Promise<ChargeExportData> => {
      // Base partagée avec le détail : mêmes entrées X3 que la barre cliquée
      // (version du snapshot), même explosion — et le MÊME cache, donc exporter
      // juste après avoir ouvert un panneau ne recalcule rien.
      const detail = await loadChargeDetailRows({
        start: params.start,
        version,
        view: params.view,
        ofDate,
        applyDemandHorizon,
        refresh: force,
      })
      const wstByCode = detail.wstByCode

      // Bucket d'une ligne : son `dateIso` est déjà le jour de rattachement
      // décalé, il suffit de le loger dans l'intervalle du bucket (comparaison
      // lexicographique sur `YYYY-MM-DD`). Quelques dizaines de buckets : une
      // recherche linéaire par ligne reste négligeable.
      const bucketOf = (dateIso: string): ExportBucket | null =>
        buckets.find((b) => dateIso >= b.fromIso && dateIso <= b.toIso) ?? null

      const identite = (poste: string) => {
        const w = wstByCode.get(poste)
        const stoloc = w?.stockLocation ?? ''
        return {
          posteLabel: detail.wstLabels.get(poste) ?? w?.description ?? poste,
          atelier: stoloc,
          atelierLabel: stoloc ? atelierLabel(stoloc) : '',
        }
      }

      const rows: ChargeExportRow[] = []
      const base = (
        poste: string,
        bucket: ExportBucket,
        seg: ChargeSegField,
        article: string,
        designation: string | null
      ): ChargeExportRow => ({
        poste,
        ...identite(poste),
        bucketKey: bucket.key,
        bucketLabel: bucket.label,
        fromIso: bucket.fromIso,
        toIso: bucket.toIso,
        seg,
        article,
        designation,
        numOf: null,
        statutLabel: null,
        dateBesoin: null,
        numCommande: null,
        ligne: null,
        client: null,
        pfArticle: null,
        depth: null,
        dateX3Iso: null,
        dateOverrideIso: null,
        qty: 0,
        hours: 0,
      })

      if (params.view === 'of') {
        const rowOf = (r: ChargeDetailOfRowT, bucket: ExportBucket): ChargeExportRow => ({
          ...base(r.poste, bucket, r.field, r.article, r.designation),
          numOf: r.numOf,
          statutLabel: r.statutLabel,
          dateBesoin: r.dateIso,
          qty: r.quantite,
          hours: r.hours,
        })
        for (const r of detail.ofRows) {
          if (!posteFilter.has(r.poste) || !fields.has(r.field)) continue
          const bucket = bucketOf(r.dateIso)
          if (!bucket) continue
          rows.push(rowOf(r, bucket))
        }
      } else {
        const rowOf = (r: ChargeDetailCmdRowT, bucket: ExportBucket): ChargeExportRow => ({
          ...base(r.poste, bucket, r.field, r.article, r.designation),
          numCommande: r.numCommande,
          ligne: r.ligne,
          client: r.client,
          pfArticle: r.pfArticle,
          depth: r.depth,
          dateX3Iso: r.dateX3Iso,
          dateOverrideIso: r.dateOverrideIso,
          qty:
            params.qtyMode === 'brut'
              ? r.brutQty
              : params.qtyMode === 'net'
                ? r.netQty
                : r.resteQty,
          hours:
            params.qtyMode === 'brut'
              ? r.brutHours
              : params.qtyMode === 'net'
                ? r.netHours
                : r.resteHours,
        })
        for (const r of detail.cmdRows) {
          if (!posteFilter.has(r.poste) || !fields.has(r.field)) continue
          const bucket = bucketOf(r.dateIso)
          if (!bucket) continue
          rows.push(rowOf(r, bucket))
        }
      }

      // Ordre de lecture : poste, puis période dans l'ordre affiché, puis charge
      // décroissante — le plus gros contributeur en tête de chaque bloc.
      const bucketOrder = new Map(buckets.map((b, i) => [b.key, i]))
      rows.sort(
        (a, b) =>
          a.poste.localeCompare(b.poste) ||
          (bucketOrder.get(a.bucketKey) ?? 0) - (bucketOrder.get(b.bucketKey) ?? 0) ||
          b.hours - a.hours ||
          a.article.localeCompare(b.article)
      )

      return {
        view: params.view,
        gran: params.gran,
        qtyMode: params.qtyMode,
        rows,
        x3Error: detail.x3Error,
      }
    }),
  })
}

/** Nom de fichier proposé au téléchargement — daté, sans caractère exotique. */
export function chargeExportFilename(data: ChargeExportData): string {
  const vue = data.view === 'of' ? 'of' : 'commandes'
  const maille = data.gran === 'month' ? 'mensuel' : 'hebdo'
  const stamp = isoDay(new Date())
  return `charge-${vue}-${maille}-${stamp}.csv`
}

/**
 * Rend le CSV complet : en-têtes français + lignes, au format attendu par Excel
 * FR (séparateur « ; », décimales à la virgule, BOM UTF-8). Les colonnes
 * diffèrent selon la vue — une ligne d'OF et une ligne de commande ne portent
 * pas la même information ; les mêler dans un schéma unique rempli de cases
 * vides rendrait le fichier illisible.
 */
export function chargeExportCsv(data: ChargeExportData): string {
  const isOf = data.view === 'of'
  const head = [
    'Poste',
    'Libellé poste',
    'Atelier',
    'Période',
    'Début',
    'Fin',
    'Segment',
    'Article',
    'Désignation',
    ...(isOf
      ? ['N° OF', 'Statut OF', 'Quantité', 'Heures', 'Date besoin']
      : [
          'N° commande',
          'Ligne',
          'Client',
          'Produit fini',
          'Profondeur',
          'Date X3',
          'Date appliquée',
          'Quantité',
          'Heures',
        ]),
  ]
  const body = data.rows.map((r) => [
    r.poste,
    r.posteLabel,
    r.atelierLabel || r.atelier,
    r.bucketLabel,
    csvDateFr(r.fromIso),
    csvDateFr(r.toIso),
    segLabelFr(data.view, r.seg),
    r.article,
    r.designation ?? '',
    ...(isOf
      ? [
          r.numOf ?? '',
          r.statutLabel ?? '',
          csvQty(r.qty),
          csvNumber(r.hours, 1),
          csvDateFr(r.dateBesoin),
        ]
      : [
          r.numCommande ?? '',
          r.ligne ?? '',
          r.client ?? '',
          r.pfArticle ?? '',
          r.depth ?? '',
          csvDateFr(r.dateX3Iso),
          csvDateFr(r.dateOverrideIso),
          csvQty(r.qty),
          csvNumber(r.hours, 1),
        ]),
  ])
  return toCsv([head, ...body])
}
