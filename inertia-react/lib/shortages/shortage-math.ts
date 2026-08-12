/**
 * Dérivations pures + constantes de rendu du suivi des ruptures (issue #52 —
 * extrait de components/shortages/shortage-table.tsx). Sans Solid, sans JSX :
 * prédicats verdict, agrégation « dégâts par composant » (R2), classes de
 * cellule partagées (R1+R2) — alignées sur le modèle /suivi proactif
 * (colonnes sans filet vertical, verdict en point + texte plutôt qu'en
 * pastille pleine).
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
 *  • `badge` : variante de `Badge` (table).
 *  • `chip`  : gravité de `ToolbarFilterChip` (panneau de filtres).
 *  • `bar`   : barre latérale de la colonne d'index.
 *
 * Réserve assumée : `sous_ensemble` est peint en `planifie`, une encre qui n'a
 * de contrepartie ni dans les variantes de `Badge` ni dans les gravités de chip.
 * Son badge est donc un filet neutre et sa chip un point gris — c'est la barre
 * latérale qui porte son identité de couleur. Le jour où le produit veut une
 * gravité « à lancer » de plein droit, elle s'ajoute aux deux palettes, pas ici.
 */
export const VERDICT_TONE: Record<
  ShortageDisplayRow['verdictKey'],
  {
    badge: 'success' | 'warning' | 'destructive' | 'outline'
    chip: 'ok' | 'warning' | 'critical' | 'neutral'
    bar: string
  }
> = {
  couvert: { badge: 'success', chip: 'ok', bar: '' },
  a_risque: {
    badge: 'warning',
    chip: 'warning',
    bar: '[box-shadow:inset_3px_0_var(--color-suggere)]',
  },
  // `outline` et non `secondary` : un sous-ensemble à lancer est une action à
  // mener, pas une information de second rang. Le filet le distingue des
  // verdicts qui alertent sans le noyer dans le gris.
  sous_ensemble: {
    badge: 'outline',
    chip: 'neutral',
    bar: '[box-shadow:inset_3px_0_var(--color-planifie)]',
  },
  retard: {
    badge: 'destructive',
    chip: 'critical',
    bar: '[box-shadow:inset_3px_0_var(--color-destructive)]',
  },
  sans_couverture: {
    badge: 'destructive',
    chip: 'critical',
    bar: '[box-shadow:inset_3px_0_var(--color-destructive)]',
  },
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
