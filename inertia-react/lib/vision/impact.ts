/**
 * Issue #23 — couche d'impact sur /programme (mode combiné).
 *
 * Verdict par lien OF ↔ ligne de commande : `delta = dateFinOf − dateBesoin`
 * (jours calendaires, dates EFFECTIVES → overrides inclus) → 3 états :
 *   • `retard` — delta > 0            (commande ne partira pas à l'heure)
 *   • `limite` — −MARGE_JOURS ≤ delta ≤ 0
 *   • `ok`     — delta < −MARGE_JOURS (comportement actuel)
 *
 * Le serveur émet uniquement les deux dates brutes (ofDateFinIso, cmdDateBesoinIso) ;
 * verdict + delta se dérivent ICI, côté client uniquement — car le drag doit les
 * recalculer de toute façon (une seule formule, un seul endroit, zéro divergence
 * serveur/client). Cf. PRD docs/prd-23-impacts-programme.md §4.1, §5.2.
 *
 * Module SANS import : portable (testable sans résolution de l'alias @/), au même
 * titre que date-utils.ts. Les types sont redéclarés ici (pas importés de types.ts)
 * volontairement — la dépendance type-only aurait suffi, mais le zéro-import rend
 * le module testable tel quel sous le runner Japa.
 */

export type ImpactVerdict = 'ok' | 'limite' | 'retard'

/** Marge calendaire sous laquelle un lien est jugé « limite » (v1 : pas d'UI de réglage). */
export const MARGE_JOURS = 2

const DAY_MS = 86_400_000

/** Représentation minimale d'un lien pour le calcul d'impact (sous-ensemble de VisionLink). */
export interface ImpactLink {
  ofId: string
  commandeId: string
  suggere?: boolean
  ofDateFinIso: string | null
  cmdDateBesoinIso: string | null
}

/** Résultat du calcul pour un lien identifié par la paire { ofId, commandeId }. */
export interface LinkImpact {
  ofId: string
  commandeId: string
  delta: number | null
  verdict: ImpactVerdict | null
}

/** Parse un ISO YYYY-MM-DD en Date locale ; null si invalide/absente (même logique que date-utils). */
function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/**
 * Écart calendaire entre la fin effective de l'OF et la date de besoin de la commande.
 * `delta > 0` → l'OF finit APRÈS le besoin (retard). Null si l'une des dates manque.
 */
export function linkDelta(ofFinIso: string | null, besoinIso: string | null): number | null {
  const ofFin = parseIso(ofFinIso)
  const besoin = parseIso(besoinIso)
  if (!ofFin || !besoin) return null
  return Math.round((ofFin.getTime() - besoin.getTime()) / DAY_MS)
}

/** Verdict dérivé du delta. Null si delta null (donnée manquante → pas de verdict). */
export function verdictOf(delta: number | null): ImpactVerdict | null {
  if (delta === null) return null
  if (delta > 0) return 'retard'
  if (delta >= -MARGE_JOURS) return 'limite'
  return 'ok'
}

/** Clé composite d'un lien (sert de Map key). */
export const linkKey = (ofId: string, commandeId: string): string => `${ofId}→${commandeId}`

/**
 * Calcule les impacts de tous les liens, en tenant compte des états de drag en cours.
 *
 * @param links            Liens OF↔commande (payload serveur).
 * @param ofShift          ofId → décalage en jours (drag OF optimiste : colonnes cible−origine).
 *                          La durée de l'OF est préservée → dateFin translatée du même écart.
 * @param cmdBesoinOverride commandeId → date de besoin provisoire (iso) pendant un drag commande.
 * @returns Map<linkKey, { delta, verdict }> — un LinkImpact par lien.
 */
export function computeImpacts(
  links: ImpactLink[],
  ofShift: Map<string, number> = new Map(),
  cmdBesoinOverride: Map<string, string> = new Map()
): Map<string, LinkImpact> {
  const out = new Map<string, LinkImpact>()
  for (const link of links) {
    // Date de fin effective de l'OF, translatée par le décalage de drag éventuel.
    const shift = ofShift.get(link.ofId) ?? 0
    const baseFin = parseIso(link.ofDateFinIso)
    const ofFinIso = baseFin && shift !== 0 ? shiftIso(baseFin, shift) : link.ofDateFinIso

    // Date de besoin de la commande, surchargée par le drag commande éventuel.
    const besoinIso = cmdBesoinOverride.get(link.commandeId) ?? link.cmdDateBesoinIso

    const delta = linkDelta(ofFinIso, besoinIso)
    out.set(linkKey(link.ofId, link.commandeId), {
      ofId: link.ofId,
      commandeId: link.commandeId,
      delta,
      verdict: verdictOf(delta),
    })
  }
  return out
}

/** Verdict le plus grave d'un ensemble (retard > limite > ok > null). */
export function worstVerdict(verdicts: Iterable<ImpactVerdict | null>): ImpactVerdict | null {
  let worst: ImpactVerdict | null = null
  const rank: Record<ImpactVerdict, number> = { ok: 0, limite: 1, retard: 2 }
  for (const v of verdicts) {
    if (v === null) continue
    if (worst === null || rank[v] > rank[worst]) worst = v
  }
  return worst
}

/** Décale une date ISO (YYYY-MM-DD) de `days` jours calendaires → ISO. */
function shiftIso(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/** Formate un delta en libellé court : « +7 j », « J−2 », « à l'heure ». */
export function deltaLabel(delta: number | null): string {
  if (delta === null) return ''
  if (delta > 0) return `+${delta} j`
  if (delta < 0) return `J${delta}`
  return 'J'
}
