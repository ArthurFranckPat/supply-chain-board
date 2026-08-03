/**
 * Rattachement atelier d'un poste de charge (issue #36), dérivé de
 * `WORKSTATIO.STOLOC_0` (emplacement de stock du poste).
 *
 * Nature du poste (assemblage PF vs sous-ensemble) : dérivée des **catégories
 * article** des gammes (`ITMMASTER` category / `static_articles.category`) —
 * préfixe `PF*` vs `SF*`. Validé métier 2026-07 (ex. PP_153 bouches = PF).
 */
import { groupGammeByArticle, type GammeOperation } from '#app/domain/models/gamme'

/**
 * Postes « ligne de production » : préfixe `PP_` + numéro. Convention partagée
 * du séquenceur (#46) et du cockpit (#119) — les codes hors nomenclature
 * (stocks, ateliers annexes, codes libres d'override) n'ont leur place ni dans
 * l'un ni dans l'autre. Le cockpit l'applique à la liste venue des pointages,
 * le séquenceur à la liste venue des gammes : MÊME filtre, sources différentes.
 */
export const POSTE_PP_RE = /^PP_\d+$/

export type AtelierCategory = 'montage' | 'fabrication'

/**
 * Nature d'un poste de charge selon les articles qu'il produit (1ʳᵉ op gamme).
 * - `assemblage_pf` : majorité d'articles `PF*` (produit fini / vendable)
 * - `assemble_sous_ensemble` : majorité d'articles `SF*` (semi-fini)
 * - `autre` : aucune catégorie PF/SF exploitable
 */
export type PosteNature = 'assemblage_pf' | 'assemble_sous_ensemble' | 'autre'

/** Libellés lisibles par emplacement (STOLOC). À compléter avec le métier. */
const LABELS: Record<string, string> = {
  S9P: 'Atelier S9P',
  S3P: 'Atelier S3P',
  S4P: 'Atelier S4P',
  CLP: 'Atelier CLP',
  EXP: 'Expédition',
  MEC: 'Mécanique',
  ELC: 'Électronique',
  LAB: 'Laboratoire',
  REC: 'Réception',
  ZPR: 'Zone production',
}

export function atelierLabel(stoloc: string): string {
  const code = (stoloc ?? '').trim()
  if (!code) return '—'
  return LABELS[code] ?? code
}

/**
 * Classe un poste à partir des catégories article de sa gamme.
 * Majorité `PF*` vs `SF*` ; égalité → PF ; aucun signal → `autre`.
 */
export function posteNatureFromCategories(categories: Iterable<string>): PosteNature {
  let pf = 0
  let sf = 0
  for (const raw of categories) {
    const cat = (raw ?? '').trim().toUpperCase()
    if (cat.startsWith('PF')) pf++
    else if (cat.startsWith('SF')) sf++
  }
  if (pf === 0 && sf === 0) return 'autre'
  if (pf >= sf) return 'assemblage_pf'
  return 'assemble_sous_ensemble'
}

/**
 * Map poste → nature, en ne retenant que la **1ʳᵉ opération** de chaque article
 * (même règle que le rattachement des OF au board).
 */
export function buildPosteNatureByWorkstation(
  gammeOps: GammeOperation[],
  categoryByArticle: Map<string, string> | ReadonlyMap<string, string>
): Map<string, PosteNature> {
  const catsByWst = new Map<string, string[]>()
  for (const [, ops] of groupGammeByArticle(gammeOps)) {
    const wst = ops[0]?.workstation
    if (!wst) continue
    const cat = categoryByArticle.get(ops[0].article) ?? ''
    const list = catsByWst.get(wst)
    if (list) list.push(cat)
    else catsByWst.set(wst, [cat])
  }
  const out = new Map<string, PosteNature>()
  for (const [wst, cats] of catsByWst) {
    out.set(wst, posteNatureFromCategories(cats))
  }
  return out
}

/** Montage ↔ assemblage PF ; fabrication ↔ sous-ensemble (compat filtre /charge). */
export function atelierCategoryFromPosteNature(nature: PosteNature): AtelierCategory {
  return nature === 'assemblage_pf' ? 'montage' : 'fabrication'
}

/**
 * Compat /charge : délègue à la nature article si fournie, sinon fabrication.
 * Préférer `posteNatureFromCategories` + `atelierCategoryFromPosteNature`.
 */
export function atelierCategory(_stoloc: string, nature?: PosteNature): AtelierCategory {
  if (nature) return atelierCategoryFromPosteNature(nature)
  return 'fabrication'
}
