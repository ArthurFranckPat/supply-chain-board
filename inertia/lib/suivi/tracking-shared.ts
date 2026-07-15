/**
 * Dérivations pures + constantes partagées entre la vue réactive et la vue
 * proactive de la page Suivi (issue #52 — extrait de scheduler/tracking.tsx).
 */
import type {
  SuiviRowsResponse,
  SuiviStatusKey,
  ProactiveRowsResponse,
  ProactiveVerdictKey,
  SuiviDisplayRow,
} from '@/lib/suivi/types'

export const EMPTY: SuiviRowsResponse = {
  total: 0,
  statusCounts: { A_EXPEDIER: 0, ALLOCATION_A_FAIRE: 0, RETARD_PROD: 0, RAS: 0 },
  cqCount: 0,
  ateliers: [],
  rows: [],
  x3Error: null,
  referenceDate: '',
}

export const PROACTIVE_EMPTY: ProactiveRowsResponse = {
  total: 0,
  verdictCounts: { time: 0, stock: 0, late: 0, blocked: 0, uncov: 0, risk: 0 },
  ateliers: [],
  rows: [],
  x3Error: null,
  referenceDate: '',
}

/** Couleur du badge par statut (grammar uniforme ui/badge — un seul shape). */
export const BADGE_TONE: Record<SuiviStatusKey, string> = {
  exp: 'bg-ferme/15 text-ferme',
  alc: 'bg-suggere/15 text-suggere',
  ret: 'bg-destructive/10 text-destructive',
  ras: 'bg-secondary text-muted-foreground',
}

/**
 * Statut X3 d'un OF (WIPSTA / statutNum) → tag court WOF/WOP/WOS + couleur.
 *  - 1 = Ferme     → WOF (Work Order Firm)
 *  - 2 = Planifié  → WOP (Work Order Planned)
 *  - 3 = Suggéré   → WOS (Work Order Suggested)
 */
export const OF_STATUT: Record<number, { tag: string; tone: string }> = {
  1: { tag: 'WOF', tone: 'bg-ferme/15 text-ferme' },
  2: { tag: 'WOP', tone: 'bg-planifie/15 text-planifie' },
  3: { tag: 'WOS', tone: 'bg-suggere/15 text-suggere' },
}

/**
 * Couleur du badge verdict (vue proactive). `late` (retard déjà constaté, calcul de date)
 * et `risk` (préventif : OF pas démarré, échéance proche, date encore bonne) étaient
 * confondus sous le même ambre `suggere` — 2 sémantiques différentes rendues identiques.
 * `risk` utilise désormais `planifie` (bleu, déjà porté par le tag WOP) pour les distinguer.
 */
export const VERDICT_TONE: Record<ProactiveVerdictKey, string> = {
  time: 'bg-ferme/15 text-ferme',
  stock: 'bg-ferme/15 text-ferme',
  late: 'bg-suggere/15 text-suggere',
  blocked: 'bg-destructive/10 text-destructive',
  uncov: 'bg-destructive/10 text-destructive',
  risk: 'bg-planifie/15 text-planifie',
}

/**
 * Teinte du background de ligne quand la commande est en retard.
 *
 * Principe : NEUTRE par défaut, couleur UNIQUEMENT sur retard. Sinon la moitié
 * du tableau (lignes en retard) se retrouve colorée et la hiérarchie s'effondre
 * — la tolérance doit trancher sur du neutre pour être visible.
 *
 *  - 'tolerance' (≤ 1 jour ouvré) : orange doux (12%) + barre ambre
 *  - 'critical' (au-delà)         : rouge doux  (10%) + barre rouge
 *  - null (pas en retard)         : neutre + hover
 *
 * Opacités volontairement faibles (10-12%) : la couleur signale, le contraste
 * avec le neutre fait le travail. Inutile de saturer — la barre latérale porte
 * la moitié du signal.
 *
 * `bg()`  → background de ligne (getRowClass)
 * `bar()` → barre latérale gauche (index column tdClass)
 */
export const LATE_TONE = {
  bg: (s: 'tolerance' | 'critical' | null) => 'hover:bg-foreground/[0.07]',
  bar: (s: 'tolerance' | 'critical' | null) =>
    s === 'critical'
      ? '[box-shadow:inset_3px_0_#dc2626]'
      : s === 'tolerance'
        ? '[box-shadow:inset_3px_0_#f59e0b]'
        : '',
}

export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

/** Calcule le libellé temporel relatif d'une date d'expédition par rapport à la date de référence. */
export function getRelativeDateLabel(
  dateExpIso: string | null,
  referenceDateStr: string
): { label: string; tone: string } | null {
  if (!dateExpIso || !referenceDateStr) return null
  try {
    const refDate = new Date(referenceDateStr + 'T00:00:00')
    const expDate = new Date(dateExpIso + 'T00:00:00')
    if (isNaN(refDate.getTime()) || isNaN(expDate.getTime())) return null
    const diffTime = expDate.getTime() - refDate.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return {
        label: "Aujourd'hui",
        tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      }
    } else if (diffDays === 1) {
      return { label: 'Demain', tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' }
    } else if (diffDays === -1) {
      return { label: 'Hier', tone: 'bg-destructive/10 text-destructive' }
    } else if (diffDays < -1) {
      return { label: `Retard ${diffDays} j`, tone: 'bg-destructive/10 text-destructive font-bold' }
    } else {
      return { label: `J+${diffDays}`, tone: 'bg-secondary text-muted-foreground' }
    }
  } catch (e) {
    return null
  }
}

/** Clé stable d'une ligne pour le fold/unfold des emplacements (résiste au tri). */
export const empKey = (r: SuiviDisplayRow) => `${r.numCommande}::${r.article}`

export interface SortingLike {
  id: string
  desc: boolean
}

/** Tri manuel partagé réactif/proactif (TanStack Table ne tracke pas les signaux extérieurs). */
export function sortRows<T extends { numCommande: string; dateExpIso: string | null }>(
  rows: T[],
  sorting: SortingLike[]
): T[] {
  if (sorting.length === 0) return rows
  const { id, desc } = sorting[0]
  const sorted = [...rows]
  sorted.sort((a, b) => {
    let va: string | number
    let vb: string | number
    switch (id) {
      case 'numCommande':
        va = a.numCommande
        vb = b.numCommande
        break
      case 'article':
        va = (a as any).article
        vb = (b as any).article
        break
      case 'type':
        va = (a as any).type
        vb = (b as any).type
        break
      case 'qteRestante':
        va = (a as any).qteRestante
        vb = (b as any).qteRestante
        break
      case 'dateExp':
        va = a.dateExpIso ?? '9999-12-31'
        vb = b.dateExpIso ?? '9999-12-31'
        break
      case 'couverture':
        va = (a as any).couverture
        vb = (b as any).couverture
        break
      case 'joursRetard':
        va = (a as any).joursRetard
        vb = (b as any).joursRetard
        break
      default:
        return 0
    }
    let cmp = 0
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va < vb ? -1 : va > vb ? 1 : 0
    } else {
      cmp = String(va).localeCompare(String(vb))
    }
    if (cmp !== 0) return cmp
    // Tiebreak identique à l'ancien tri manuel.
    return a.numCommande.localeCompare(b.numCommande)
  })
  return desc ? sorted.reverse() : sorted
}
