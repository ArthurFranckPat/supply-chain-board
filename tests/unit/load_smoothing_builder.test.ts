import { test } from '@japa/runner'
import {
  agregeParLigneDeCommande,
  cleLigne,
  fenetreCommerciale,
  type ChargePoste,
} from '#services/load_smoothing_builder'
import type { JourCapacite } from '#app/domain/load_smoothing'

/**
 * Le service assemble l'entrée du moteur de lissage : ces tests verrouillent
 * les deux règles MÉTIER qu'il porte en propre — ce qu'est une ligne
 * déplaçable, et ce qui ne bouge pas. Tout le reste du service est de l'I/O
 * (caches /charge, projection matières) et se vérifie là où il vit.
 *
 * Semaine de référence : `PP_091`, 5 jours ouvrés à 7,5 h, week-end fermé.
 */
const SEMAINE = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']
const WEEKEND = ['2026-10-03', '2026-10-04']
const jours: JourCapacite[] = [
  ...SEMAINE.map((dateIso) => ({ dateIso, capaciteH: 7.5 })),
  ...WEEKEND.map((dateIso) => ({ dateIso, capaciteH: 0 })),
]
const joursOuvres = SEMAINE

const ALDES = '80001'
const EXPORT_PL = '41200'

const charge = (p: Partial<ChargePoste> & Pick<ChargePoste, 'heures' | 'index'>): ChargePoste => ({
  numCommande: 'C-1',
  ligne: '1000',
  article: 'PF-1',
  clientCode: ALDES,
  prevision: false,
  ...p,
})

test.group('load_smoothing_builder — l’unité déplaçable est la ligne de commande', () => {
  test('les heures d’une même ligne sont AGRÉGÉES, jamais scindées', ({ assert }) => {
    // Pourquoi : un couple (commande, ligne) charge le poste plusieurs fois dès
    // que le produit fini ET un composant induit y repassent. Ces heures
    // bougent ensemble : les laisser séparées autoriserait le moteur à poser la
    // moitié de la commande le lundi et l'autre le jeudi, ce que le CBN ne
    // saurait pas rejouer — et ce que le planificateur ne saurait pas négocier.
    const brutes = agregeParLigneDeCommande([
      charge({ heures: 4.2, index: 0 }), // le PF sur sa gamme
      charge({ heures: 1.3, index: 0 }), // un composant induit, même poste
      charge({ numCommande: 'C-2', heures: 2, index: 1 }),
    ])
    assert.equal(brutes.size, 2)
    assert.closeTo(brutes.get(cleLigne('C-1', '1000'))!.heures, 5.5, 0.001)
  })

  test('deux jours de rattachement pour UNE ligne : on retient le plus tôt, on ne scinde pas', ({
    assert,
  }) => {
    // Pourquoi : une ligne de commande n'a qu'une date de demande. Deux jours
    // est une anomalie de données — la traiter en créant deux objets
    // déplaçables ferait du lissage l'auteur d'un entrelacement que le moteur
    // s'interdit par ailleurs.
    const brutes = agregeParLigneDeCommande([
      charge({ heures: 3, index: 3 }),
      charge({ heures: 3, index: 1 }),
    ])
    assert.equal(brutes.size, 1)
    const seule = [...brutes.values()][0]!
    assert.equal(seule.index, 1)
    assert.closeTo(seule.heures, 6, 0.001)
  })
})

test.group('load_smoothing_builder — fenêtre commerciale', () => {
  test('une PRÉVISION est clouée dans les DEUX sens, pas seulement vers l’aval', ({ assert }) => {
    // Pourquoi : `mobiliteDeLigne(null)` rend `ferme`, mais `ferme` au sens du
    // moteur veut dire « ne peut pas reculer » — une ligne export ferme peut,
    // elle, être avancée. Une prévision n'a aucune ligne de commande à
    // re-dater : l'avancer ne produit rien de réel. Sans cet épinglage, le
    // moteur proposerait de déplacer de l'air.
    const f = fenetreCommerciale(
      {
        numCommande: 'P-2026-40',
        ligne: null,
        article: 'PF-1',
        clientCode: null,
        prevision: true,
        heures: 6,
        index: 3,
      },
      jours,
      joursOuvres
    )
    assert.isTrue(f.epinglee)
    assert.equal(f.ligne.auPlusTotIso, '2026-10-01')
    assert.equal(f.ligne.auPlusTardIso, '2026-10-01')
  })

  test('une demande SANS ligne de commande est épinglée elle aussi, mais pèse dans le profil', ({
    assert,
  }) => {
    // Pourquoi : rien à re-dater dans X3, donc aucun levier — mais ses heures
    // occupent bel et bien la ligne de production. L'écarter du profil
    // libérerait une capacité qui n'existe pas et ferait proposer des dates
    // intenables.
    const f = fenetreCommerciale(
      {
        numCommande: null,
        ligne: null,
        article: 'PF-9',
        clientCode: ALDES,
        prevision: false,
        heures: 2.5,
        index: 0,
      },
      jours,
      joursOuvres
    )
    assert.isTrue(f.epinglee)
    assert.closeTo(f.ligne.heures, 2.5, 0.001)
    assert.equal(f.ligne.auPlusTotIso, f.ligne.auPlusTardIso)
  })

  test('une ligne EXPORT peut être avancée, jamais retardée — et le drapeau suit', ({ assert }) => {
    // Pourquoi : les exports partent une fois par semaine à date contractuelle.
    // Le moteur redit ce refus de son côté (`estCandidat`), mais la fenêtre doit
    // déjà être juste : un plancher aval mal posé ici coûterait un camion.
    const f = fenetreCommerciale(
      {
        numCommande: 'C-EXP-1',
        ligne: '1000',
        article: 'PF-1',
        clientCode: EXPORT_PL,
        prevision: false,
        heures: 9.1,
        index: 3,
      },
      jours,
      joursOuvres
    )
    assert.isFalse(f.epinglee)
    assert.isTrue(f.ligne.export)
    assert.equal(f.ligne.auPlusTardIso, '2026-10-01')
    // Dix jours ouvrés avant, mais l'horizon n'en offre que trois : la fenêtre
    // est ramenée à son extrémité plutôt que de désigner un jour non profilé.
    assert.equal(f.ligne.auPlusTotIso, '2026-09-28')
    assert.equal(f.plancher, 0)
  })

  test('le plancher est un index de l’HORIZON, week-end compris — pas un rang de jour ouvré', ({
    assert,
  }) => {
    // Pourquoi : la borne matière s'exprime en index de jour calendaire (un
    // bucket par jour de la projection). Confondre les deux indexations
    // décalerait la borne de deux jours par week-end traversé, dans le sens qui
    // autorise trop.
    const f = fenetreCommerciale(
      {
        numCommande: 'C-ALD-1',
        ligne: '1000',
        article: 'PF-1',
        clientCode: ALDES,
        prevision: false,
        heures: 4,
        index: 4,
      },
      jours,
      joursOuvres
    )
    assert.equal(jours[f.plancher]!.dateIso, f.ligne.auPlusTotIso)
    // ALDES est retardable de 5 jours ouvrés : l'horizon s'arrête vendredi.
    assert.equal(f.ligne.auPlusTardIso, '2026-10-02')
  })
})
