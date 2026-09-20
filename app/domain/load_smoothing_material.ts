/**
 * Plafond MATIÈRE de l'avance, pour le lissage de charge.
 *
 * Domaine pur : aucune dépendance Adonis, aucune I/O. Compagnon de
 * `load_smoothing.ts`, qui documente pourquoi ce plafond existe :
 *
 * > retarder ne pose aucun problème matière (les composants sont déjà là),
 * > alors qu'avancer suppose les composants présents.
 *
 * `fenetreDeplacement()` rend `auPlusTot = date − 10 jours ouvrés` sans rien
 * vérifier. Proposer une date que l'atelier ne peut pas tenir faute de
 * composants, c'est faire perdre une négociation client pour rien : le
 * planificateur appelle ALDES, décale, et l'OF ne part quand même pas.
 *
 * ── Le modèle : une MARGE CUMULÉE par composant ─────────────────────────────
 * `material_projection` date déjà, par composant et par bucket, les entrées
 * (stock + en-cours + arrivées) et les besoins appelés. En maille JOUR, on en
 * tire une marge cumulée :
 *
 *   marge(t) = stock + en-cours + Σ arrivées(0..t) − Σ besoins(0..t)
 *
 * Avancer une ligne du jour `D` au jour `d` déplace sa consommation `q` de `D`
 * vers `d`. Les jours `t ∈ [d, D−1]` portent alors `q` de plus : le déplacement
 * ne tient que si `marge(t) ≥ q` sur TOUT cet intervalle. Le plus tôt
 * atteignable est donc le premier jour, en remontant depuis `D−1`, où la marge
 * passe sous `q`.
 *
 * La marge n'est VOLONTAIREMENT pas écrêtée à zéro (contrairement au `solde` de
 * la projection) : un composant déjà en rupture doit rendre une marge négative
 * et bloquer l'avance, pas repartir de zéro comme si de rien n'était.
 *
 * ── Ce que cette borne vaut, et ce qu'elle ne vaut pas ──────────────────────
 *  - Elle est CONSERVATRICE sur le besoin : la quantité `q` vient de l'explosion
 *    BRUTE de la ligne (`explodeMaterialNeeds`), qui n'est nettée que du stock
 *    fantôme, alors que la projection charge un besoin déjà net de ce que les
 *    parents couvrent. `q` est donc ≥ au besoin réel : on refuse parfois une
 *    avance qui passerait. C'est le bon sens du risque.
 *  - Elle est OPTIMISTE sur la concurrence entre lignes : chaque ligne est
 *    bornée seule, contre la marge d'avant lissage. Deux lignes peuvent donc
 *    chacune « tenir » dans la même marge. C'est ce que `alertesApresLissage()`
 *    rattrape après coup, en rejouant le jeu de déplacements RETENU.
 *  - Elle ne porte que sur les composants ACHETÉS (décision de l'appelant) : un
 *    sous-ensemble fabriqué se produit, il ne s'attend pas. Sa contrainte
 *    propre redescend sur ses propres achetés, que la projection appelle déjà.
 */

/** Tolérance de comparaison — les quantités traînent du bruit flottant. */
const EPS = 1e-6

/** Entrées et sorties d'un composant sur la fenêtre, à la maille du bucket. */
export interface FluxComposant {
  /** Stock disponible au premier bucket. */
  stockInitial: number
  /** En-cours de fabrication non déclaré — crédité au premier bucket, comme la projection. */
  encours: number
  /** Arrivées attendues par bucket (réceptions d'achat ouvertes). */
  arrivees: number[]
  /** Besoin appelé par bucket, toutes natures — déjà net de la couverture parents. */
  besoin: number[]
}

/**
 * Marge cumulée disponible en fin de chaque bucket.
 *
 * Jamais écrêtée : une valeur négative dit « ce composant manque déjà ici », et
 * c'est exactement l'information qui doit interdire d'avancer quoi que ce soit
 * à travers ce jour-là.
 */
export function margeCumulee(flux: FluxComposant): number[] {
  const n = Math.max(flux.arrivees.length, flux.besoin.length)
  const out = new Array<number>(n).fill(0)
  let cumul = flux.stockInitial + flux.encours
  for (let t = 0; t < n; t++) {
    cumul += (flux.arrivees[t] ?? 0) - (flux.besoin[t] ?? 0)
    out[t] = cumul
  }
  return out
}

/** Besoin d'UNE ligne de commande en UN composant, sur toute sa quantité. */
export interface BesoinComposant {
  article: string
  quantite: number
}

/** Composant qui a effectivement serré la borne d'une ligne. */
export interface ComposantBloquant {
  article: string
  quantite: number
  /** Index du bucket le plus tôt où CE composant laisse passer la quantité. */
  index: number
  /**
   * Le composant est absent de la projection : on ne sait rien de lui, donc on
   * ne bouge pas. Un silence n'est pas une autorisation.
   */
  inconnu: boolean
}

export interface BorneMatiere {
  /** Index du bucket le plus tôt atteignable, matière comprise. */
  index: number
  /** Composants qui ont serré la borne au-delà du plancher demandé. */
  bloquants: ComposantBloquant[]
}

