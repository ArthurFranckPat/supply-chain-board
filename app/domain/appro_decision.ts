import { createHash } from 'node:crypto'

/**
 * Clés logiques du ledger de décisions acheteur `/approvisionnements` (#134,
 * décision #112).
 *
 * Les suggestions d'achat sont recréées chaque nuit par le CBN (`VCRNUM`
 * instable, #108) : leur clé de décision ne peut pas être le numéro. Le
 * fingerprint #112 — `sha256(fournisseur, article, bucket échéance ±7 j,
 * bucket quantité ±20 %)` — survit à la recréation : une suggestion recréée
 * identique hérite de la décision passée, un fingerprint différent (échéance
 * déplacée > ±7 j ou quantité > ±20 %) est une nouvelle signature, donc une
 * nouvelle décision. Les messages de replanif ont une clé stable directe
 * (`VCRNUM:VCRLIN`, #107) : pas de fingerprint de leur côté.
 */

export type ApproDecisionStatut = 'vu' | 'ignorer' | 'a_passer'

export const APPRO_DECISION_STATUTS: readonly ApproDecisionStatut[] = ['vu', 'ignorer', 'a_passer']

export const isApproDecisionStatut = (v: unknown): v is ApproDecisionStatut =>
  typeof v === 'string' && (APPRO_DECISION_STATUTS as readonly string[]).includes(v)

/**
 * Empreinte #112 d'une SUGGESTION.
 *
 * Bucket d'échéance = semaine ISO (`round(jour_epoch / 7)`, frontière lundi —
 * le 1970-01-01 étant un jeudi, l'arrondi aligne les fenêtres sur les semaines
 * ISO) : deux dates de la même semaine partagent le bucket ; deux dates à plus
 * de 7 j ne le partagent jamais. Bucket de quantité = bande géométrique de
 * ratio 1,2 (`floor(log(q) / log(1,2))`) : un Δquantité < +20 % depuis le bas
 * de la bande reste dans le bucket. Pur — testable sans base ni X3.
 */
export function computeFingerprint(
  fournisseur: string,
  article: string,
  echeance: string | null,
  quantite: number
): string {
  const epochDays = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)
  const bucketEcheance = echeance === null ? -1 : Math.round(epochDays(echeance) / 7)
  const bucketQuantite = quantite > 0 ? Math.floor(Math.log(quantite) / Math.log(1.2)) : -1
  const signature = [fournisseur, article, bucketEcheance, bucketQuantite].join('\x1f')
  return createHash('sha256').update(signature).digest('hex')
}

/**
 * Override (#134, boucle de feedback #106) : la décision acheteur contredit le
 * verdict du moteur — « ignorer » alors qu'il dit d'agir (passer / replanifier /
 * regrouper), ou « à passer » alors qu'il dit de surveiller seulement.
 */
export const estOverride = (
  verdict: string | undefined,
  statut: ApproDecisionStatut | undefined
): boolean => {
  if (
    statut === 'ignorer' &&
    (verdict === 'passer' || verdict === 'replanifier' || verdict === 'regrouper')
  )
    return true
  if (statut === 'a_passer' && verdict === 'surveiller') return true
  return false
}

/** Clé logique d'un message de replanif — `VCRNUM:VCRLIN` stable (#107). */
export const cleLogiqueMessage = (numero: string, ligne: number): string => `M:${numero}:${ligne}`

/** Décision affichée sur une ligne de la file. */
export interface ApproDecision {
  statut: ApproDecisionStatut
  /** Date de la décision, ISO. */
  decidedAt: string
}
