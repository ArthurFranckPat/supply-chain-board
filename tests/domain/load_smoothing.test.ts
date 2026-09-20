import { test } from '@japa/runner'
import {
  fenetreDeplacement,
  lisserCharge,
  mobiliteDeLigne,
  type JourCapacite,
  type LigneLissage,
} from '#app/domain/load_smoothing'

/**
 * Ces tests verrouillent les règles MÉTIER du lissage, pas l'algorithme : le
 * moteur a le droit de changer de stratégie de recherche, jamais de retarder une
 * ligne export ni de couper une ligne en deux.
 *
 * Le cas de référence est réel, mesuré sur `PP_091` (« LIGNE EMBALLAGE EAR »),
 * semaine du 28/09/2026 : capacité X3 7,5 h/j du lundi au vendredi, 41,3 h de
 * reste à produire, et un lundi à 20,5 h — 273 % de la journée. Le CBN a posé
 * ces ordres sur le seul temps de gamme, sans jamais regarder ce que la ligne
 * peut absorber dans une journée.
 */

const LUN = '2026-09-28'
const MAR = '2026-09-29'
const MER = '2026-09-30'
const JEU = '2026-10-01'
const VEN = '2026-10-02'
const SEMAINE = [LUN, MAR, MER, JEU, VEN]

/** Semaine type du poste : cinq jours à 7,5 h, samedi et dimanche fermés. */
const joursPP091 = (): JourCapacite[] => SEMAINE.map((dateIso) => ({ dateIso, capaciteH: 7.5 }))

/**
 * Fabrique une ligne avec sa fenêtre calculée par les règles métier — c'est
 * l'appelant qui la calcule en production, on fait ici exactement pareil pour
 * que le test ne verrouille pas une fenêtre écrite à la main.
 */
function ligne(
  numCommande: string,
  clientCode: string | null,
  dateIso: string,
  heures: number
): LigneLissage {
  const m = mobiliteDeLigne(clientCode)
  const f = fenetreDeplacement(dateIso, m, SEMAINE)
  return {
    numCommande,
    ligne: '1000',
    heures,
    dateIso,
    auPlusTotIso: f.auPlusTotIso,
    auPlusTardIso: f.auPlusTardIso,
    export: m.export,
  }
}

const ALDES = '80001'
const EXPORT_PL = '41200'

/**
 * Le lundi mesuré : 11,4 h ALDES + 9,1 h export = 20,5 h. La décomposition en
 * lignes est plausible plutôt qu'historique — ce qui est réel, ce sont les
 * totaux par jour et le partage ALDES / export dont le métier a fait le constat.
 */
const semainePP091 = (): LigneLissage[] => [
  ligne('C-ALD-1', ALDES, LUN, 4.2),
  ligne('C-ALD-2', ALDES, LUN, 3.6),
  ligne('C-ALD-3', ALDES, LUN, 3.6),
  ligne('C-EXP-1', EXPORT_PL, LUN, 9.1),
  ligne('C-EXP-2', EXPORT_PL, MAR, 7.3),
  ligne('C-EXP-3', EXPORT_PL, MER, 7.6),
  ligne('C-ALD-4', ALDES, JEU, 4.5),
  ligne('C-ALD-5', ALDES, VEN, 1.4),
]

test.group('load_smoothing — règles de mobilité', () => {
  test('ALDES S.A. est le seul client déplaçable, et le seul déplaçable vers l’aval', ({
    assert,
  }) => {
    // Pourquoi : 80001 est le client France. Des camions partent tous les jours
    // vers la plateforme, donc ses dates ont de la latitude. Tous les autres
    // sont des exports à départ hebdomadaire contractuel.
    const aldes = mobiliteDeLigne(ALDES)
    assert.equal(aldes.mobilite, 'deplacable')
    assert.isFalse(aldes.export)

    const exp = mobiliteDeLigne(EXPORT_PL)
    assert.equal(exp.mobilite, 'ferme')
    assert.isTrue(exp.export)
  })

  test('une prévision n’est pas déplaçable : il n’y a pas de ligne à re-dater', ({ assert }) => {
    // Pourquoi : X3 ne porte pas de tiers sur une prévision. Re-dater une
    // prévision ne produit aucun effet réel — ce n'est pas une décision.
    assert.equal(mobiliteDeLigne(null).mobilite, 'ferme')
    assert.isFalse(mobiliteDeLigne(null).export)
  })

  test('la fenêtre vaut −10 jours ouvrés / +5 pour ALDES, −10 / 0 pour l’export', ({ assert }) => {
    // Pourquoi : la borne aval de l'export est CONTRACTUELLE. Une fenêtre qui
    // dépasserait d'un jour, c'est un camion raté.
    const quinzaine = [
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      LUN,
      MAR,
      MER,
      JEU,
      VEN,
    ]
    const a = fenetreDeplacement(LUN, mobiliteDeLigne(ALDES), quinzaine)
    // Dix jours ouvrés avant le lundi 28/09 = le lundi 14/09 ; cinq après = 05/10,
    // hors liste, donc ramené au dernier jour connu.
    assert.equal(a.auPlusTotIso, '2026-09-14')
    assert.equal(a.auPlusTardIso, VEN)

    const e = fenetreDeplacement(LUN, mobiliteDeLigne(EXPORT_PL), quinzaine)
    assert.equal(e.auPlusTotIso, '2026-09-14')
    assert.equal(e.auPlusTardIso, LUN)
  })
})

