import type { ApproDossier, ApproItem, ApproPayload } from '#app/domain/appro'
import { MRP_MESSAGE } from '#app/repositories/appro_repository'

/**
 * Moteur de triage déterministe `/approvisionnements` (issue #103, lot 1).
 *
 * ## Périmètre v1 — signaux CBN seuls
 *
 * #106 laisse ouvert « quels moteurs existants (ruptures, promise-engine, stock)
 * alimentent le score » — cette question implique de savoir, pour chaque article
 * d'achat, s'il couvre un besoin ferme ou un OF critique, ce qu'aucun moteur du
 * board ne rend aujourd'hui pour une ligne `ORDERS` WIPTYP=2. La trancher ici
 * aurait fait de ce lot la vraie feature du lot 2/3 (câblage d'engines).
 *
 * v1 se limite donc à ce que le CBN expose déjà sur la ligne elle-même :
 * échéance, nature du message, décalage proposé. Conforme à « zéro recalcul CBN
 * maison » (#103) : on ne fait QUE prioriser un signal que X3 a déjà produit.
 * Les verdicts qui supposent une chaîne causale (« besoin exposé ferme/OF
 * critique ») restent hors v1, documentés comme tels plutôt qu'approximés.
 *
 * ## Verdicts rendus (sous-ensemble de l'hypothèse #103)
 *
 * - `replanifier` — message avancer/retarder dont le décalage dépasse le seuil
 *   de significativité de #115.
 * - `surveiller` — signal faible : décalage sous le seuil, ou suggestion sans
 *   urgence temporelle connue.
 * - `passer` — suggestion d'achat à échéance proche.
 * - `regrouper` — plusieurs suggestions du même article dans le même dossier
 *   fournisseur : une seule décision d'achat les couvre toutes.
 * - `investiguer` — message « inutile » (annulation) : #115 exige la chaîne
 *   causale avant d'annuler une ressource déjà positionnée, ce que ce lot ne
 *   fournit pas ; ou donnée incohérente (message d'action sans date proposée).
 *
 * Labels non validés en atelier acheteurs AE1 — hypothèse de travail, à
 * confronter aux vrais/faux positifs comme le reste du module.
 */

export type ApproVerdict = 'passer' | 'surveiller' | 'regrouper' | 'replanifier' | 'investiguer'

export interface ApproTriageResult {
  cle: string
  verdict: ApproVerdict
  /** Urgence temporelle : 0 (lointain/inconnu), 100 à l'échéance, au-delà quand elle est dépassée. Axe de tri, pas le verdict. */
  score: number
  preuves: string[]
}

/** Seuil de significativité d'un décalage de replanif — #115, provisoire (confirmation attendue de #129). */
const DELTA_ACTIONNABLE_JOURS = 2

/** Échéance en jours en-deçà de laquelle une suggestion d'achat est jugée urgente — hypothèse v1, non arbitrée en atelier. */
const SUGGESTION_URGENTE_JOURS = 7

/**
 * Score d'urgence temporelle. Une échéance dépassée (`jours` négatif) rend un
 * score au-dessus de 100 plutôt que d'être plafonnée : le tri doit distinguer
 * « dépassée de 2 jours » de « dépassée de 3 semaines ».
 */
function scoreUrgence(jours: number | null): number {
  if (jours === null) return 0
  return Math.max(0, 100 - jours * 2)
}

