/**
 * Barrel — vues du suivi des ruptures (issue #52).
 *
 * Historiquement ce fichier portait les 3 vues (Registre R1, Par composant R2,
 * Couverture R3) + le helper Marker, soit ~645 lignes monolithes. Chaque vue
 * vit désormais dans son propre fichier (1 vue = 1 composant) ; les dérivations
 * pures (agrégation, prédicats verdict, position temporelle) sont dans
 * `@/lib/shortages/shortage-math.ts` (testable).
 *
 * Ce barrel préserve le point d'entrée historique : la page parente
 * (scheduler/shortages) importe toujours `{ ShortageRegistre, ShortageComposants,
 * ShortageTimeline }` depuis ici, sans modification.
 */
export { ShortageRegistre } from './shortage-registre'
export { ShortageComposants } from './shortage-composants'
export { ShortageTimeline } from './shortage-timeline'
