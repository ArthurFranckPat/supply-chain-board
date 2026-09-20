import { test } from '@japa/runner'
import {
  alertesApresLissage,
  borneMatiereAvance,
  margeCumulee,
  type BesoinComposant,
} from '#app/domain/load_smoothing_material'

/**
 * Ces tests verrouillent les règles MÉTIER du plafond matière, pas son
 * implémentation : le calcul de marge a le droit de changer de forme, jamais
 * d'autoriser une avance devant du stock qui n'est pas encore là.
 *
 * La situation de référence est celle qui motive tout le lot : `fenetreDeplacement`
 * rend `auPlusTot = date − 10 jours ouvrés` sans rien vérifier. Avancer une
 * production suppose les composants présents — retarder, non.
 *
 * L'horizon des cas ci-dessous est un horizon de JOURS, index 0 = premier jour.
 */

/** Marge d'un composant sans aucune arrivée : le stock initial, à plat. */
const stockPlat = (stock: number, jours: number): number[] =>
  margeCumulee({
    stockInitial: stock,
    encours: 0,
    arrivees: new Array<number>(jours).fill(0),
    besoin: new Array<number>(jours).fill(0),
  })

const besoin = (article: string, quantite: number): BesoinComposant[] => [{ article, quantite }]

test.group('load_smoothing_material — marge cumulée', () => {
  test('la marge n’est JAMAIS écrêtée à zéro : un composant déjà en rupture doit bloquer', ({
    assert,
  }) => {
    // Pourquoi : `material_projection` écrête son `solde` à zéro parce qu'un
    // manque y est porté à part, dans `manque[t]`. Réutiliser ce solde ici
    // ferait repartir un composant en rupture de zéro le lendemain — donc
    // autoriserait à avancer de la production À TRAVERS une rupture connue.
    const marge = margeCumulee({
      stockInitial: 10,
      encours: 0,
      arrivees: [0, 0, 0],
      besoin: [0, 40, 0],
    })
    assert.deepEqual(marge, [10, -30, -30])
  })

  test('l’en-cours est crédité au premier jour, comme dans la projection', ({ assert }) => {
    // Pourquoi : les pièces pointées non déclarées existent physiquement. Elles
    // n'ont aucune raison d'attendre un bucket, et la projection les crédite
    // déjà d'entrée — deux conventions différentes feraient diverger la borne
    // du plan appro qui l'alimente.
    const marge = margeCumulee({ stockInitial: 5, encours: 7, arrivees: [0, 0], besoin: [0, 0] })
    assert.deepEqual(marge, [12, 12])
  })
})

test.group('load_smoothing_material — borne de l’avance', () => {
  test('du stock partout : la borne commerciale reste seule maîtresse', ({ assert }) => {
    // Pourquoi : la matière ne doit rien resserrer quand il n'y a rien à
    // resserrer. Une borne qui rognerait « par prudence » ferait perdre des
    // déplacements parfaitement tenables.
    const marge = new Map([['ACH-1', stockPlat(1000, 10)]])
    const borne = borneMatiereAvance(8, 0, besoin('ACH-1', 100), marge)
    assert.equal(borne.index, 0)
    assert.isEmpty(borne.bloquants)
  })

  test('la borne remonte au jour où le composant EST là, pas avant', ({ assert }) => {
    // Pourquoi : c'est la règle du lot. Le composant arrive le jour 5 ; avant, le
    // stock ne couvre pas la ligne. Proposer le jour 2 ferait décrocher le
    // téléphone au planificateur pour une date que l'atelier ne tiendra pas.
    const marge = new Map([
      [
        'ACH-1',
        margeCumulee({
          stockInitial: 0,
          encours: 0,
          // 500 pièces réceptionnées au jour 5.
          arrivees: [0, 0, 0, 0, 0, 500, 0, 0, 0, 0],
          besoin: new Array<number>(10).fill(0),
        }),
      ],
    ])
    const borne = borneMatiereAvance(9, 0, besoin('ACH-1', 400), marge)
    assert.equal(borne.index, 5)
    assert.lengthOf(borne.bloquants, 1)
    assert.equal(borne.bloquants[0]!.article, 'ACH-1')
    assert.equal(borne.bloquants[0]!.index, 5)
    assert.isFalse(borne.bloquants[0]!.inconnu)
  })

  test('le composant le plus tardif commande — c’est le plus contraignant qui décide', ({
    assert,
  }) => {
    // Pourquoi : produire suppose TOUS les composants, pas le premier arrivé.
    // Une borne prise sur la moyenne ou sur le premier composant lu proposerait
    // une date où il manque encore une vis.
    const marge = new Map([
      [
        'ACH-TOT',
        margeCumulee({
          stockInitial: 0,
          encours: 0,
          arrivees: [0, 0, 100, 0, 0, 0],
          besoin: new Array<number>(6).fill(0),
        }),
      ],
      [
        'ACH-TARD',
        margeCumulee({
          stockInitial: 0,
          encours: 0,
          arrivees: [0, 0, 0, 0, 100, 0],
          besoin: new Array<number>(6).fill(0),
        }),
      ],
    ])
    const borne = borneMatiereAvance(
      5,
      0,
      [
        { article: 'ACH-TOT', quantite: 50 },
        { article: 'ACH-TARD', quantite: 50 },
      ],
      marge
    )
    assert.equal(borne.index, 4)
    // Les deux ont serré la borne, le plus tardif en tête : c'est lui qu'on
    // appelle l'approvisionneur pour débloquer.
    assert.equal(borne.bloquants[0]!.article, 'ACH-TARD')
  })

  test('un composant INCONNU de la projection cloue la ligne — le silence n’autorise rien', ({
    assert,
  }) => {
    // Pourquoi : un composant absent de la projection (référentiel incomplet,
    // nomenclature coupée par le plafond de profondeur) est une ignorance, pas
    // une disponibilité. Le traiter comme disponible ferait proposer des dates
    // sur la seule partie de la nomenclature qu'on sait lire.
    const borne = borneMatiereAvance(6, 0, besoin('ACH-FANTOME', 1), new Map())
    assert.equal(borne.index, 6)
    assert.isTrue(borne.bloquants[0]!.inconnu)
  })

  test('la borne ne descend JAMAIS sous le plancher commercial ni au-dessus du jour actuel', ({
    assert,
  }) => {
    // Pourquoi : la matière ne fait que REMONTER la borne de `fenetreDeplacement`.
    // Elle n'a pas à ouvrir une avance que la règle client interdit (au-delà de
    // 10 jours ouvrés), ni à proposer un jour postérieur à la date actuelle —
    // retarder est un autre levier, qui ne pose aucun problème matière.
    const marge = new Map([['ACH-1', stockPlat(10_000, 10)]])
    const large = borneMatiereAvance(8, 3, besoin('ACH-1', 1), marge)
    assert.equal(large.index, 3)

    const vide = new Map([['ACH-1', stockPlat(0, 10)]])
    const serre = borneMatiereAvance(8, 3, besoin('ACH-1', 1), vide)
    assert.equal(serre.index, 8)
  })

  test('un besoin nul ne borne rien : une ligne sans composant acheté reste libre', ({
    assert,
  }) => {
    // Pourquoi : une ligne dont tous les composants sont fabriqués n'attend
    // aucune réception. La borner reviendrait à interdire l'avance à tout un
    // pan du catalogue sans raison.
    const borne = borneMatiereAvance(7, 2, [], new Map())
    assert.equal(borne.index, 2)
    assert.isEmpty(borne.bloquants)
  })
})