function triageMessage(item: ApproItem): ApproTriageResult {
  const score = scoreUrgence(item.jours)

  if (item.message === MRP_MESSAGE.INUTILE) {
    return {
      cle: item.cle,
      verdict: 'investiguer',
      score,
      preuves: [
        `Message CBN « Inutile » (annuler) sur ${item.article} — chaîne causale requise avant d'annuler une ressource déjà positionnée (#115), non disponible en v1.`,
      ],
    }
  }

  if (item.decalage === null) {
    const cause =
      item.echeance === null
        ? 'échéance absente'
        : item.dateProposee === null
          ? 'date proposée absente'
          : 'décalage incalculable'
    return {
      cle: item.cle,
      verdict: 'investiguer',
      score,
      preuves: [
        `Message d'action (avancer/retarder) sur ${item.article} sans décalage exploitable (${cause}) — donnée incohérente.`,
      ],
    }
  }

  const decalageAbs = Math.abs(item.decalage)
  if (decalageAbs >= DELTA_ACTIONNABLE_JOURS) {
    // Sens porté par le signe du décalage (appro.ts : négatif = avancer), plus
    // actionnable pour l'acheteur que la seule magnitude.
    const sens = item.decalage < 0 ? 'Avancer' : 'Retarder'
    return {
      cle: item.cle,
      verdict: 'replanifier',
      score,
      preuves: [
        `${sens} de ${decalageAbs} j (seuil actionnable #115 : ${DELTA_ACTIONNABLE_JOURS} j) sur ${item.article}.`,
      ],
    }
  }

  return {
    cle: item.cle,
    verdict: 'surveiller',
    score,
    preuves: [
      `Décalage de ${decalageAbs} j, sous le seuil actionnable de ${DELTA_ACTIONNABLE_JOURS} j (#115) — contexte de dossier.`,
    ],
  }
}

function triageSuggestion(item: ApproItem, nbAvecMemeArticle: number): ApproTriageResult {
  const score = scoreUrgence(item.jours)

  if (nbAvecMemeArticle > 1) {
    return {
      cle: item.cle,
      verdict: 'regrouper',
      score,
      preuves: [
        `${nbAvecMemeArticle} suggestions de ${item.article} dans le même dossier fournisseur — une décision d'achat les couvre toutes.`,
      ],
    }
  }

  if (item.jours !== null && item.jours <= SUGGESTION_URGENTE_JOURS) {
    return {
      cle: item.cle,
      verdict: 'passer',
      score,
      preuves: [
        item.jours >= 0
          ? `Échéance à J+${item.jours} sur ${item.article}.`
          : `Échéance dépassée de ${-item.jours} j sur ${item.article}.`,
      ],
    }
  }

  return {
    cle: item.cle,
    verdict: 'surveiller',
    score,
    preuves:
      item.jours === null
        ? [`Aucune échéance connue sur ${item.article}.`]
        : [
            `Échéance à J+${item.jours}, au-delà du seuil d'urgence de ${SUGGESTION_URGENTE_JOURS} j.`,
          ],
  }
}

/** Triage un dossier fournisseur : un résultat par item, dans l'ordre du dossier. */
export function triageDossier(dossier: ApproDossier): ApproTriageResult[] {
  // Comptage borné aux SUGGESTIONS : un message de replanification partageant
  // l'article d'une suggestion (même dossier fournisseur, aucun rapport entre
  // les deux) ne doit pas la faire ressortir « regrouper » à tort.
  const nbParArticle = new Map<string, number>()
  for (const item of dossier.items) {
    if (item.nature !== 'suggestion') continue
    nbParArticle.set(item.article, (nbParArticle.get(item.article) ?? 0) + 1)
  }

  return dossier.items.map((item) =>
    item.nature === 'message'
      ? triageMessage(item)
      : triageSuggestion(item, nbParArticle.get(item.article) ?? 1)
  )
}

/** Triage l'ensemble du payload. Clé = `ApproItem.cle`, unique par construction (#106 : `S:`/`M:` préfixés). */
export function triagePayload(payload: ApproPayload): Map<string, ApproTriageResult> {
  const resultats = new Map<string, ApproTriageResult>()
  for (const dossier of payload.dossiers) {
    for (const resultat of triageDossier(dossier)) {
      resultats.set(resultat.cle, resultat)
    }
  }
  return resultats
}

/**
 * Rattache le verdict de triage à chaque item du payload, par clé d'affichage.
 *
 * Pur et non mutatif : renvoie un NOUVEAU payload (même structure, items
 * enrichis de `triage`) — le payload brut reste utilisable sans verdict pour
 * les consommateurs qui n'en veulent pas (tests, export).
 */
export function attacheTriage(payload: ApproPayload): ApproPayload {
  const triages = triagePayload(payload)
  return {
    ...payload,
    dossiers: payload.dossiers.map((dossier) => ({
      ...dossier,
      items: dossier.items.map((item) => ({
        ...item,
        triage: triages.get(item.cle) ?? null,
      })),
    })),
  }
}
