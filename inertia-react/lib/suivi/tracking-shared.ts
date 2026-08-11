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
} from '@r/lib/suivi/types'

/**
 * Clé d'identité d'une ligne de Suivi — SOURCE UNIQUE.
 *
 * Sert à la fois de clé React (DataTable) et de cible du surlignage de sélection : les deux
 * DOIVENT être calculées ici. Historiquement les vues construisaient 3 segments et la page n'en
 * comparait que 2 (`numCommande::article`), donc `getRowKey(row) === selectedRowKey` n'était
 * jamais vrai et la ligne cliquée ne s'allumait jamais.
 */
export function suiviRowKey(row: {
  numCommande: string
  article: string
  dateExpIso: string | null
  dateExp: string
}): string {
  return `${row.numCommande}::${row.article}::${row.dateExpIso ?? row.dateExp}`
}

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
  bomIndex: {},
  x3Error: null,
  referenceDate: '',
}

/* BADGE_TONE / VERDICT_TONE (fonds pastel des anciens badges statut et verdict)
   ont été retirés : le rendu compact ne pose plus qu'un point coloré et un
   libellé, les deux tables étaient importées sans être lues. */

/** Dot statut réactif (mode compact). */
export const BADGE_DOT: Record<SuiviStatusKey, string> = {
  exp: 'bg-ferme',
  alc: 'bg-suggere',
  ret: 'bg-destructive',
  ras: 'bg-muted-foreground/40',
}

/** Texte statut réactif (mode compact). */
export const BADGE_TEXT: Record<SuiviStatusKey, string> = {
  exp: 'text-ferme',
  alc: 'text-suggere',
  ret: 'text-destructive',
  ras: 'text-muted-foreground',
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
 * Dot verdict (mode compact) — couleur pleine, pas de fond.
 *
 * `late` (retard déjà constaté) et `risk` (préventif : OF pas démarré, échéance
 * proche, date encore bonne) étaient confondus sous le même ambre : deux
 * sémantiques rendues identiques. `risk` prend `planifie`, déjà porté par le
 * tag WOP.
 */
export const VERDICT_DOT: Record<ProactiveVerdictKey, string> = {
  time: 'bg-ferme',
  stock: 'bg-ferme',
  late: 'bg-suggere',
  blocked: 'bg-destructive',
  uncov: 'bg-destructive',
  risk: 'bg-planifie',
}

/** Texte verdict (mode compact) — couleur seule, pas de pill. */
export const VERDICT_TEXT: Record<ProactiveVerdictKey, string> = {
  time: 'text-ferme',
  stock: 'text-ferme',
  late: 'text-suggere',
  blocked: 'text-destructive',
  uncov: 'text-destructive',
  risk: 'text-planifie',
}

/**
 * Gravité du retard d'une ligne — barre latérale 3 px sur la colonne d'index.
 *
 *  - 'critical'  : rouge destructive
 *  - 'tolerance' : ambre suggere (≤ 1 jour ouvré)
 *  - null        : rien
 *
 * UN seul signal, et il tient dans 3 px. Les fonds de ligne teintés (10-12 %)
 * d'origine coloraient la moitié du tableau — sur un écran où le retard est la
 * norme, une couleur partout n'est plus un signal. Le `bg()` qui les portait a
 * été vidé de son contenu sans être retiré : il ne rendait plus que le hover et
 * plus personne ne l'appelait, mais son commentaire décrivait encore des fonds
 * disparus. Ne pas le réintroduire : le hover appartient au DataTable.
 */
export const LATE_TONE = {
  bar: (s: 'tolerance' | 'critical' | null) =>
    s === 'critical'
      ? '[box-shadow:inset_3px_0_var(--destructive)]' // destructive grammaire
      : s === 'tolerance'
        ? '[box-shadow:inset_3px_0_var(--suggere)]' // suggere grammaire
        : '',
}

/**
 * Catalogue des colonnes par vue — pilote le menu « Colonnes » (visibilité)
 * et le filtrage des colonnes rendues. `locked` = non masquable (l'identité
 * de ligne reste toujours affichée). Les ids doivent matcher `columnId()`
 * des ColumnDef (id ?? accessorKey) de proactive/reactive-columns.
 */
export interface SuiviColumnMeta {
  id: string
  label: string
  locked?: boolean
}

export const PROACTIVE_COLUMNS: SuiviColumnMeta[] = [
  { id: 'numCommande', label: 'Commande · Client', locked: true },
  { id: 'article', label: 'Article · Désignation' },
  { id: 'type', label: 'Type' },
  { id: 'poste', label: 'Poste' },
  { id: 'qteRestante', label: 'Qté' },
  { id: 'dateExp', label: 'Expé' },
  { id: 'couverture', label: 'Couverture' },
  { id: 'verdictKey', label: 'Verdict' },
  { id: 'chargeHeures', label: 'Charge' },
  { id: 'composants', label: 'Composants en rupture' },
]

export const REACTIVE_COLUMNS: SuiviColumnMeta[] = [
  { id: 'numCommande', label: 'Commande · Client', locked: true },
  { id: 'article', label: 'Article · Désignation' },
  { id: 'type', label: 'Type' },
  { id: 'poste', label: 'Poste' },
  { id: 'qteRestante', label: 'Qté' },
  { id: 'dateExp', label: 'Expé' },
  { id: 'emplacements', label: 'Emplacement' },
  { id: 'statusKey', label: 'Statut' },
  { id: 'cause', label: 'Cause du retard' },
]

export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

/**
 * Libellé temporel relatif d'une date d'expédition par rapport à la date de
 * référence. Ne rend que le libellé : la teinte est décidée par la colonne qui
 * l'affiche (les deux vues la recalculaient déjà, le `tone` rendu ici n'était lu
 * nulle part).
 */
export function getRelativeDateLabel(
  dateExpIso: string | null,
  referenceDateStr: string
): { label: string } | null {
  if (!dateExpIso || !referenceDateStr) return null
  try {
    const refDate = new Date(referenceDateStr + 'T00:00:00')
    const expDate = new Date(dateExpIso + 'T00:00:00')
    if (Number.isNaN(refDate.getTime()) || Number.isNaN(expDate.getTime())) return null
    const diffTime = expDate.getTime() - refDate.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return { label: "Aujourd'hui" }
    if (diffDays === 1) return { label: 'Demain' }
    if (diffDays === -1) return { label: 'Hier' }
    if (diffDays < -1) return { label: `Retard ${diffDays} j` }
    return { label: `J+${diffDays}` }
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
