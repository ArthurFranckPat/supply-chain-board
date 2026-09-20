/**
 * Plan de lissage d'un poste, vu de l'écran.
 *
 * Miroir exact de `PlanLissagePoste` (`app/services/load_smoothing_builder.ts`).
 * Tout arrive calculé et rédigé : aucune règle de mobilité, aucune fenêtre de
 * déplacement, aucun motif n'est rejoué ici. Le périmètre ALDES ne doit vivre
 * qu'à un seul endroit — celui qui décide est aussi celui qui explique.
 *
 * ── Pourquoi ces types vivent dans `lib/` et non dans le composant ──────────
 * Le plan est lu à DEUX endroits du panneau de détail : le bandeau de lissage,
 * qui porte les totaux et l'action de lot, et les lignes de la table, qui
 * portent la proposition de chaque ligne de commande. Les deux doivent
 * s'accorder sur la même clé (`cleLigne`) et sur la même façon de situer une
 * date hors de la semaine ouverte, sinon une ligne peut être annoncée partante
 * d'un côté et absente de l'autre.
 */

/** Mobilité de la date d'une ligne, tranchée serveur (`load_smoothing.ts`). */
export type Mobilite = 'deplacable' | 'ferme'

/** Déplacement proposé, prêt à afficher — aucune règle à rejouer côté écran. */
export interface DeplacementLisible {
  numCommande: string
  ligne: string
  article: string
  designation: string | null
  client: string | null
  clientCode: string | null
  mobilite: Mobilite
  motifMobilite: string
  heures: number
  dateActuelleIso: string
  dateActuelle: string
  dateProposeeIso: string
  dateProposee: string
  sens: 'avance' | 'retard'
  /** Amplitude en jours OUVRÉS du poste, pas en jours calendaires. */
  joursOuvres: number
}

/** Composant qui empêche une ligne d'être avancée autant que la règle le permettrait. */
export interface ComposantBloquant {
  article: string
  designation: string | null
  quantite: number
  disponibleLeIso: string
  disponibleLe: string
  /** Composant absent de la projection : on ne sait rien, donc on ne bouge pas. */
  inconnu: boolean
}

/** Ligne dont l'avance a été rognée par la matière. */
export interface AvanceLimiteeMatiere {
  numCommande: string
  ligne: string
  article: string
  designation: string | null
  client: string | null
  clientCode: string | null
  heures: number
  dateActuelleIso: string
  dateActuelle: string
  auPlusTotSansMatiereIso: string
  auPlusTotSansMatiere: string
  auPlusTotIso: string
  auPlusTot: string
  joursOuvresPerdus: number
  composants: ComposantBloquant[]
  /** Le plan final laisse-t-il cette ligne sur sa date d'origine ? */
  resteeSurPlace: boolean
}

/** Rupture matière que le plan CRÉERAIT (distincte d'une rupture préexistante). */
export interface AlerteMatiere {
  article: string
  designation: string | null
  dateIso: string
  date: string
  manque: number
}

/** Profil d'un jour de l'horizon, avant et après le plan proposé. */
export interface ProfilJourLissage {
  dateIso: string
  capaciteH: number
  heuresAvant: number
  heuresApres: number
  /** Saturation en fraction (1 = 100 %). `null` quand le poste est fermé. */
  saturationAvant: number | null
  saturationApres: number | null
}

export interface PlanLissagePoste {
  poste: { code: string; label: string }
  horizon: { debutIso: string; finIso: string; semaines: number; joursOuvres: number }
  plan: {
    deplacements: {
      numCommande: string
      ligne: string
      heures: number
      deIso: string
      versIso: string
      sens: 'avance' | 'retard'
      joursOuvres: number
    }[]
    profil: ProfilJourLissage[]
    depassementAvantH: number
    depassementApresH: number
    ecartAvantH: number
    ecartApresH: number
    lignesIgnorees: { numCommande: string; ligne: string; dateIso: string }[]
  }
  deplacements: DeplacementLisible[]
  borneMatiere: {
    maille: 'jour' | 'semaine'
    lignesLimitees: number
    lignes: AvanceLimiteeMatiere[]
    alertes: AlerteMatiere[]
    /** Limites de la borne, rédigées serveur — affichées telles quelles. */
    avertissements: string[]
  }
  x3Error: string | null
}

