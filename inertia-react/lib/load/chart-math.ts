/**
 * Dérivations pures + constantes de rendu des graphes de charge (issue #52 —
 * extrait de scheduler/load.tsx). Partagées entre MiniCard et DetailChart.
 */
import type { LoadPeriod, LoadView, LoadUnit } from '@r/lib/load/types'

export type { LoadUnit }

export type Gran = 'month' | 'week'

export const FERME = 'var(--color-ferme)'
export const PLANIFIE = 'var(--color-planifie)'
export const SUGGERE = 'var(--color-suggere)'
export const BRAND = 'var(--color-brand)'
export const MUTED = 'var(--color-muted-foreground)'
export const FG = 'var(--color-foreground)'
export const RULE_SOFT = 'var(--color-rule-soft)'
export const CARD = 'var(--color-card)'
export const DANGER = 'var(--color-danger)'
export const WARN = 'var(--color-warn)'
/** Hachures SVG (motifs définis dans <HatchDefs>) : induit dans la couleur du parent. */
export const HATCH_FERME = 'url(#load-hatch-ferme)'
export const HATCH_SUGGERE = 'url(#load-hatch-suggere)'

export const total = (p: LoadPeriod) => p.f + p.p + p.s + p.fi + p.si

/**
 * Valeur de charge telle qu'elle s'écrit à l'écran : ENTIER, en français, avec
 * séparateurs de milliers (`12 000` — sans eux un poste à 5 chiffres ne se lit
 * plus).
 *
 * L'arrondi n'est pas cosmétique. Les séries tracées sont entières, mais une
 * ÉCHELLE ne l'est pas : la capacité nette vaut `12,6 h/jour × jours ouvrés`,
 * donc `maxV` vaut 151,98 et ses quarts 37,995… Servi brut (`String`), un quart
 * d'axe s'écrivait « 37.995000000000005 » — et comme l'axe est aligné à droite
 * au bord du viewBox, il n'en restait à l'écran que la queue décimale :
 * « 999997 ». Un axe affiche une échelle, pas une mesure : il s'arrondit.
 *
 * L'unité n'entre pas dans le format — elle est portée par `loadUnitSuffix`,
 * collé à la valeur. Deux unités, une seule façon d'écrire un nombre.
 */
export const fmtLoadValue = (v: number): string => Math.round(v).toLocaleString('fr-FR')

/** Suffixe d'unité, collé à la valeur (« 128h », « 12 000u »). */
export const loadUnitSuffix = (unit: LoadUnit): string => (unit === 'u' ? 'u' : 'h')

/**
 * Filtre de segments (issue « filtre statut/nature » sur /charge).
 *
 * Les deux vues ne filtrent pas la même chose : la vue OF ventile par STATUT
 * d'ordre (Ferme/Planifié/Suggéré = WIPSTA 1/2/3), la vue Commande par NATURE
 * de demande (Commande/Prévision) — et chaque nature entraîne son induit
 * (`fi`/`si`, hachuré), qui suit forcément son parent : filtrer « Prévision »
 * sans retirer l'induit prévision afficherait une charge orpheline.
 */
export interface LoadSegOption {
  /** Identifiant du bouton (stable par vue). */
  id: string
  label: string
  /** Couleur de pastille de légende. */
  color: string
  /** Champs de `LoadPeriod` conservés quand l'option est active. */
  keys: (keyof LoadPeriod)[]
}

export const OF_SEG_OPTIONS: LoadSegOption[] = [
  { id: 'f', label: 'Ferme', color: FERME, keys: ['f'] },
  { id: 'p', label: 'Planifié', color: PLANIFIE, keys: ['p'] },
  { id: 's', label: 'Suggéré', color: SUGGERE, keys: ['s'] },
]

export const CMD_SEG_OPTIONS: LoadSegOption[] = [
  { id: 'commande', label: 'Commande', color: FERME, keys: ['f', 'fi'] },
  { id: 'prevision', label: 'Prévision', color: SUGGERE, keys: ['s', 'si'] },
]

export const segOptions = (view: LoadView): LoadSegOption[] =>
  view === 'of' ? OF_SEG_OPTIONS : CMD_SEG_OPTIONS

/** Champs de `LoadPeriod` retenus par un jeu d'options actives. */
export const segKeys = (view: LoadView, active: ReadonlySet<string>): Set<keyof LoadPeriod> => {
  const keys = new Set<keyof LoadPeriod>()
  for (const o of segOptions(view)) {
    if (active.has(o.id)) o.keys.forEach((k) => keys.add(k))
  }
  return keys
}

