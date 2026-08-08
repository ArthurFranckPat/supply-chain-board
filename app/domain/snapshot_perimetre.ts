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
 * APPROXIMATION LEVÉE (#149). Avant le journal, rien ne persistait la liste des
 * sources TENTÉES par un run (`sourcesEnEchec` et `sourceBreakdown` ne vivaient
 * que dans les logs) : on ne pouvait pas distinguer « source non capturée ce
 * jour-là » de « source réellement vide ce jour-là ». Écarter une source absente
 * était un pari, et il se payait : une nuit où le CBN ne rend aucun OF suggéré
 * (extraction réussie, zéro ligne) est une disparition RÉELLE de ~2 000 lignes
 * — l'événement métier le plus fort de l'écran — que cette règle effaçait en
 * silence.
 *
 * Le garde-fou pauvre mais gratuit restait : n'écarter que les sources
 * ATTENDUES. Une source attendue et absente était très probablement un trou
 * d'instrumentation (le mode de défaillance dominant, cf. #138 lot 0) ; une
 * source hors liste — un nom retiré du modèle — n'avait aucune raison d'être
 * protégée, sa disparition était le fait à montrer.
 *
 * Le fix complet (#149) persiste un journal des sources capturées par run
 * (`demand_snapshot_sources`, une ligne par (snapshot_date, source) avec le
 * verdict `capturee` | `vide` | `echec`). `perimetreAvecJournal()` lit ce journal
 * au lieu de déduire de la présence en lignes : une source `vide` est comparée
 * (disparition affichée), une source `echec` est écartée avec motif exact.
 * Les snapshots historiques sans journal continuent avec l'ancien garde-fou.
 */

/**
 * Une source retirée de la comparaison, et de QUEL côté elle manque.
 *
 * Les deux cas se lisent à l'opposé et l'écran doit pouvoir les dire :
 * absente de la photo `avant` = source neuve, l'historique ne remonte pas plus
 * loin ; absente de la photo `apres` = capture perdue cette nuit-là.
 *
 * `raison` (#149) précise le motif quand le journal est disponible : `echec`
 * = capture en échec (écartée), `vide` = source réellement vide (normalement
 * comparée, non écartée — ne survient que si l'ancien garde-fou s'applique),
 * `inconnu` = historique sans journal.
 */
export interface SourceEcartee {
  source: string
  manqueDans: 'avant' | 'apres'
  raison?: 'echec' | 'vide' | 'inconnu'
}

export interface PerimetreComparable {
  /** Sources retenues des deux côtés — le seul périmètre que le diff a le droit de lire. */
  comparees: string[]
  /** Sources retirées, avec le côté où elles manquent. Trié par nom. */
  sourcesEcartees: SourceEcartee[]
}

export type StatutSource = 'capturee' | 'vide' | 'echec'

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
    sourcesEcartees.push({ source, manqueDans: dansAvant ? 'apres' : 'avant', raison: 'inconnu' })
  }
  return { comparees, sourcesEcartees }
}

/**
 * Périmètre comparable AVEC journal des sources capturées (#149).
 *
 * Quand le journal est disponible pour les deux photos, il tranche
 * `echec` vs `vide` à la source : seul `echec` écarte, `vide` reste comparé
 * (et sa disparition — jusqu'à ~2 000 lignes `of_suggestion` — est affichée).
 * Sans journal (historique pré-#149 ou table absente), retombe sur
 * `perimetreComparable` par source, pas globalement : un couple mixte
 * (une photo journalisée, l'autre non) reste exploitable.
 *
 * @param deduitAvant sources déduites de `demand_snapshots` pour la photo avant
 * @param deduitApres  sources déduites pour la photo après
 * @param journalAvant Map source → statut pour la photo avant, ou null si pas de journal
 * @param journalApres Map source → statut pour la photo après, ou null si pas de journal
 * @param attendues    sources attendues d'une photo complète
 */
