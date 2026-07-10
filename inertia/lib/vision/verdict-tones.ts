/**
 * Issue #62 (lot 2) — source unique des tons visuels par verdict d'impact.
 *
 * Avant ce module, la palette verdict était dupliquée dans 3 endroits :
 *   • commande-marker.tsx — BORDER_BY_VERDICT + ICON_BY_VERDICT (+ UNKNOWN)
 *   • links-overlay.tsx   — STROKE (couleurs SVG brutes)
 *   • (board-grid VERDICT_TONE et tracking-shared sont des alphabets différents
 *     — servabilité / suivi proactif — conservés séparés, voir §Limites)
 *
 * Sémantique canonique (arbitrage issue #62) :
 *   • ok      → VERT  (ferme). Brand/accent RÉSERVÉ à la marque/interaction,
 *               jamais utilisé pour coder « ok » (collision sémantique).
 *   • limite  → AMBRE (attention).
 *   • retard  → ROUGE (alerte).
 *   • unknown → NEUTRE (gris). Distinct de ok depuis le lot 0 : un verdict
 *               null (non évalué) ne doit pas emprunter la teinte du « ok ».
 *
 * Deux canaux visuels distincts (cf. wireframe programme-v2 §7) :
 *   • liseré HAUT  = statut OF (ferme/planifié/suggéré) — board-card.
 *   • liseré GAUCHE = verdict d'impact (ce module) — commande-marker.
 */
import type { ImpactVerdict } from '@/lib/vision/impact'

/** Tons Tailwind pour le liseré gauche + icône du marqueur commande. */
export const VERDICT_BORDER: Record<ImpactVerdict, string> = {
  retard: 'border-l-error',
  limite: 'border-l-amber-500',
  ok: 'border-l-ferme',
}
export const VERDICT_ICON: Record<ImpactVerdict, string> = {
  retard: 'text-error',
  limite: 'text-amber-600',
  ok: 'text-ferme',
}

/** Verdict non évalué (null) → ton neutre, DISTINCT du « ok ». */
export const UNKNOWN_BORDER = 'border-l-muted-foreground/45'
export const UNKNOWN_ICON = 'text-muted-foreground'

/** Couleurs SVG brutes pour l'overlay des liens (links-overlay). */
export const VERDICT_STROKE: Record<ImpactVerdict, string> = {
  retard: 'var(--color-error)',
  limite: '#d97706', // amber-600
  ok: 'var(--color-ferme)',
}

/** Libellé verbal court pour aria-label / lecteur d'écran. */
export const VERDICT_LABEL: Record<ImpactVerdict, string> = {
  ok: 'à l\u2019heure',
  limite: 'limite',
  retard: 'en retard',
}

/*
 * §Limites — alphabets verdict non fusionnés ici :
 *
 * board-grid.tsx VERDICT_TONE (servabilité : on_time/stock/retard/bloquee/
 * sans_couverture) et lib/suivi/tracking-shared.ts (suivi proactif) utilisent
 * des clés métier différentes et des valeurs de forme différente ({border,
 * text, label} vs classe unique). Les fusionner nécessiterait une map
 * d'adaptation par alphabet — laissé à un refactor ultérieur une fois la
 * sémantique des statuts OF stabilisée. Le présent module couvre le périmètre
 * vision/impact (marqueur commande + overlay liens), qui était la duplication
 * la plus directe.
 */