/** Remet à zéro les segments écartés par le filtre — tout le reste (totaux,
 *  pic, saturation, moyenne mobile) en découle sans autre modification. */
export const maskPeriod = (p: LoadPeriod, on: ReadonlySet<keyof LoadPeriod>): LoadPeriod => ({
  f: on.has('f') ? p.f : 0,
  p: on.has('p') ? p.p : 0,
  s: on.has('s') ? p.s : 0,
  fi: on.has('fi') ? p.fi : 0,
  si: on.has('si') ? p.si : 0,
})

/** Taux de saturation charge/capacité, en % (0 si capacité nulle). */
export const satRate = (charge: number, cap: number): number => (cap > 0 ? (charge / cap) * 100 : 0)

/** Couleur de saturation : ≥100 % rouge, ≥85 % orange, sinon neutre. */
export const satColor = (charge: number, cap: number): string => {
  if (cap <= 0) return MUTED
  if (charge > cap) return DANGER
  if (charge >= cap * 0.85) return WARN
  return MUTED
}

/** Libellé d'un segment selon la vue
 * (OF : Ferme/Planifié/Suggéré ; Commande : Commande/Prévision + induits). */
export const segLabel = (view: LoadView, key: keyof LoadPeriod): string => {
  if (key === 'fi') return 'Induit (ferme)'
  if (key === 'si') return 'Induit (prévision)'
  return view === 'commande'
    ? key === 's'
      ? 'Prévision'
      : 'Commande'
    : key === 'f'
      ? 'Ferme'
      : key === 'p'
        ? 'Planifié'
        : 'Suggéré'
}

/** Chemin d'un rectangle à coins supérieurs arrondis (sommet de barre empilée). */
export function rtop(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2)
  return (
    `M ${x.toFixed(1)} ${(y + r).toFixed(1)} Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} ` +
    `L ${(x + w - r).toFixed(1)} ${y.toFixed(1)} Q ${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + r).toFixed(1)} ` +
    `V ${(y + h).toFixed(1)} H ${x.toFixed(1)} Z`
  )
}

/** Moyenne mobile (fenêtre `win`) d'une série de totaux. */
export function mobileAvg(totals: number[], win: number): number[] {
  const r: number[] = []
  for (let i = 0; i < totals.length; i++) {
    let s = 0
    let c = 0
    for (let k = i - win + 1; k <= i; k++) {
      if (k >= 0) {
        s += totals[k]
        c++
      }
    }
    r.push(c ? s / c : 0)
  }
  return r
}

/** Segments empilés bas→haut d'une période.
 *  OF (si/fi=0) : Suggéré, Planifié, Ferme.
 *  Commande (p=0) : Prévision + induit prévision (hachuré), Commande + induit ferme (hachuré). */
export const segsOf = (d: LoadPeriod): [keyof LoadPeriod, number, string][] => [
  ['s', d.s, SUGGERE],
  ['si', d.si, HATCH_SUGGERE],
  ['p', d.p, PLANIFIE],
  ['f', d.f, FERME],
  ['fi', d.fi, HATCH_FERME],
]

/**
 * Position d'une date dans la suite de buckets du graphe, en index FRACTIONNAIRE
 * de slot (2,4 = 40 % dans le 3e bucket). `iso` est un jour INCLUS : la borne
 * tracée est le lendemain à minuit, fin réelle du jour.
 *
 * Clés de bucket : lundi ISO (`2026-09-21`) en hebdo, `AAAA-M` (`2026-9`) en
 * mensuel — celles du payload. `null` si la date tombe hors de la fenêtre.
 * Calcul en jours civils (arrondi) : un passage à l'heure d'hiver ne décale
 * pas la borne d'une heure.
 */
export function bucketPosOf(iso: string, keys: string[], gran: Gran): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)
  const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000)
  for (const [i, key] of keys.entries()) {
    let start: Date
    let end: Date
    if (gran === 'week') {
      const k = /^(\d{4})-(\d{2})-(\d{2})/.exec(key)
      if (!k) return null
      start = new Date(Number(k[1]), Number(k[2]) - 1, Number(k[3]))
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    } else {
      const [y, mo] = key.split('-').map(Number)
      start = new Date(y, mo - 1, 1)
      end = new Date(y, mo, 1)
    }
    if (at >= start && at < end) return i + days(start, at) / days(start, end)
  }
  return null
}
