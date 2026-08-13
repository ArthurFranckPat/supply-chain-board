/**
 * Logique pure du séquenceur — partagée entre la page `/sequenceur` et ses
 * définitions de colonnes. Rien ici ne rend : types, prédicats, tris et
 * correspondances statut → habillage.
 *
 * Le découpage suit celui du Suivi (`lib/suivi/shared.ts` +
 * `reactive-columns.tsx`) : la page orchestre, le module dit le sens.
 */
import type { LucideIcon } from 'lucide-react'
import { CircleCheck, CircleHelp, FlaskConical, TriangleAlert } from 'lucide-react'

import type { EngagementRow, Urgency } from '@r/lib/board/engagement-format'
import { URGENCY_RANK, urgencyOf } from '@r/lib/board/engagement-format'
import type { FeasStatus, PosteNature, PosteNatureFilterKey } from '@r/lib/board/types'
import type { SortingState } from '@r/components/ui/data-table'

/* ── Types de la page ────────────────────────────────────────────────── */

export interface PosteSummary {
  code: string
  label: string
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
  atelier: string
  atelierLabel: string
  nature: PosteNature
}

export type SequenceurRow = EngagementRow & {
  posteCode: string
  posteLabel: string
  status?: number
  statusLabel?: string
}

export type FeasFilter = 'all' | 'ok' | 'qc' | 'blocked' | 'unknown'

/** Statuts WIPSTA X3 affichés — 1 ferme / 2 planifié / 3 suggéré. */
export type StatusKey = 1 | 2 | 3
export const ALL_STATUSES: StatusKey[] = [1, 2, 3]

export const ALL_POSTE_NATURES: PosteNatureFilterKey[] = ['assemblage_pf', 'assemble_sous_ensemble']

export const POSTE_NATURE_CHIPS: { k: PosteNatureFilterKey; label: string }[] = [
  { k: 'assemblage_pf', label: 'Assemblage PF' },
  { k: 'assemble_sous_ensemble', label: 'Sous-ensemble' },
]

export const STATUS_FILTER_CHIPS: { k: StatusKey; label: string }[] = [
  { k: 1, label: 'Ferme' },
  { k: 2, label: 'Planifié' },
  { k: 3, label: 'Suggéré' },
]

export const URGENCY_CHIPS: { k: Urgency | 'all'; label: string }[] = [
  { k: 'all', label: 'Toutes' },
  { k: 'overdue', label: 'En retard' },
  { k: 'week', label: 'Cette semaine' },
  { k: 'later', label: 'À venir' },
]

/* ── Statuts ─────────────────────────────────────────────────────────── */

/**
 * Statut WIPSTA → variante de `Badge`.
 *
 * Sous `.theme-cursor`, `--ferme` et `--planifie` valent le **même vert** : un
 * statut « planifié » peint en `planifie` serait strictement indiscernable d'un
 * « ferme ». Les trois statuts se distinguent donc par la nature du badge —
 * vert plein (réel, lancé), filet neutre (prévu), ambre (proposé par le CBN) —
 * et non par trois teintes dont le thème n'a que deux.
 */
export const STATUS_BADGE: Record<StatusKey, 'success' | 'outline' | 'warning'> = {
  1: 'success',
  2: 'outline',
  3: 'warning',
}

/** Même hiérarchie, en gravité de chip pour le panneau de filtres. */
export const STATUS_CHIP_TONE: Record<StatusKey, 'ok' | 'neutral' | 'warning'> = {
  1: 'ok',
  2: 'neutral',
  3: 'warning',
}

/** OF affermissable en un clic (planifié/suggéré) — les fermes sont déjà lancés. */
export function affirmable(status: number | undefined): boolean {
  return status === 2 || status === 3
}

/** Split charge affichée : ferme (WIPSTA 1) vs lançable (planifié/suggéré). */
export function splitChargeHours(rows: { hours: number; status?: number }[]): {
  ferme: number
  lancable: number
} {
  let ferme = 0
  let lancable = 0
  for (const r of rows) {
    if (r.status === 1) ferme += r.hours
    else if (affirmable(r.status)) lancable += r.hours
  }
  return {
    ferme: Math.round(ferme * 100) / 100,
    lancable: Math.round(lancable * 100) / 100,
  }
}

/* ── Faisabilité ─────────────────────────────────────────────────────── */

export interface FeasBadgeDesc {
  label: string
  variant: 'success' | 'outline' | 'warning' | 'destructive' | 'secondary'
  icon: LucideIcon
}

/**
 * Verdict matières → badge. « Lancé » (OF déjà ferme) et « Lançable » disent
 * deux choses différentes sur le même verdict `ok` : le premier est un constat,
 * le second une action disponible. Le vert reste au constat, le filet neutre
 * porte l'action — dans une colonne de 200 lignes, deux verts pleins auraient
 * fait un mur.
 */
export function feasBadge(
  st: FeasStatus['st'] | 'unknown' | undefined,
  ofStatus?: number
): FeasBadgeDesc {
  if (st === 'ok') {
    const launched = ofStatus === 1
    return launched
      ? { label: 'Lancé', variant: 'success', icon: CircleCheck }
      : { label: 'Lançable', variant: 'outline', icon: CircleCheck }
  }
  if (st === 'qc') return { label: 'Sous CQ', variant: 'warning', icon: FlaskConical }
  if (st === 'blocked') return { label: 'Bloqué', variant: 'destructive', icon: TriangleAlert }
  return { label: 'N/D', variant: 'secondary', icon: CircleHelp }
}

