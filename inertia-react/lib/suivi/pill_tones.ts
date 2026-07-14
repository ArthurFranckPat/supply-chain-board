/**
 * Mapping des tones custom (BADGE_TONE / VERDICT_TONE / OF_STATUT) vers les
 * `colorVariant` du composant Carbon `Pill`.
 *
 * Contexte (issue #77 §4) : les tones sources sont des classNames Tailwind
 * (`bg-ferme/15 text-ferme`) mappées sur les tokens Sage dans
 * `inertia-react/styles/app.css`. Pour les badges, on bascule sur le `Pill`
 * Carbon qui expose 5 variantes sémantiques normalisées. Ce helper centralise
 * la correspondance pour ne pas la répéter dans chaque colonne / section du
 * drawer détail.
 */
import type { SuiviStatusKey, ProactiveVerdictKey } from '@/lib/suivi/types'

/** Variante de couleur Pill Carbon. */
export type PillColorVariant = 'neutral' | 'negative' | 'positive' | 'warning' | 'information'

export interface PillToneConfig {
  colorVariant: PillColorVariant
  /** fill = true remplit le fond de couleur ; false ne colore que la bordure. */
  fill: boolean
}

/**
 * Détection d'un tone depuis une className Tailwind source (ex. `bg-ferme/15 text-ferme`).
 * Renvoie la config Pill équivalente. Défaut neutre si rien ne matche.
 */
export function toneToPill(className: string): PillToneConfig {
  if (className.includes('destructive')) return { colorVariant: 'negative', fill: true }
  if (className.includes('ferme')) return { colorVariant: 'positive', fill: false }
  if (className.includes('planifie')) return { colorVariant: 'information', fill: false }
  if (className.includes('suggere')) return { colorVariant: 'warning', fill: false }
  if (className.includes('brand')) return { colorVariant: 'information', fill: false }
  return { colorVariant: 'neutral', fill: false }
}

/** Tone par statut de ligne réactive (BADGE_TONE[source]). */
export const STATUS_PILL: Record<SuiviStatusKey, PillToneConfig> = {
  exp: toneToPill('bg-ferme/15 text-ferme'),
  alc: toneToPill('bg-suggere/15 text-suggere'),
  ret: toneToPill('bg-destructive/10 text-destructive'),
  ras: toneToPill('bg-secondary text-muted-foreground'),
}

/** Tone par verdict (vue proactive, VERDICT_TONE[source]). */
export const VERDICT_PILL: Record<ProactiveVerdictKey, PillToneConfig> = {
  time: toneToPill('bg-ferme/15 text-ferme'),
  stock: toneToPill('bg-ferme/15 text-ferme'),
  late: toneToPill('bg-suggere/15 text-suggere'),
  blocked: toneToPill('bg-destructive/10 text-destructive'),
  uncov: toneToPill('bg-destructive/10 text-destructive'),
  risk: toneToPill('bg-planifie/15 text-planifie'),
}

/** Tone par statut d'OF (WOF/WOP/WOS). */
export const OF_STATUT_PILL: Record<number, PillToneConfig> = {
  1: toneToPill('bg-ferme/15 text-ferme'),   // WOF Ferme → vert
  2: toneToPill('bg-planifie/15 text-planifie'), // WOP Planifié → bleu
  3: toneToPill('bg-suggere/15 text-suggere'),   // WOS Suggéré → ambre
}

/** Tone du chip Type (MTS/MTO/NOR). */
export const TYPE_PILL: PillToneConfig = toneToPill('bg-brand-soft text-brand')