/**
 * Bucket le plus tôt où CE composant laisse passer `quantite`, en remontant
 * depuis `indexActuel − 1`. Borné par `plancher` : on ne cherche pas plus loin
 * que ce que la règle commerciale autorise de toute façon.
 */
function plusTotPourComposant(
  marge: number[],
  indexActuel: number,
  quantite: number,
  plancher: number
): number {
  let t = indexActuel - 1
  while (t >= plancher && (marge[t] ?? Number.NEGATIVE_INFINITY) >= quantite - EPS) t--
  return t + 1
}

/**
 * Borne matière de l'avance d'une ligne.
 *
 * @param indexActuel   Bucket du jour de rattachement actuel de la ligne.
 * @param plancher      Bucket au plus tôt autorisé par la règle commerciale
 *                      (`fenetreDeplacement`) — la matière ne fait que le remonter.
 * @param besoins       Besoins en composants de CETTE ligne (achetés seuls).
 * @param margeParArticle Marge cumulée par composant, même indexation de buckets.
 */
export function borneMatiereAvance(
  indexActuel: number,
  plancher: number,
  besoins: BesoinComposant[],
  margeParArticle: Map<string, number[]>
): BorneMatiere {
  let index = plancher
  const bloquants: ComposantBloquant[] = []
  for (const b of besoins) {
    if (b.quantite <= EPS) continue
    const marge = margeParArticle.get(b.article)
    // Composant hors projection : jamais un feu vert par défaut. Il est déclaré
    // inconnu et cloue la ligne sur sa date — l'écran doit pouvoir le nommer.
    const plusTot = marge
      ? plusTotPourComposant(marge, indexActuel, b.quantite, plancher)
      : indexActuel
    if (plusTot > plancher) {
      bloquants.push({
        article: b.article,
        quantite: b.quantite,
        index: plusTot,
        inconnu: !marge,
      })
    }
    if (plusTot > index) index = plusTot
  }
  // Le plus contraignant d'abord : c'est celui qu'on appelle l'approvisionneur.
  bloquants.sort((a, b) => b.index - a.index || b.quantite - a.quantite)
  return { index: Math.min(index, indexActuel), bloquants }
}

/** Un déplacement retenu par le moteur, vu du côté matière. */
export interface MouvementMatiere {
  deIndex: number
  versIndex: number
  besoins: BesoinComposant[]
}

/** Rupture matière CRÉÉE par le lissage — jamais une rupture préexistante. */
export interface AlerteMatiere {
  article: string
  /** Premier bucket où la marge passe sous zéro alors qu'elle tenait avant. */
  index: number
  /** Ampleur du découvert à ce bucket, en quantité de composant. */
  manque: number
}

/**
 * Contrôle GROUPÉ du jeu de déplacements retenu.
 *
 * `borneMatiereAvance` borne chaque ligne SEULE : deux lignes avancées peuvent
 * donc réserver deux fois la même marge. Plutôt que de prétendre arbitrer entre
 * elles dans la borne (ce qui supposerait de connaître l'ordre des décisions du
 * moteur), on rejoue le plan RETENU sur les marges et on déclare ce qui casse.
 *
 * Un retard rend de la matière sur l'intervalle libéré : il est compté, sinon le
 * contrôle accuserait le lissage d'une tension qu'il vient de desserrer.
 *
 * Seules les ruptures CRÉÉES sont remontées : un composant déjà négatif avant
 * lissage est un sujet d'approvisionnement, pas une conséquence du plan.
 */
export function alertesApresLissage(
  margeParArticle: Map<string, number[]>,
  mouvements: MouvementMatiere[]
): AlerteMatiere[] {
  const apres = new Map<string, number[]>()
  const margeDe = (article: string): number[] | undefined => {
    const base = margeParArticle.get(article)
    if (!base) return undefined
    let copie = apres.get(article)
    if (!copie) {
      copie = [...base]
      apres.set(article, copie)
    }
    return copie
  }

  for (const m of mouvements) {
    if (m.deIndex === m.versIndex) continue
    const avance = m.versIndex < m.deIndex
    const from = Math.min(m.deIndex, m.versIndex)
    const to = Math.max(m.deIndex, m.versIndex) - 1
    for (const b of m.besoins) {
      if (b.quantite <= EPS) continue
      const marge = margeDe(b.article)
      if (!marge) continue
      for (let t = from; t <= to && t < marge.length; t++) {
        marge[t] += avance ? -b.quantite : b.quantite
      }
    }
  }

  const alertes: AlerteMatiere[] = []
  for (const [article, marge] of apres) {
    const base = margeParArticle.get(article)
    if (!base) continue
    for (const [t, valeur] of marge.entries()) {
      if (valeur >= -EPS) continue
      // Déjà négative avant lissage : la rupture ne vient pas du plan.
      if ((base[t] ?? 0) < -EPS) continue
      alertes.push({ article, index: t, manque: Math.round(-valeur * 100) / 100 })
      break
    }
  }
  alertes.sort((a, b) => a.index - b.index || b.manque - a.manque)
  return alertes
}
