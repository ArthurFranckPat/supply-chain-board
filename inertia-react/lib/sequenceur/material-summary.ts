/**
 * Synthèse matières du séquenceur — types + fetch de `POST /material-summary`.
 *
 * Le périmètre est envoyé par le client : les filtres poste / atelier / statut / dates
 * du séquenceur ne vivent que côté front, le serveur ne peut pas les déduire. On lui
 * passe donc la liste exacte des OF affichés, avec leur date de début (= date à laquelle
 * la matière doit être en stock). Il ne garde que ceux jugés non faisables.
 */
import { route } from '@r/lib/routes'
import type { FeasibilityMode } from '@r/lib/board/types'

export type MaterialVerdict = 'couvert' | 'retard' | 'sans_couverture'

export interface MaterialSummaryReception {
  id: string
  supplier: string
  qty: number
  dateIso: string
  qteCumulee: number
  /** Attendue dans le passé, toujours pas reçue — la date annoncée n'est plus crédible. */
  enRetard: boolean
}

export interface MaterialSummaryOf {
  numOf: string
  article: string
  designation: string | null
  qteManquante: number
  besoinIso: string | null
}

export interface MaterialSummaryRow {
  component: string
  componentDesc: string
  qteManquante: number
  besoinIso: string | null
  ofs: MaterialSummaryOf[]
  receptions: MaterialSummaryReception[]
  qteAttendue: number
  fournisseur: string
  dateCouvertureIso: string | null
  verdict: MaterialVerdict
  joursRetard: number
  delaiAppro: number | null
}

export interface MaterialSummaryStats {
  nbComposants: number
  nbOfBloques: number
  nbSansCouverture: number
  nbRetard: number
  /** OF bloqués uniquement par des composants FABRIQUÉS — hors périmètre v1 (achats). */
  nbOfHorsPerimetre: number
}

export interface MaterialSummaryResponse {
  rows: MaterialSummaryRow[]
  stats: MaterialSummaryStats
  x3Error: string | null
}

export const VERDICT_PRESET: Record<MaterialVerdict, { label: string; cls: string }> = {
  // Même sémantique de teintes que /ruptures : rouge plein = impasse (rien en commande),
  // rouge léger = en route mais trop tard, gris effacé = rien à faire ici.
  sans_couverture: { label: 'Rien en commande', cls: 'text-destructive bg-destructive/20' },
  retard: { label: 'Arrive trop tard', cls: 'text-destructive bg-destructive/10' },
  couvert: { label: 'Couvert à temps', cls: 'text-ferme bg-ferme/10' },
}

/** ISO yyyy-MM-dd → JJ/MM/AA. '—' si absente (jamais d'ISO brut à l'écran). */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}

/** Qté : entier si rond, sinon 2 décimales, virgule française. */
export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',')
}

export async function fetchMaterialSummary(opts: {
  from: string
  to: string
  mode: FeasibilityMode
  workstation?: string
  ofs: { numOf: string; besoinIso: string | null }[]
  /** true = inclure aussi les sous-ensembles fabriqués. Défaut : composants achetés seuls. */
  includeManufactured?: boolean
  signal?: AbortSignal
}): Promise<MaterialSummaryResponse> {
  const body: Record<string, unknown> = {
    from: opts.from,
    to: opts.to,
    mode: opts.mode,
    ofs: opts.ofs,
  }
  if (opts.workstation) body.workstation = opts.workstation.toLowerCase()
  if (opts.includeManufactured) body.includeManufactured = true

  const res = await fetch(route('planning_board.material_summary'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as MaterialSummaryResponse
}
