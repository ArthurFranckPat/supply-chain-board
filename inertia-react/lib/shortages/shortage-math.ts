/**
 * Dérivations pures + constantes de rendu du suivi des ruptures (issue #52 —
 * extrait de components/shortages/shortage-table.tsx). Sans Solid, sans JSX :
 * prédicats verdict, agrégation « dégâts par composant » (R2), position
 * temporelle de la frise (R3), classes de cellule partagées (R1+R2) — alignées
 * sur le modèle /suivi proactif (colonnes sans filet vertical, verdict en
 * point + texte plutôt qu'en pastille pleine).
 */
import type { ShortageDisplayRow } from '@r/lib/shortages/types'

// ---------------------------------------------------------------------------
// Classes de cellule (partagées Registre R1 + Par composant R2)
// ---------------------------------------------------------------------------

export const TH =
  'px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule'
export const TH_R = TH.replace('text-left', 'text-right')
export const TD = 'px-4 py-[7px] align-middle'

// ---------------------------------------------------------------------------
// Prédicats verdict
// ---------------------------------------------------------------------------

/** True si la ligne traduit un risque grave (sans couverture, ou retard client réel).
 *  Pilote le fond de ligne rouge + la bordure gauche — l'unique signal « alerte forte ». */
export const isLate = (r: ShortageDisplayRow) =>
  r.verdictKey === 'retard' || r.verdictKey === 'sans_couverture'
/** True si la ligne est une tension logistique (réception entre besoin et expé).
 *  Sert uniquement au marqueur + gap de la frise (R3) — le Registre porte le signal
 *  par le badge verdict seul, sans teinte de ligne. */
export const isAtRisk = (r: ShortageDisplayRow) => r.verdictKey === 'a_risque'

// ---------------------------------------------------------------------------
// R2 · Agrégation « quel composant fait le plus de dégâts ? »
// ---------------------------------------------------------------------------

export interface ComponentGroup {
  component: string
  componentDesc: string
  totalManquant: number
  /** Lignes sources (une par OF bloqué), déjà triées par urgence. */
  lines: ShortageDisplayRow[]
  nbSansCouverture: number
  /** Pire verdict du groupe (sans_couverture > retard > couvert). */
  worstVerdict: ShortageDisplayRow['verdictKey']
  /** Ligne la plus urgente AVEC commande (première du tri parent) — null si toutes orphelines. */
  urgent: ShortageDisplayRow | null
}

export const VERDICT_RANK: Record<ShortageDisplayRow['verdictKey'], number> = {
  sans_couverture: 4,
  sous_ensemble: 3,
  retard: 2,
  a_risque: 1,
  couvert: 0,
}

/** Libellé verdict (Registre R1 + Par composant R2). */
export const VERDICT_LABEL: Record<ShortageDisplayRow['verdictKey'], string> = {
  couvert: 'Couvert',
  a_risque: 'À risque',
  retard: 'Retard',
  sous_ensemble: 'S/E à lancer',
  sans_couverture: 'Sans couv.',
}

/** Dot verdict (mode compact, même convention que /suivi proactif) — couleur pleine, pas de fond. */
export const VERDICT_DOT: Record<ShortageDisplayRow['verdictKey'], string> = {
  couvert: 'bg-ferme',
  a_risque: 'bg-suggere',
  retard: 'bg-destructive',
  sous_ensemble: 'bg-planifie',
  sans_couverture: 'bg-destructive',
}

/** Texte verdict (mode compact, même convention que /suivi proactif) — couleur seule, pas de pill. */
export const VERDICT_TEXT: Record<ShortageDisplayRow['verdictKey'], string> = {
  couvert: 'text-ferme',
  a_risque: 'text-suggere',
  retard: 'text-destructive',
  sous_ensemble: 'text-planifie',
  sans_couverture: 'text-destructive',
}

/** Barre latérale gauche (index column) — même convention que /suivi (LATE_TONE.bar). */
export const VERDICT_BAR: Record<ShortageDisplayRow['verdictKey'], string> = {
  couvert: '',
  a_risque: '[box-shadow:inset_3px_0_var(--color-suggere)]',
  sous_ensemble: '[box-shadow:inset_3px_0_var(--color-planifie)]',
  retard: '[box-shadow:inset_3px_0_var(--color-destructive)]',
  sans_couverture: '[box-shadow:inset_3px_0_var(--color-destructive)]',
}

/** Agrège les lignes par composant. `rows` arrive trié par urgence (expé asc) du parent. */
export const groupByComponent = (rows: ShortageDisplayRow[]): ComponentGroup[] => {
  const map = new Map<string, ComponentGroup>()
  for (const r of rows) {
    let g = map.get(r.component)
    if (!g) {
      g = {
        component: r.component,
        componentDesc: r.componentDesc,
        totalManquant: 0,
        lines: [],
        nbSansCouverture: 0,
        worstVerdict: 'couvert',
        urgent: null,
      }
      map.set(r.component, g)
    }
    g.lines.push(r)
    g.totalManquant += r.qteManquanteNum
    if (r.verdictKey === 'sans_couverture') g.nbSansCouverture++
    if (VERDICT_RANK[r.verdictKey] > VERDICT_RANK[g.worstVerdict]) g.worstVerdict = r.verdictKey
    if (!g.urgent && r.hasCommande) g.urgent = r
  }
  // « Dégâts » : nb d'OF bloqués desc, puis qté totale manquante desc.
  return [...map.values()].sort(
    (a, b) => b.lines.length - a.lines.length || b.totalManquant - a.totalManquant
  )
}

// ---------------------------------------------------------------------------
// R3 · Frise temporelle — positionnement
// ---------------------------------------------------------------------------

/** Position en % d'une date ISO dans la fenêtre [start, start+horizon j], clampée 0..100. */
export const offsetPct = (iso: string | null, startIso: string, horizon: number): number | null => {
  if (!iso) return null
  const a = Date.parse(`${startIso}T00:00:00Z`)
  const b = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || horizon <= 0) return null
  const days = (b - a) / 86_400_000
  return Math.max(0, Math.min(100, (days / horizon) * 100))
}
