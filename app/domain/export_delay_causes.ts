/**
 * Reconstitution post-mortem de la cause d'un retard d'expédition export.
 *
 * Le moteur de rupture lit le PRÉSENT : une ligne livrée en retard la semaine
 * dernière n'a plus de manque aujourd'hui, il ne dira rien. La seule trace qui
 * survit est le journal de stock (STOJOU) de l'article, entre la date due et
 * l'expédition. Ce module ne fait que le lire — aucun appel X3 ici.
 *
 * Prérequis non négociable (issue #88) : les mouvements reçus doivent être
 * NETTÉS PAR DOCUMENT. STOJOU est un journal d'écritures, pas d'événements :
 * reclassements et contrepassations s'y écrivent en paires ±X qui feraient
 * voir des entrées de marchandise qui n'ont jamais eu lieu.
 */

/** Catégories fermées — voir le skill `etat-commandes-export`. */
export type CategorieCause =
  | 'PRODUCTION'
  | 'APPRO'
  | 'CAPACITE'
  | 'QUALITE_CQ'
  | 'TRANSPORT'
  | 'COMMANDE_TARDIVE'
  | 'DELAI_COMMERCIAL'
  | 'CLIENT'
  | 'AUTRE'

/** Types de mouvement STOJOU utilisés ici (convention établie du projet). */
export const TRSTYP = {
  RECEPTION_FOURNISSEUR: 3,
  LIVRAISON_CLIENT: 4,
  ENTREE_OF: 5,
  SORTIE_OF: 6,
  RECLASSEMENT_EMPLACEMENT: 7,
  CHANGEMENT_STATUT_QUALITE: 8,
} as const

export interface MouvementStock {
  article: string
  jour: Date
  /** Quantité NETTE du document (issue #88). */
  quantite: number
  type: number
}

export interface LignePourCause {
  article: string
  /** Fin de tolérance : au-delà, la ligne est en retard. */
  dateLimite: Date | null
  dateAcceptee: Date | null
  dateDemandee: Date | null
  dateCommande: Date | null
  /** Expédition réelle, `null` si la ligne n'est jamais partie. */
  dateReelle: Date | null
  qteCommandee: number
  qteLivree: number
  delaiNegocie: boolean
}

export interface CauseReconstituee {
  categorie: CategorieCause
  /** Phrase prête à figurer dans le mail, en français, dates en jj/mm/aaaa. */
  explication: string
  /**
   * `haute` : la trace prouve la cause (une entrée de marchandise datée après
   * la date due). `moyenne` : le faisceau est cohérent mais un humain doit
   * confirmer — c'est une proposition, jamais un verdict.
   */
  confiance: 'haute' | 'moyenne'
}

const JOUR_MS = 86_400_000

