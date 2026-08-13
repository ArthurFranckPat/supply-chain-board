/**
 * Dérivations pures du suivi des ruptures (issue #52 — extrait de
 * components/shortages/shortage-table.tsx). Sans Solid, sans JSX : prédicats
 * verdict et agrégation « dégâts par composant » (R2).
 *
 * Les classes de cellule ont vécu ici (TH / TH_R / TD) : elles disaient la même
 * chose que la table proactive de /suivi, à un padding près. Elles vivent
 * maintenant dans `ui/table-row`, appliquées d'office par le DataTable.
 */
import {
  CircleCheck,
  CircleSlash,
  Clock,
  CornerDownRight,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import type { RowTone } from '@r/components/ui/table-row'
import type { RuptureDisplayRow } from '@r/lib/ruptures/types'

// ---------------------------------------------------------------------------
// Prédicats verdict
// ---------------------------------------------------------------------------

/** True si la ligne traduit un risque grave (sans couverture, ou retard client réel).
 *  Pilote le fond de ligne rouge + la bordure gauche — l'unique signal « alerte forte ». */
export const isLate = (r: RuptureDisplayRow) =>
  r.verdictKey === 'retard' || r.verdictKey === 'sans_couverture'

// ---------------------------------------------------------------------------
// R2 · Agrégation « quel composant fait le plus de dégâts ? »
// ---------------------------------------------------------------------------

export interface ComponentGroup {
  component: string
  componentDesc: string
  totalManquant: number
  /** Lignes sources (une par OF bloqué), déjà triées par urgence. */
  lines: RuptureDisplayRow[]
  nbSansCouverture: number
  /** Pire verdict du groupe (sans_couverture > retard > couvert). */
  worstVerdict: RuptureDisplayRow['verdictKey']
  /** Ligne la plus urgente AVEC commande (première du tri parent) — null si toutes orphelines. */
  urgent: RuptureDisplayRow | null
}

export const VERDICT_RANK: Record<RuptureDisplayRow['verdictKey'], number> = {
  sans_couverture: 4,
  sous_ensemble: 3,
  retard: 2,
  a_risque: 1,
  couvert: 0,
}

/** Libellé verdict (Registre R1 + Par composant R2). */
export const VERDICT_LABEL: Record<RuptureDisplayRow['verdictKey'], string> = {
  couvert: 'Couvert',
  a_risque: 'À risque',
  retard: 'Retard',
  sous_ensemble: 'S/E à lancer',
  sans_couverture: 'Sans couv.',
}

/**
 * Gravité d'un verdict, déclinée dans les trois habillages du produit.
 *
 * Une seule table pour les trois : c'est la condition pour qu'un verdict ait la
 * même couleur partout. La migration vers le design system avait recopié un
 * `VERDICT_BADGE_VARIANT` dans chacun des deux composants, avec `sous_ensemble`
 * en gris — le même verdict portait alors trois couleurs sur une seule ligne
 * (chip ambre dans le panneau, badge gris dans la table, barre `planifie` à
 * gauche). Ajouter un habillage, c'est ajouter une colonne ICI.
 *
 *  • `icon` : la FORME du verdict (standard §15 — elle porte le sens, la
 *    couleur ne fait que la doubler). Alignée sur l'alphabet de /suivi
 *    proactif : une horloge est un retard sur les deux pages, un cercle barré
 *    une absence de couverture. Deux formes différentes pour un même sens
 *    seraient deux alphabets à apprendre.
 *  • `text` : encre de l'icône et du libellé.
 *  • `chip` : gravité de `ToolbarFilterChip` (panneau de filtres).
 *  • `tone` : gravité de rangée — rendue par `severityBarClass` du standard.
 *    La barre était écrite ici en `box-shadow` littéral, soit une SECONDE
 *    source pour la barre latérale (et sur `var(--color-destructive)` quand le
 *    standard utilise `var(--destructive)`). Il n'en reste qu'une.
 *
 * Réserve assumée : `sous_ensemble` est peint en `planifie`, une encre qui n'a
 * pas de contrepartie dans les gravités de chip — sa chip reste un point gris,
 * c'est la barre latérale et l'icône qui portent son identité. Le jour où le
 * produit veut une gravité « à lancer » de plein droit, elle s'ajoute à la
 * palette des chips, pas ici.
 */
export const VERDICT_TONE: Record<
  RuptureDisplayRow['verdictKey'],
  {
    icon: LucideIcon
    text: string
    chip: 'ok' | 'warning' | 'critical' | 'neutral'
    tone: RowTone
  }
> = {
  couvert: { icon: CircleCheck, text: 'text-ferme', chip: 'ok', tone: null },
  a_risque: { icon: TriangleAlert, text: 'text-suggere', chip: 'warning', tone: 'warning' },
  // Un sous-ensemble à lancer est une action à mener, pas une alerte : la
  // flèche descendante dit « il y a un cran en dessous », comme sur /suivi.
  sous_ensemble: { icon: CornerDownRight, text: 'text-planifie', chip: 'neutral', tone: 'info' },
  retard: { icon: Clock, text: 'text-destructive', chip: 'critical', tone: 'critical' },
  sans_couverture: {
    icon: CircleSlash,
    text: 'text-destructive',
    chip: 'critical',
    tone: 'critical',
  },
}

/** Agrège les lignes par composant. `rows` arrive trié par urgence (expé asc) du parent. */
export const groupByComponent = (rows: RuptureDisplayRow[]): ComponentGroup[] => {
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