test.group('load_smoothing — moteur', () => {
  test('PP_091 : le pic du lundi tombe, et seules des lignes ALDES bougent', ({ assert }) => {
    // Pourquoi : le pic est un artefact du jalonnement à capacité infinie du CBN,
    // pas un fait de production. Le premier rang de l'objectif est d'annuler les
    // dépassements — ici 20,5 h posées sur une journée de 7,5 h.
    const plan = lisserCharge(semainePP091(), joursPP091())

    const lundi = plan.profil.find((p) => p.dateIso === LUN)!
    assert.closeTo(lundi.heuresAvant, 20.5, 0.001)
    assert.closeTo(lundi.saturationAvant!, 2.73, 0.01)

    // Le lundi conserve ses 9,1 h export (intouchables vers l'aval, et déjà au
    // premier jour de l'horizon donc inavançables) : 121 % au lieu de 273 %.
    assert.closeTo(lundi.heuresApres, 9.1, 0.001)
    assert.closeTo(lundi.saturationApres!, 1.21, 0.01)

    // Aucune ligne export n'a bougé.
    const numsDeplaces = plan.deplacements.map((d) => d.numCommande)
    assert.isEmpty(numsDeplaces.filter((n) => n.startsWith('C-EXP')))

    // Le dépassement total baisse franchement. Il ne peut pas tomber à zéro :
    // 41,3 h de charge pour 37,5 h de capacité, il reste 3,8 h par construction.
    assert.isBelow(plan.depassementApresH, plan.depassementAvantH)
    assert.isAtLeast(plan.depassementApresH, 3.8)
    assert.isBelow(plan.ecartApresH, plan.ecartAvantH)

    // La charge totale est conservée : on déplace, on ne crée ni ne détruit.
    const avant = plan.profil.reduce((a, p) => a + p.heuresAvant, 0)
    const apres = plan.profil.reduce((a, p) => a + p.heuresApres, 0)
    assert.closeTo(apres, avant, 0.001)
  })

  test('INVARIANT : jamais une ligne export vers l’aval, même fenêtre fausse', ({ assert }) => {
    // Pourquoi : la date d'une ligne export est contractuelle, un départ
    // hebdomadaire est déjà réservé. Une régression ici coûte un client — le
    // moteur refuse donc l'aval même si l'appelant lui passe une fenêtre qui
    // l'autorise (fenêtre mal calculée en amont, données bricolées).
    const lignes: LigneLissage[] = [
      // Fenêtre volontairement fausse : elle ouvre jusqu'au vendredi.
      {
        numCommande: 'C-EXP-PIEGE',
        ligne: '1000',
        heures: 20,
        dateIso: LUN,
        auPlusTotIso: LUN,
        auPlusTardIso: VEN,
        export: true,
      },
    ]
    const plan = lisserCharge(lignes, joursPP091())
    assert.isEmpty(plan.deplacements)
    assert.closeTo(plan.profil.find((p) => p.dateIso === LUN)!.heuresApres, 20, 0.001)
  })

  test('une ligne n’est jamais coupée : elle déborde du jour, elle ne se partage pas', ({
    assert,
  }) => {
    // Pourquoi : couper une ligne créerait l'entrelacement qu'on veut interdire
    // (un ordre entamé, abandonné, repris plus tard). Une ligne de 8,4 h sur une
    // journée de 7,5 h déborde sur le lendemain et s'y termine — conséquence
    // acceptée, pas décision à prendre.
    const lignes = [ligne('C-ALD-GROS', ALDES, LUN, 8.4)]
    const plan = lisserCharge(lignes, joursPP091())

    // Aucun jour ne reçoit une fraction de la ligne : la somme du profil vaut
    // 8,4 h et un seul jour est chargé.
    const charges = plan.profil.filter((p) => p.heuresApres > 0)
    assert.lengthOf(charges, 1)
    assert.closeTo(charges[0]!.heuresApres, 8.4, 0.001)
    // Et la ligne apparaît au plus une fois dans les déplacements.
    assert.isAtMost(plan.deplacements.filter((d) => d.numCommande === 'C-ALD-GROS').length, 1)
  })

  test('un déplacement qui n’améliore rien n’est pas proposé', ({ assert }) => {
    // Pourquoi : chaque déplacement se négocie avec un client. Proposer un
    // re-datage pour gagner six minutes d'écart-type ferait perdre confiance
    // dans tout l'outil.
    const lignes = SEMAINE.map((d, i) => ligne(`C-ALD-${i}`, ALDES, d, 7))
    const plan = lisserCharge(lignes, joursPP091())
    assert.isEmpty(plan.deplacements)
    assert.equal(plan.depassementApresH, 0)
  })

  test('un jour fermé ne reçoit jamais de charge', ({ assert }) => {
    // Pourquoi : la sentinelle X3 des jours chômés vaut 0,01 h et non 0 — la
    // capacité arrive donc ici déjà normalisée à 0 par `capDay`/`isOpenDay`.
    // Proposer une date un jour où la ligne ne tourne pas est une proposition
    // fausse, pas une approximation.
    const jours: JourCapacite[] = [
      { dateIso: LUN, capaciteH: 7.5 },
      { dateIso: MAR, capaciteH: 0 },
      { dateIso: MER, capaciteH: 7.5 },
    ]
    const semaine = [LUN, MER]
    const l: LigneLissage = {
      numCommande: 'C-ALD-F',
      ligne: '1000',
      heures: 15,
      dateIso: LUN,
      auPlusTotIso: semaine[0]!,
      auPlusTardIso: MER,
      export: false,
    }
    const plan = lisserCharge([l], jours)
    assert.equal(plan.profil.find((p) => p.dateIso === MAR)!.heuresApres, 0)
    assert.isNull(plan.profil.find((p) => p.dateIso === MAR)!.saturationAvant)
  })

  test('à choix équivalent, on retarde plutôt qu’on avance', ({ assert }) => {
    // Pourquoi : retarder ne pose aucun problème matière — les composants sont
    // déjà là. Avancer suppose de les avoir : c'est le levier de secours, pas le
    // levier par défaut. L'appelant plafonne d'ailleurs l'avance avec la
    // projection matière, mais le moteur ne doit pas aller la chercher de
    // lui-même quand le retard fait aussi bien.
    const jours: JourCapacite[] = [
      { dateIso: LUN, capaciteH: 7.5 },
      { dateIso: MAR, capaciteH: 7.5 },
      { dateIso: MER, capaciteH: 7.5 },
    ]
    // Mardi surchargé, lundi et mercredi vides et symétriques : les deux sens
    // donnent exactement le même profil.
    const lignes: LigneLissage[] = [
      {
        numCommande: 'C-ALD-A',
        ligne: '1000',
        heures: 7,
        dateIso: MAR,
        auPlusTotIso: LUN,
        auPlusTardIso: MER,
        export: false,
      },
      {
        numCommande: 'C-ALD-B',
        ligne: '1000',
        heures: 7,
        dateIso: MAR,
        auPlusTotIso: LUN,
        auPlusTardIso: MER,
        export: false,
      },
    ]
    const plan = lisserCharge(lignes, jours)
    assert.lengthOf(plan.deplacements, 1)
    assert.equal(plan.deplacements[0]!.sens, 'retard')
    assert.equal(plan.deplacements[0]!.versIso, MER)
  })

  test('une ligne hors de l’horizon est signalée, pas avalée', ({ assert }) => {
    // Pourquoi : une ligne qui disparaît sans un mot fait croire à un total faux.
    // Le moteur la remonte dans `lignesIgnorees`.
    const plan = lisserCharge([ligne('C-ALD-HORS', ALDES, '2026-11-02', 5)], joursPP091())
    assert.lengthOf(plan.lignesIgnorees, 1)
    assert.equal(plan.lignesIgnorees[0]!.numCommande, 'C-ALD-HORS')
  })
})