export function perimetreAvecJournal(
  deduitAvant: Iterable<string>,
  deduitApres: Iterable<string>,
  journalAvant: Map<string, StatutSource> | null,
  journalApres: Map<string, StatutSource> | null,
  attendues: Iterable<string>
): PerimetreComparable {
  const setDeduitAvant = new Set(deduitAvant)
  const setDeduitApres = new Set(deduitApres)
  const setAttendues = new Set(attendues)

  // Union qui rend les sources `vide` visibles : une source réellement vide a
  // zéro ligne (absente de `deduit`) mais est tracée dans le journal. Sans
  // l'ajouter à l'union, elle resterait invisible exactement comme avant #149.
  // On n'y verse JAMAIS `appro_message` : cette source vit dans
  // `appro_message_snapshots`, pas dans `demand_snapshots`, et le périmètre des
  // drivers ne la compare pas. Le journal la contient pourtant (write() la
  // trace) — l'y inclure polluerait le diff avec une source hors périmètre.
  const allSourcesSet = new Set<string>([...setDeduitAvant, ...setDeduitApres])
  for (const m of [journalAvant, journalApres]) {
    if (m === null) continue
    for (const k of m.keys()) {
      if (k === 'appro_message') continue
      if (!setAttendues.has(k)) continue
      allSourcesSet.add(k)
    }
  }
  const allSources = [...allSourcesSet].sort()

  const comparees: string[] = []
  const sourcesEcartees: SourceEcartee[] = []

  for (const source of allSources) {
    const isAttendues = setAttendues.has(source)
    // Source hors liste : jamais protégée, toujours comparée (même motif que
    // perimetreComparable). Une source retirée du modèle doit voir sa
    // disparition affichée, pas être escamotée.
    if (!isAttendues) {
      comparees.push(source)
      continue
    }

    const hasAvant = journalAvant !== null && journalAvant.has(source)
    const hasApres = journalApres !== null && journalApres.has(source)

    if (hasAvant && hasApres) {
      const sa = journalAvant!.get(source)!
      const sp = journalApres!.get(source)!
      const echecAvant = sa === 'echec'
      const echecApres = sp === 'echec'
      if (echecAvant || echecApres) {
        // Écartée : au moins un côté en échec. Les deux en échec restent une
        // seule entrée (l'interface n'en porte qu'une par source) — l'essentiel
        // est qu'elle soit écartée, pas de quel côté.
        let manqueDans: 'avant' | 'apres'
        if (echecAvant && !echecApres) manqueDans = 'avant'
        else if (echecApres && !echecAvant) manqueDans = 'apres'
        else manqueDans = 'apres' // les deux en échec : convention `apres`
        sourcesEcartees.push({ source, manqueDans, raison: 'echec' })
      } else {
        // `capturee` ou `vide` des deux côtés : comparable. `vide` est
        // précisément le cas que l'approximation effaçait — ~2 000 lignes qui
        // disparaissent doivent produire des `disparue`, pas être escamotées.
        comparees.push(source)
      }
      continue
    }

    // Journal mixte : une seule des deux photos a un journal pour cette source
    // (historique pré-#149 vs photo récente). Il faut trancher par source, pas
    // globalement, sinon une disparition réelle (vide vs capturee) resterait
    // escamotée comme avant #149.
    if (hasAvant !== hasApres) {
      const journalSide = hasAvant ? journalAvant! : journalApres!
      const coteJournal: 'avant' | 'apres' = hasAvant ? 'avant' : 'apres'
      const statutJournal = journalSide.get(source)!
      if (statutJournal === 'echec') {
        sourcesEcartees.push({ source, manqueDans: coteJournal, raison: 'echec' })
        continue
      }
      // `capturee` ou `vide` d'un côté : l'autre côté se lit en déduit.
      const dansAutre = hasAvant ? setDeduitApres.has(source) : setDeduitAvant.has(source)
      if (statutJournal === 'vide') {
        if (dansAutre) {
          // `vide` (0 ligne, succès) vs lignes présentes -> disparition réelle
          comparees.push(source)
        } else {
          // `vide` vs absent sans journal : rien des deux côtés (ou historique
          // vide) — rien à comparer, on ne l'écarte pas non plus.
          continue
        }
        continue
      }
      // `capturee` (au moins une ligne) vs déduit
      if (dansAutre) {
        comparees.push(source)
      } else {
        const manqueDans: 'avant' | 'apres' = hasAvant ? 'apres' : 'avant'
        sourcesEcartees.push({ source, manqueDans, raison: 'inconnu' })
      }
      continue
    }

    // Aucun journal pour cette source (historique ou source nouvelle) :
    // retomber sur la présence déduite, comme avant #149.
    const dansAvant = setDeduitAvant.has(source)
    const dansApres = setDeduitApres.has(source)
    if (dansAvant && dansApres) {
      comparees.push(source)
      continue
    }
    sourcesEcartees.push({ source, manqueDans: dansAvant ? 'apres' : 'avant', raison: 'inconnu' })
  }

  return { comparees, sourcesEcartees }
}
