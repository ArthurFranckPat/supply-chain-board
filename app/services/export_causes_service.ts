import { ExportCausesRepository } from '#app/repositories/export_causes_repository'
import { reconstituerCause } from '#app/domain/export_delay_causes'
import type { CauseReconstituee } from '#app/domain/export_delay_causes'
import { OtdRepository, resolveSemainePrecedente } from '#app/repositories/otd_repository'
import type { EtatExportLigne, EtatExportSemaine } from '#app/repositories/otd_repository'

/**
 * Attache une cause reconstituée à chaque ligne export en retard.
 *
 * Partagé par la commande `otd:hebdo` et par la rédaction du mail du lundi :
 * les deux doivent proposer exactement la même cause pour la même ligne.
 */
/** Clé d'une ligne dans la table des causes : commande + article + date due. */
export function cleLigne(l: EtatExportLigne): string {
  return `${l.numCommande}|${l.article}|${l.dateAcceptee?.toISOString().slice(0, 10) ?? ''}`
}

/**
 * Attache une cause à chaque ligne en retard. Une seule requête STOJOU pour
 * tous les articles : le coût ZSOAPSQL se paie par appel, pas par ligne rendue.
 */
export async function reconstituerCauses(
  retards: EtatExportLigne[]
): Promise<Map<string, CauseReconstituee>> {
  const causes = new Map<string, CauseReconstituee>()
  if (retards.length === 0) return causes

  const dues = retards
    .map((l) => (l.dateLimite ?? l.dateAcceptee)?.getTime())
    .filter((t): t is number => typeof t === 'number')
  if (dues.length === 0) return causes

  // Marge amont : l'entrée en stock qui explique le retard peut précéder de peu
  // la date due (marchandise arrivée la veille mais trop tard pour le camion).
  const from = new Date(Math.min(...dues) - 15 * 86_400_000)
  const to = new Date()

  const mouvements = await new ExportCausesRepository().getMouvements(
    retards.map((l) => l.article),
    from,
    to
  )

  for (const ligne of retards) {
    const cause = reconstituerCause(ligne, mouvements)
    if (cause) causes.set(cleLigne(ligne), cause)
  }
  return causes
}

export interface EtatExportComplet {
  etat: EtatExportSemaine
  /** Lignes en retard, de la plus profonde à la moins profonde. */
  retards: EtatExportLigne[]
  causes: Map<string, CauseReconstituee>
}

/**
 * Construit l'état complet d'une semaine : lignes dues, verdicts, causes.
 *
 * `recul` = 1 pour la semaine dernière, 2 pour celle d'avant, etc. Point
 * d'entrée unique — la commande ace, le script `bin/etat_export.ts` et la
 * future rédaction du mail passent tous par ici, sinon ils finiraient par
 * diverger.
 */
export async function construireEtatExport(recul: number = 1): Promise<EtatExportComplet> {
  const semaines = Math.max(1, recul)
  const ref = new Date(Date.now() - (semaines - 1) * 7 * 86_400_000)
  const { from, to } = resolveSemainePrecedente(ref)

  const etat = await new OtdRepository().getEtatExport(from, to)
  const retards = etat.lignes
    .filter((l) => l.statut !== 'ponctuel')
    .sort((a, b) => b.joursRetard - a.joursRetard)
  const causes = await reconstituerCauses(retards)

  return { etat, retards, causes }
}

function jjmmaaaa(d: Date | null): string {
  if (!d) return '—'
  const j = String(d.getUTCDate()).padStart(2, '0')
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${j}/${m}/${d.getUTCFullYear()}`
}

/**
 * Rendu texte de l'état, en français, dates en jj/mm/aaaa. Sert la console ;
 * le rendu HTML du mail s'appuiera sur les mêmes données, pas sur ce texte.
 */
export function formaterEtatTexte({ etat, retards, causes }: EtatExportComplet): string[] {
  const lignes: string[] = [
    `État commandes export — semaine ${etat.isoSemaine}/${etat.isoAnnee} ` +
      `(du ${jjmmaaaa(etat.du)} au ${jjmmaaaa(etat.au)})`,
    `${etat.nbDues} lignes dues · ${etat.nbPonctuelles} ponctuelles · ` +
      `${etat.tauxPonctualite} % · ${retards.length} en retard`,
  ]

  if (etat.nbDues === 0) {
    lignes.push('', 'Aucune ligne export due sur cette semaine.')
    return lignes
  }

  if (retards.length === 0) {
    lignes.push('', 'Aucun retard : toutes les lignes dues sont parties à temps.')
  }

  for (const l of retards) {
    const cause = causes.get(cleLigne(l))
    const etatLigne =
      l.statut === 'retard_ouvert' ? 'jamais expédiée' : `expédiée le ${jjmmaaaa(l.dateReelle)}`
    lignes.push(
      '',
      `${l.pays} · ${l.client} · ${l.numCommande} · ${l.article} (${l.designation})`,
      `  due le ${jjmmaaaa(l.dateAcceptee)}, ${etatLigne} — ${l.joursRetard} j de retard, ` +
        `${l.qteLivree}/${l.qteCommandee}`,
      cause
        ? `  cause : [${cause.categorie}] ${cause.explication}` +
            (cause.confiance === 'moyenne' ? ' (à confirmer)' : '')
        : '  cause : NON DOCUMENTÉE — à saisir'
    )
    if (l.delaiNegocie) {
      lignes.push(
        `  note : date demandée le ${jjmmaaaa(l.dateDemandee)}, acceptée le ${jjmmaaaa(l.dateAcceptee)} — délai déjà négocié.`
      )
    }
  }

  const negociesPonctuels = etat.lignes.filter((l) => l.delaiNegocie && l.statut === 'ponctuel')
  if (negociesPonctuels.length > 0) {
    lignes.push(
      '',
      `${negociesPonctuels.length} ligne(s) ponctuelles au sens de l'engagement, mais dont le client ` +
        `attendait plus tôt :`
    )
    for (const l of negociesPonctuels) {
      lignes.push(
        `  ${l.pays} ${l.numCommande} ${l.article} : demandée le ${jjmmaaaa(l.dateDemandee)}, ` +
          `acceptée le ${jjmmaaaa(l.dateAcceptee)}`
      )
    }
  }

  return lignes
}