/** Rang faisabilité pour le tri colonne (aligné sur le tri défaut post-calcul). */
export function feasRank(st: FeasStatus['st'] | undefined): number {
  if (st === 'ok') return 0
  if (st === 'qc') return 1
  if (st === 'blocked') return 2
  return 3
}

/** Le verdict de la ligne satisfait-il le filtre faisabilité ? */
export function feasOk(
  row: SequenceurRow,
  filter: FeasFilter,
  feasibility: Record<string, FeasStatus>
): boolean {
  if (filter === 'all') return true
  const st = feasibility[row.numOf]?.st
  if (filter === 'unknown') return !st
  return st === filter
}

/* ── Prédicats de filtrage ───────────────────────────────────────────── */

export function natureOk(
  nature: PosteNature | undefined,
  filter: Set<PosteNatureFilterKey>
): boolean {
  const n = nature ?? 'autre'
  if (n === 'autre') {
    return filter.has('assemblage_pf') && filter.has('assemble_sous_ensemble')
  }
  return filter.has(n)
}

/** Recherche libre : OF, article, désignation, poste, statut, commandes, clients. */
export function matchQuery(row: SequenceurRow, q: string): boolean {
  if (!q) return true
  const haystack = [
    row.numOf,
    row.article,
    row.designation ?? '',
    row.posteCode,
    row.statusLabel ?? '',
    ...row.commandes.flatMap((c) => [c.numCommande, c.client ?? '']),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

/* ── Tris ────────────────────────────────────────────────────────────── */

/**
 * Tri colonne utilisateur — cycle asc → desc → off porté par le `DataTable`.
 * Appliqué uniquement quand `sorting` est non vide ; sinon le tri métier défaut
 * (faisabilité → poste → urgence → livraison) reste en place.
 */
export function sortSequenceurRows(
  rows: SequenceurRow[],
  sorting: SortingState[],
  feasibility: Record<string, FeasStatus>
): SequenceurRow[] {
  if (sorting.length === 0) return rows
  const { id, desc } = sorting[0]
  const sorted = [...rows]
  sorted.sort((a, b) => {
    let cmp = 0
    switch (id) {
      case 'poste':
        cmp = a.posteCode.localeCompare(b.posteCode)
        break
      case 'numOf':
        cmp = a.numOf.localeCompare(b.numOf)
        break
      case 'status':
        cmp = (a.status ?? 0) - (b.status ?? 0)
        break
      case 'article':
        cmp =
          a.article.localeCompare(b.article) ||
          (a.designation ?? '').localeCompare(b.designation ?? '', 'fr')
        break
      case 'avancement': {
        const av = (r: SequenceurRow) => (r.launched > 0 ? r.done / r.launched : -1)
        cmp = av(a) - av(b)
        break
      }
      case 'faisabilite':
        cmp = feasRank(feasibility[a.numOf]?.st) - feasRank(feasibility[b.numOf]?.st)
        break
      case 'commande': {
        const cmd = (r: SequenceurRow) => r.commandes[0]?.numCommande ?? ''
        cmp = cmd(a).localeCompare(cmd(b))
        break
      }
      case 'livraison': {
        const da = a.livraisonIso ?? '9999-12-31'
        const db = b.livraisonIso ?? '9999-12-31'
        cmp = da.localeCompare(db)
        break
      }
      case 'heures':
        cmp = a.hours - b.hours
        break
      default:
        return 0
    }
    if (cmp !== 0) return desc ? -cmp : cmp
    return a.numOf.localeCompare(b.numOf)
  })
  return sorted
}

/**
 * Tri métier par défaut — celui qui décide de l'ordre de lancement :
 * faisabilité (une fois calculée) → poste → urgence de livraison → date.
 */
export function sortBusinessDefault(
  rows: SequenceurRow[],
  opts: {
    feasDone: boolean
    feasibility: Record<string, FeasStatus>
    /** Vue tous postes : l'ordre des postes du serveur prime sur l'urgence. */
    posteRank: Map<string, number> | null
    /** Poste filtré : les OF sans commande passent en fin de liste. */
    demoteSansCommande: boolean
  }
): SequenceurRow[] {
  return [...rows].sort((a, b) => {
    if (opts.feasDone) {
      const ra = feasRank(opts.feasibility[a.numOf]?.st)
      const rb = feasRank(opts.feasibility[b.numOf]?.st)
      if (ra !== rb) return ra - rb
    }
    if (opts.posteRank) {
      const ra = opts.posteRank.get(a.posteCode) ?? Infinity
      const rb = opts.posteRank.get(b.posteCode) ?? Infinity
      if (ra !== rb) return ra - rb
    }
    if (opts.demoteSansCommande) {
      const aNoCmd = a.commandes.length === 0
      const bNoCmd = b.commandes.length === 0
      if (aNoCmd !== bNoCmd) return aNoCmd ? 1 : -1
    }
    const ua = urgencyOf(a.livraisonIso)
    const ub = urgencyOf(b.livraisonIso)
    if (URGENCY_RANK[ua] !== URGENCY_RANK[ub]) return URGENCY_RANK[ua] - URGENCY_RANK[ub]
    if (!a.livraisonIso && !b.livraisonIso) return a.numOf.localeCompare(b.numOf)
    if (!a.livraisonIso) return 1
    if (!b.livraisonIso) return -1
    return a.livraisonIso.localeCompare(b.livraisonIso) || a.numOf.localeCompare(b.numOf)
  })
}