function fmt(d: Date | null): string {
  if (!d) return '—'
  const j = String(d.getUTCDate()).padStart(2, '0')
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${j}/${m}/${d.getUTCFullYear()}`
}

/** Entrées de marchandise (production ou achat) strictement postérieures à une date. */
function entreesApres(mouvements: MouvementStock[], borne: Date): MouvementStock[] {
  return mouvements
    .filter(
      (m) =>
        m.quantite > 0 &&
        (m.type === TRSTYP.ENTREE_OF || m.type === TRSTYP.RECEPTION_FOURNISSEUR) &&
        m.jour.getTime() > borne.getTime()
    )
    .sort((a, b) => a.jour.getTime() - b.jour.getTime())
}

/**
 * Propose une cause, ou `null` quand rien dans les traces ne permet de conclure
 * — auquel cas la ligne doit être posée à l'humain, pas devinée.
 *
 * Ordre des règles : du plus probant (une date d'entrée en stock) au plus
 * circonstanciel. La première qui matche gagne.
 */
export function reconstituerCause(
  ligne: LignePourCause,
  mouvements: MouvementStock[]
): CauseReconstituee | null {
  const due = ligne.dateLimite ?? ligne.dateAcceptee
  if (!due) return null

  const propres = mouvements.filter((m) => m.article === ligne.article)
  const fin = ligne.dateReelle ?? new Date()

  // 1. La marchandise n'existait pas à temps : elle est entrée en stock le jour
  //    de la date due ou après. C'est la seule cause que la trace PROUVE.
  //
  //    La comparaison se fait sur la date DUE, pas sur la fin de tolérance :
  //    une marchandise produite le jour même de l'expédition prévue est déjà
  //    trop tard pour le camion, même si la tolérance court encore.
  const reference = ligne.dateAcceptee ?? due
  const entrees = entreesApres(propres, new Date(reference.getTime() - JOUR_MS)).filter(
    (m) => m.jour.getTime() <= fin.getTime()
  )
  const premiere = entrees[0]
  if (premiere) {
    const estAchat = premiere.type === TRSTYP.RECEPTION_FOURNISSEUR
    const jours = Math.round((premiere.jour.getTime() - reference.getTime()) / JOUR_MS)
    const leJourMeme = jours <= 0
    const quand = leJourMeme
      ? `le jour même de la date due (${fmt(premiere.jour)})`
      : `le ${fmt(premiere.jour)}, soit ${jours} j après la date due`
    return {
      categorie: estAchat ? 'APPRO' : 'PRODUCTION',
      explication: estAchat
        ? `Marchandise reçue du fournisseur ${quand}.`
        : `Produite ${quand}${leJourMeme ? ' — trop tard pour le départ prévu' : ''}.`,
      confiance: leJourMeme ? 'moyenne' : 'haute',
    }
  }

  // 2. Rien n'est entré : la marchandise existait déjà. Un changement de statut
  //    qualité entre la date due et l'expédition explique alors la rétention.
  const qualite = propres.find(
    (m) =>
      m.type === TRSTYP.CHANGEMENT_STATUT_QUALITE &&
      m.jour.getTime() >= due.getTime() &&
      m.jour.getTime() <= fin.getTime()
  )
  if (qualite) {
    return {
      categorie: 'QUALITE_CQ',
      explication: `Stock disponible avant la date due, mais changement de statut qualité le ${fmt(qualite.jour)} — marchandise retenue en contrôle.`,
      confiance: 'moyenne',
    }
  }

  // 3. Livraison partielle : le reste est parti, une partie non. Le « pourquoi »
  //    du reliquat reste à documenter, mais le constat est certain.
  if (ligne.qteLivree > 0 && ligne.qteLivree < ligne.qteCommandee) {
    return {
      categorie: 'AUTRE',
      explication: `Livraison partielle : ${ligne.qteLivree} sur ${ligne.qteCommandee}. Reliquat de ${ligne.qteCommandee - ligne.qteLivree} à expliquer.`,
      confiance: 'moyenne',
    }
  }

  // 4. Le délai avait déjà été négocié à la commande : le retard industriel
  //    s'ajoute à un décalage commercial antérieur.
  if (ligne.delaiNegocie && ligne.dateDemandee && ligne.dateAcceptee) {
    const ecart = Math.round(
      (ligne.dateAcceptee.getTime() - ligne.dateDemandee.getTime()) / JOUR_MS
    )
    return {
      categorie: 'DELAI_COMMERCIAL',
      explication: `Date demandée le ${fmt(ligne.dateDemandee)}, acceptée le ${fmt(ligne.dateAcceptee)} : ${ecart} j de délai négocié avant même ce retard.`,
      confiance: 'moyenne',
    }
  }

  // 5. Ligne jamais partie et rien n'est entré en stock depuis la date due :
  //    la marchandise n'a tout simplement jamais été mise à disposition. On ne
  //    dit pas POURQUOI (production, appro, arbitrage) — seulement ce que la
  //    trace montre.
  if (!ligne.dateReelle) {
    return {
      categorie: 'PRODUCTION',
      explication: `Toujours pas expédiée : aucune entrée en stock depuis la date due du ${fmt(due)}. Marchandise jamais mise à disposition.`,
      confiance: 'moyenne',
    }
  }

  // 6. La marchandise était là, rien ne la retenait : le retard s'est joué
  //    entre le quai et le camion.
  if (ligne.dateReelle && propres.length > 0) {
    return {
      categorie: 'TRANSPORT',
      explication: `Stock disponible à la date due, expédié le ${fmt(ligne.dateReelle)} — retard pris à l'expédition (départ groupé ou capacité de quai).`,
      confiance: 'moyenne',
    }
  }

  return null
}