test.group('load_smoothing_material — contrôle groupé après lissage', () => {
  test('deux lignes avancées dans la MÊME marge : le contrôle le dit', ({ assert }) => {
    // Pourquoi : chaque ligne est bornée SEULE, contre la marge d'avant lissage.
    // Deux avances peuvent donc réserver deux fois les mêmes 100 pièces, et la
    // borne seule ne le verra jamais. Le contrôle groupé rejoue le plan retenu :
    // c'est ce qui empêche de livrer une proposition qui ne tient pas.
    const marge = new Map([['ACH-1', stockPlat(100, 6)]])
    const alertes = alertesApresLissage(marge, [
      { deIndex: 5, versIndex: 1, besoins: besoin('ACH-1', 80) },
      { deIndex: 5, versIndex: 1, besoins: besoin('ACH-1', 80) },
    ])
    assert.lengthOf(alertes, 1)
    assert.equal(alertes[0]!.article, 'ACH-1')
    assert.equal(alertes[0]!.index, 1)
    assert.closeTo(alertes[0]!.manque, 60, 0.001)
  })

  test('un retard REND de la matière — il ne doit pas être compté comme une tension', ({
    assert,
  }) => {
    // Pourquoi : retarder une ligne libère ses composants sur l'intervalle
    // qu'elle quitte. Un contrôle qui ne compterait que les avances accuserait
    // le lissage d'une rupture qu'il vient de desserrer, et le planificateur
    // cesserait de croire l'alerte.
    const marge = new Map([['ACH-1', stockPlat(100, 6)]])
    // Une ligne avancée du jour 5 au jour 1 (elle consomme 150 plus tôt), une
    // autre retardée du jour 1 au jour 5 sur le MÊME intervalle : la seconde
    // rend exactement ce que la première prend.
    const alertes = alertesApresLissage(marge, [
      { deIndex: 5, versIndex: 1, besoins: besoin('ACH-1', 150) },
      { deIndex: 1, versIndex: 5, besoins: besoin('ACH-1', 150) },
    ])
    assert.isEmpty(alertes)

    // Sans la contrepartie, la même avance casse : la preuve que le crédit du
    // retard n'est pas une complaisance du test.
    const seule = alertesApresLissage(marge, [
      { deIndex: 5, versIndex: 1, besoins: besoin('ACH-1', 150) },
    ])
    assert.lengthOf(seule, 1)
  })

  test('une rupture PRÉEXISTANTE n’est pas imputée au lissage', ({ assert }) => {
    // Pourquoi : un composant déjà négatif est un sujet d'approvisionnement, pas
    // une conséquence du plan. L'afficher ici noierait les vraies alertes sous
    // le passif du carnet.
    const marge = new Map([
      [
        'ACH-1',
        margeCumulee({
          stockInitial: 0,
          encours: 0,
          arrivees: [0, 0, 0, 0],
          besoin: [50, 0, 0, 0],
        }),
      ],
    ])
    const alertes = alertesApresLissage(marge, [
      { deIndex: 3, versIndex: 2, besoins: besoin('ACH-1', 10) },
    ])
    assert.isEmpty(alertes)
  })
})
