/**
 * Clés logiques du ledger de décisions acheteur `/approvisionnements` (#134,
 * décision #112).
 *
 * ## Pourquoi pas un fingerprint
 *
 * La v1 hachait `(fournisseur, article, bucket échéance, bucket quantité)` en
 * annonçant une tolérance « ±7 j / ±20 % ». Un bucket n'est pas une tolérance :
 * `round(jours / 7)` et `floor(log q / log 1,2)` sont des BINS, et deux valeurs
 * de part et d'autre d'une frontière tombent dans deux bins voisins quel que
 * soit leur écart réel. Une échéance déplacée d'un seul jour pouvait donc
 * changer l'empreinte, faire perdre la décision en silence, puis la faire
 * expirer comme « absente ». La tolérance réelle valait 0 j dans le pire cas.
 *
 * La clé est donc le **couple (fournisseur, article)** — la maille à laquelle
 * une décision d'achat se prend (#110), la même que le diff inter-CBN (#133) —
 * et la tolérance est appliquée à la LECTURE, en comparant l'instantané stocké
 * à la ligne courante (`decisionEncoreValable`). Une seule définition des
 * seuils, partagée avec `appro_snapshot_diff.ts`.
 *
 * Les messages de replanif gardent leur clé stable directe (`VCRNUM:VCRLIN`,
 * #107) : rien à comparer de leur côté.
 */

export type ApproDecisionStatut = 'vu' | 'ignorer' | 'a_passer'

export const APPRO_DECISION_STATUTS: readonly ApproDecisionStatut[] = ['vu', 'ignorer', 'a_passer']

export const isApproDecisionStatut = (v: unknown): v is ApproDecisionStatut =>
  typeof v === 'string' && (APPRO_DECISION_STATUTS as readonly string[]).includes(v)

/** Tolérances de la décision #112, partagées avec le diff inter-CBN (#133). */
export const TOLERANCE_ECHEANCE_JOURS = 7
export const TOLERANCE_QUANTITE_RATIO = 0.2

/**
 * Plafond d'appariement pour `cbn_driver_diff.apparie()` (#144).
 *
 * Au-delà de cette distance deux lignes ne sont pas le même besoin : la ligne
 * « avant » part en `disparue`, la ligne « après » en `apparue`, au lieu d'être
 * mariées en `date` à +N jours. Seuil mesuré sur le régime normal (six nuits
 * consécutives sans appariement > 30 j), à la même enseigne que les deux
 * tolérances ci-dessus — même statut, même besoin de calibrage.
 *
 * **Unité : jour CALENDAIRE**, pas jour ouvré. L'écart est calculé par
 * `joursEntre` (division par `86_400_000`), qui ignore le calendrier usine
 * (#37). 30 j calendaires valent donc ~21 j ouvrés : à relire avant tout
 * recalibrage, le seuil n'est pas exprimé dans l'unité de la charge.
 *
 * Le plafond porte sur la valeur ABSOLUE de l'écart : il est symétrique, une
 * avance de 60 j est écartée comme un retard de 60 j.
 *
 * Il ne s'arme que sur les sources dont `cbn_driver_diff` DEVINE l'identité de
 * ligne (suggestions et OF planifiés, recréés chaque nuit). Là où la clé porte
 * déjà `(vcrnum, vcrlin)`, l'identité est certaine et rien n'est borné.
 */
export const TOLERANCE_APPARIEMENT_JOURS = 30

/** Jours consécutifs SANS voir une clé dans la file avant d'expirer sa décision (#112). */
export const EXPIRATION_JOURS_ABSENCE = 3

/** Séparateur interne d'une clé composite — absent des codes X3. */
const SEP = '\x1f'

/**
 * Clé logique d'une SUGGESTION : le couple fournisseur × article.
 *
 * Stable par construction — le CBN peut recréer la ligne chaque nuit avec un
 * `VCRNUM` neuf, le couple ne bouge pas. Ce qui bouge (échéance, quantité) est
 * comparé à la lecture, pas encodé dans la clé.
 */
export const cleLogiqueSuggestion = (fournisseur: string, article: string): string =>
  `S:${fournisseur}${SEP}${article}`

/** Clé logique d'un message de replanif — `VCRNUM:VCRLIN` stable (#107). */
export const cleLogiqueMessage = (numero: string, ligne: number): string => `M:${numero}:${ligne}`

/**
 * Une chaîne est-elle une clé de message bien formée ?
 *
 * Sert à valider ce qu'un client renvoie : il reprend la clé de la ligne
 * affichée au lieu de la reconstruire, et le serveur vérifie sa forme plutôt que
 * de refaire le découpage.
 */
export const estCleMessage = (v: string): boolean => /^M:[^:]+:\d+$/.test(v)

/** Écart en jours entiers entre deux jours ISO. `null` si l'un des deux manque. */
const joursEntre = (deIso: string | null, aIso: string | null): number | null => {
  if (deIso === null || aIso === null) return null
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null
  return Math.round((a - de) / 86_400_000)
}

/** Instantané de la ligne au moment de la décision, tel que stocké au ledger. */
export interface ApproDecisionSnapshot {
  echeance: string | null
  quantite: number
}

/**
 * La décision passée vaut-elle encore pour la ligne courante ?
 *
 * Oui tant que l'échéance n'a pas bougé de plus de ±7 j ET la quantité de plus
 * de ±20 % (écart rapporté à la plus petite des deux, comme le diff #133 — un
 * même écart doit peser pareil dans les deux sens). Au-delà, la ligne n'est plus
 * celle qui a été décidée : aucune décision ne s'affiche et l'acheteur retranche.
 *
 * Deux échéances absentes s'apparient (une ligne sans date n'est pas une ligne
 * différente) ; une date apparue ou disparue invalide.
 */
export function decisionEncoreValable(
  snapshot: ApproDecisionSnapshot,
  courant: ApproDecisionSnapshot
): boolean {
  if (snapshot.echeance === null || courant.echeance === null) {
    if (snapshot.echeance !== courant.echeance) return false
  } else {
    const ecart = joursEntre(snapshot.echeance, courant.echeance)
    if (ecart === null || Math.abs(ecart) > TOLERANCE_ECHEANCE_JOURS) return false
  }

  const base = Math.min(snapshot.quantite, courant.quantite) || 1
  const ratio = Math.abs(courant.quantite - snapshot.quantite) / base
  return ratio <= TOLERANCE_QUANTITE_RATIO
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

/** Décision affichée sur une ligne de la file. */
export interface ApproDecision {
  statut: ApproDecisionStatut
  /** Date de la décision, ISO. */
  decidedAt: string
}
