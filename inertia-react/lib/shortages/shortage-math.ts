/**
 * Dérivations pures + constantes de rendu du suivi des ruptures (issue #52 —
 * extrait de components/shortages/shortage-table.tsx). Sans Solid, sans JSX :
 * prédicats verdict, agrégation « dégâts par composant » (R2), position
 * temporelle de la frise (R3), classes de cellule Papier partagées (R1+R2).
 */
import type { ShortageDisplayRow } from '@r/lib/shortages/types'

// ---------------------------------------------------------------------------
// Classes de cellule « Papier » (partagées Registre R1 + Par composant R2)
// ---------------------------------------------------------------------------

export const TH =
  'px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft'
export const TH_R = TH.replace('text-left', 'text-right')
export const TD = 'px-4 py-[13px] align-middle border-r border-rule-soft'

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

/**
 * Marque de couverture de la vue « Par composant » (pire verdict du groupe).
 *
 * Grammaire du Suivi proactif (VERDICT_DOT + VERDICT_TEXT de lib/suivi/tracking-shared) :
 * pastille pleine + libellé coloré, JAMAIS de pill à fond teinté. Le fond coloré est
 * réservé au signal « ligne en retard » ; deux fonds teintés dans la même ligne et la
 * hiérarchie s'effondre. Teintes du design system, miroir du VERDICT_PRESET serveur.
 */
export const VERDICT_MARK: Record<
  ShortageDisplayRow['verdictKey'],
  { dot: string; text: string; label: string }
> = {
  couvert: { dot: 'bg-ferme', text: 'text-ferme', label: 'Couvert' },
  a_risque: { dot: 'bg-suggere', text: 'text-suggere', label: 'À risque' },
  retard: { dot: 'bg-destructive', text: 'text-destructive', label: 'Retard' },
  sous_ensemble: { dot: 'bg-planifie', text: 'text-planifie', label: 'S/E à lancer' },
  sans_couverture: { dot: 'bg-destructive', text: 'text-destructive', label: 'Sans couv.' },
}

/**
 * Gravité d'un verdict rupture, dans le vocabulaire du Suivi proactif
 * (`lateSeverity` → LATE_TONE.bar/bg) : c'est ce qui pilote la barre latérale
 * de la colonne N°. `sans_couverture` / `retard` = rouge, `a_risque` = ambre,
 * le reste ne porte aucune teinte.
 */
export const verdictSeverity = (
  v: ShortageDisplayRow['verdictKey']
): 'tolerance' | 'critical' | null =>
  v === 'retard' || v === 'sans_couverture' ? 'critical' : v === 'a_risque' ? 'tolerance' : null

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
