/**
 * Ce qu'on a le DROIT de comparer entre deux photos (#145).
 *
 * Le jeu de sources d'une photo a bougé dans le temps (6 → 7 → 8 entre le 30/07
 * et le 06/08/2026). Comparer une photo à 7 sources avec une photo à 8 fait
 * apparaître la 8e en bloc : 5 469 lignes « apparues » le 04 → 07, qui ne
 * décrivent aucun mouvement du plan. Cette règle-là — quelles sources entrent
 * dans le diff, lesquelles en sortent et pourquoi — est du domaine, pas de
 * l'I/O : elle vit ici, pure et testable sans base.
 *
 * APPROXIMATION ASSUMÉE, et c'est le point délicat. Rien ne persiste
 * aujourd'hui la liste des sources TENTÉES par un run (`sourcesEnEchec` et
 * `sourceBreakdown` ne vivent que dans les logs) : on ne peut donc pas
 * distinguer « source non capturée ce jour-là » de « source réellement vide ce
 * jour-là ». Écarter une source absente est un pari, et il se paye : une nuit
 * où le CBN ne rend aucun OF suggéré (extraction réussie, zéro ligne) est une
 * disparition RÉELLE de ~2 000 lignes — l'événement métier le plus fort de
 * l'écran — que cette règle efface en silence.
 *
 * Le garde-fou pauvre mais gratuit : n'écarter que les sources ATTENDUES. Une
 * source attendue et absente est très probablement un trou d'instrumentation
 * (le mode de défaillance dominant, cf. #138 lot 0) ; une source hors liste
 * — un nom retiré du modèle — n'a aucune raison d'être protégée, sa disparition
 * est le fait à montrer. Le fix complet demande un journal des sources
 * capturées par run — issue #149, hors périmètre de ce lot.
 */

/**
 * Une source retirée de la comparaison, et de QUEL côté elle manque.
 *
 * Les deux cas se lisent à l'opposé et l'écran doit pouvoir les dire :
 * absente de la photo `avant` = source neuve, l'historique ne remonte pas plus
 * loin ; absente de la photo `apres` = capture perdue cette nuit-là.
 */
export interface SourceEcartee {
  source: string
  manqueDans: 'avant' | 'apres'
}

export interface PerimetreComparable {
  /** Sources retenues des deux côtés — le seul périmètre que le diff a le droit de lire. */
  comparees: string[]
  /** Sources retirées, avec le côté où elles manquent. Trié par nom. */
  sourcesEcartees: SourceEcartee[]
}

/**
 * Découpe le périmètre comparable de deux photos.
 *
 * @param avant sources réellement présentes dans la photo « avant »
 * @param apres sources réellement présentes dans la photo « après »
 * @param attendues sources qu'une photo COMPLÈTE contient — seules celles-là
 *   bénéficient du doute et sortent du diff quand elles manquent d'un côté.
 */
export function perimetreComparable(
  avant: Iterable<string>,
  apres: Iterable<string>,
  attendues: Iterable<string>
): PerimetreComparable {
  const setAvant = new Set(avant)
  const setApres = new Set(apres)
  const setAttendues = new Set(attendues)

  const comparees: string[] = []
  const sourcesEcartees: SourceEcartee[] = []
  for (const source of [...new Set([...setAvant, ...setApres])].sort()) {
    const dansAvant = setAvant.has(source)
    const dansApres = setApres.has(source)
    if (dansAvant && dansApres) {
      comparees.push(source)
      continue
    }
    // Absente d'un côté et NON attendue : on ne la protège pas, son absence est
    // le fait métier. Elle reste dans le diff et y produit apparitions ou
    // disparitions, comme n'importe quelle ligne.
    if (!setAttendues.has(source)) {
      comparees.push(source)
      continue
    }
    sourcesEcartees.push({ source, manqueDans: dansAvant ? 'apres' : 'avant' })
  }
  return { comparees, sourcesEcartees }
}