/**
 * Clé d'une ligne de commande — MÊME convention que les overrides de date et
 * que `cleLigne()` du builder. Deux conventions, et une ligne repositionnée
 * dans un bloc serait introuvable dans l'autre.
 */
export const cleLigne = (numCommande: string | null, ligne: string | null): string =>
  `${numCommande ?? ''}#${ligne ?? ''}`

/** Lundi (ISO) de la semaine qui contient `iso`. Découpage de chaîne, pas de fuseau. */
function lundiDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Situe une date par rapport à la semaine ouverte dans le panneau.
 *
 * Le moteur travaille sur trois semaines, le panneau n'en montre qu'une : une
 * ligne peut donc être proposée à une date que l'écran ne contient pas. Une
 * ligne qui s'évaporerait de la table serait le pire résultat possible de cet
 * outil — sa destination doit être datée ET située, toujours.
 *
 * Rend `null` quand la date tombe dans la semaine ouverte : il n'y a alors rien
 * à situer, et un « cette semaine » redondant alourdirait chaque ligne.
 */
export function situationSemaine(iso: string, lundiSemaineOuverte: string): string | null {
  const lundi = lundiDe(iso)
  if (lundi === lundiSemaineOuverte) return null
  const a = new Date(`${lundi}T00:00:00`)
  const b = new Date(`${lundiSemaineOuverte}T00:00:00`)
  const semaines = Math.round((a.getTime() - b.getTime()) / (7 * 86_400_000))
  if (semaines === 1) return 'semaine suivante'
  if (semaines === -1) return 'semaine précédente'
  if (semaines > 1) return `dans ${semaines} semaines`
  return `il y a ${Math.abs(semaines)} semaines`
}

/** Répartition d'un plan vis-à-vis de la semaine affichée. */
export interface DeplacementsSemaine {
  /** Part et arrive dans la semaine ouverte. */
  internes: DeplacementLisible[]
  /** Quitte la semaine ouverte — sa destination doit être datée et située. */
  sortantes: DeplacementLisible[]
  /** Arrive d'une autre semaine de l'horizon — elle doit apparaître ici aussi. */
  entrantes: DeplacementLisible[]
  /**
   * Déplacements entièrement étrangers à la semaine ouverte (semaine 2 → 3, par
   * exemple). Ils ne changent RIEN au profil affiché : ils ne sont ni montrés,
   * ni appliqués par le lot — mais leur nombre est annoncé, parce qu'un plan
   * dont une partie reste invisible ne doit pas se présenter comme entier.
   */
  horsSemaine: DeplacementLisible[]
}

export function repartirParSemaine(
  deplacements: DeplacementLisible[],
  fromIso: string,
  toIso: string
): DeplacementsSemaine {
  const dedans = (iso: string) => iso >= fromIso && iso <= toIso
  const out: DeplacementsSemaine = {
    internes: [],
    sortantes: [],
    entrantes: [],
    horsSemaine: [],
  }
  for (const d of deplacements) {
    const de = dedans(d.dateActuelleIso)
    const vers = dedans(d.dateProposeeIso)
    if (de && vers) out.internes.push(d)
    else if (de) out.sortantes.push(d)
    else if (vers) out.entrantes.push(d)
    else out.horsSemaine.push(d)
  }
  return out
}

/** Somme d'heures — un total de décision se lit toujours en heures de poste. */
export const sommeHeures = (rows: { heures: number }[]): number =>
  Math.round(rows.reduce((a, r) => a + r.heures, 0) * 10) / 10
