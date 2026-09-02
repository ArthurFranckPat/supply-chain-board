import { test } from '@japa/runner'
import type { Flow, FlowOrigin } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import { OFConso, CommandeOFMatcher } from '#app/domain/of_conso'

function makeOfFlow(
  id: string,
  article: string,
  status: number,
  quantity: number,
  date?: Date
): Flow {
  const origin: Extract<FlowOrigin, { type: 'of' }> = {
    type: 'of',
    id,
    status: status as 1 | 2 | 3,
    designation: '',
    typeOfLabel: '',
    statutLabel: '',
    typeOf: null,
  }
  return { article, quantity, direction: 'supply', date: date ?? null, origin }
}

function makeDemandFlow(
  id: string,
  article: string,
  quantity: number,
  date: Date,
  orderType?: string
): Flow {
  const origin: Extract<FlowOrigin, { type: 'order' }> = {
    type: 'order',
    id,
    orderType: (orderType ?? 'NOR') as 'MTS' | 'MTO' | 'NOR',
    customer: 'Test',
    pays: null,
    nature: 'COMMANDE',
    contremarque: null,
    qteCommandee: quantity,
    qteAllouee: 0,
  }
  return { article, quantity, direction: 'demand', date, origin }
}

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code,
    description: '',
    category: 'PROD',
    supplyType,
    reorderDelay: 0,
    productFamily: null,
    pmp: null,
    economicLot: null,
    unitStock: null,
    unitPurchase: null,
    purchaseToStockRatio: 1,
    packagings: [],
  }
}

test.group('OFConso', () => {
  test('init with full quantity available', ({ assert }) => {
    const flow = makeOfFlow('OF1', 'ART1', 1, 100)
    const conso = new OFConso(flow)
    assert.equal(conso.qteDisponible, 100)
    assert.equal(conso.qteAllouee, 0)
    assert.equal(conso.numOf, 'OF1')
  })

  test('estDisponible returns true when enough', ({ assert }) => {
    const conso = new OFConso(makeOfFlow('OF1', 'ART1', 1, 100))
    assert.isTrue(conso.estDisponible(50))
    assert.isTrue(conso.estDisponible(100))
  })

  test('estDisponible returns false when not enough', ({ assert }) => {
    const conso = new OFConso(makeOfFlow('OF1', 'ART1', 1, 100))
    assert.isFalse(conso.estDisponible(101))
  })

  test('allouer decrements available', ({ assert }) => {
    const conso = new OFConso(makeOfFlow('OF1', 'ART1', 1, 100))
    conso.allouer(30, 'CMD1')
    assert.equal(conso.qteAllouee, 30)
    assert.equal(conso.qteDisponible, 70)
    assert.include(conso.commandesServees, 'CMD1')
  })
})

test.group('CommandeOFMatcher', () => {
  test('MTS hard pegging links OF via origin', ({ assert }) => {
    const ofFlow = makeOfFlow('OF-MTS', 'ART1', 1, 50)
    const demand = makeDemandFlow('CMD1', 'ART1', 40, new Date('2026-04-10'), 'MTS')

    const matcher = new CommandeOFMatcher([ofFlow], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'mts_hard_pegging')
    assert.isNotNull(result.of)
    assert.equal(result.ofAllocations.length, 1)
    assert.equal(result.ofAllocations[0].qteAllouee, 40)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('MTS partial cover reports remaining', ({ assert }) => {
    const ofFlow = makeOfFlow('OF-MTS', 'ART1', 1, 30)
    const demand = makeDemandFlow('CMD1', 'ART1', 50, new Date('2026-04-10'), 'MTS')

    const matcher = new CommandeOFMatcher([ofFlow], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.ofAllocations[0].qteAllouee, 30)
    assert.equal(result.remainingUncoveredQty, 20)
    assert.isAbove(result.alerts.length, 0)
  })

  test('NOR stock complete when stock covers fully', ({ assert }) => {
    const stockFlow: Flow = {
      article: 'ART1',
      quantity: 100,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', pmp: null },
    }
    const demand = makeDemandFlow('CMD1', 'ART1', 50, new Date('2026-04-10'))

    const matcher = new CommandeOFMatcher([stockFlow], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'stock_complete')
    assert.equal(result.stockAllocation!.qteAllouee, 50)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('NOR cumulative OF coverage with priority', ({ assert }) => {
    const ofFerme = makeOfFlow('OF-FERME', 'ART1', 1, 50, new Date('2026-04-10'))
    const ofSuggere = makeOfFlow('OF-SUGG', 'ART1', 3, 30, new Date('2026-04-12'))
    const demand = makeDemandFlow('CMD1', 'ART1', 70, new Date('2026-04-11'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFerme, ofSuggere], articles, new Map(), 30)
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'nor_mto_cumulative')
    assert.equal(result.ofAllocations.length, 2)
    assert.equal(result.ofAllocations[0].qteAllouee, 50)
    assert.equal(result.ofAllocations[1].qteAllouee, 20)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('matchCommandes shares OFConso across orders', ({ assert }) => {
    const ofFlow = makeOfFlow('OF1', 'ART1', 1, 100, new Date('2026-04-10'))
    const cmd1 = makeDemandFlow('CMD1', 'ART1', 60, new Date('2026-04-10'))
    const cmd2 = makeDemandFlow('CMD2', 'ART1', 60, new Date('2026-04-11'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFlow], articles, new Map(), 30)
    const results = matcher.matchCommandes([cmd1, cmd2])

    assert.equal(results.length, 2)
    assert.equal(results[0].ofAllocations[0].qteAllouee, 60)
    assert.equal(results[1].ofAllocations[0].qteAllouee, 40)
    assert.equal(results[1].remainingUncoveredQty, 20)
  })

  test('purchase article returns purchase_supply method', ({ assert }) => {
    const stockFlow: Flow = {
      article: 'COMP1',
      quantity: 20,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', pmp: null },
    }
    const demand = makeDemandFlow('CMD1', 'COMP1', 50, new Date('2026-04-10'))

    const articles = new Map([['COMP1', makeArticle('COMP1', 'ACHAT')]])
    const matcher = new CommandeOFMatcher([stockFlow], articles, new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'purchase_supply')
    assert.equal(result.remainingUncoveredQty, 30)
  })

  test('dateToleranceDays filters distant OFs', ({ assert }) => {
    const ofFlow = makeOfFlow('OF1', 'ART1', 1, 100, new Date('2026-06-01'))
    const demand = makeDemandFlow('CMD1', 'ART1', 50, new Date('2026-04-01'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFlow], articles, new Map(), 10)
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'none')
    assert.equal(result.remainingUncoveredQty, 50)
  })

  test('init accepts custom date tolerance', ({ assert }) => {
    const matcher = new CommandeOFMatcher([], new Map(), new Map(), 5)
    assert.equal(matcher['dateToleranceDays'], 5)
  })

  test('reset clears internal state', ({ assert }) => {
    const ofFlow = makeOfFlow('OF1', 'ART1', 1, 100)
    const matcher = new CommandeOFMatcher([ofFlow], new Map(), new Map())

    matcher.matchCommandes([makeDemandFlow('CMD1', 'ART1', 50, new Date('2026-04-10'))])
    matcher.reset()

    assert.equal(matcher['ofConso'].size, 0)
    assert.equal(matcher['ofsDejaUtilises'].size, 0)
  })

  test('MTS with contremarque links OF directly', ({ assert }) => {
    const ofLinked = makeOfFlow('OF-MTS-1', 'ART1', 1, 50, new Date('2026-04-10'))
    const origin: Extract<FlowOrigin, { type: 'order' }> = {
      type: 'order',
      id: 'CMD-MTS-1',
      orderType: 'MTS',
      customer: 'Test',
      pays: null,
      nature: 'COMMANDE',
      contremarque: 'OF-MTS-1',
      qteCommandee: 100,
      qteAllouee: 0,
    }
    const demand: Flow = {
      article: 'ART1',
      quantity: 100,
      direction: 'demand',
      date: new Date('2026-04-10'),
      origin,
    }

    const matcher = new CommandeOFMatcher([ofLinked], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'mts_hard_pegging')
    assert.isNotNull(result.of)
    assert.equal((result.of!.origin as Extract<FlowOrigin, { type: 'of' }>).id, 'OF-MTS-1')
    assert.equal(result.ofAllocations[0].qteAllouee, 50)
    assert.equal(result.remainingUncoveredQty, 50)
    assert.isAbove(result.alerts.length, 0)
  })

  test('MTS contremarque cible un OF non-prioritaire (sinon orphelin) — régression AR2602600/F426-32503', ({
    assert,
  }) => {
    // Plusieurs OF même article : le match par article+date sélectionnerait l'OF ferme proche.
    // La contremarque doit forcer l'OF explicitement peggé (statut 2, plus lointain).
    const ofFermeProche = makeOfFlow('OF-FERME', 'ART1', 1, 2520, new Date('2026-06-16'))
    const ofPegge = makeOfFlow('OF-PEGGE', 'ART1', 2, 2520, new Date('2026-06-25'))
    const origin: Extract<FlowOrigin, { type: 'order' }> = {
      type: 'order',
      id: 'CMD-MTS-PEG',
      orderType: 'MTS',
      customer: 'Test',
      pays: null,
      nature: 'COMMANDE',
      contremarque: 'OF-PEGGE',
      qteCommandee: 2520,
      qteAllouee: 0,
    }
    const demand: Flow = {
      article: 'ART1',
      quantity: 2520,
      direction: 'demand',
      date: new Date('2026-06-25'),
      origin,
    }

    const matcher = new CommandeOFMatcher([ofFermeProche, ofPegge], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'mts_hard_pegging')
    assert.equal((result.of!.origin as Extract<FlowOrigin, { type: 'of' }>).id, 'OF-PEGGE')
    assert.equal(result.ofAllocations[0].qteAllouee, 2520)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('MTS without contremarque reports no linked OF', ({ assert }) => {
    const demand = makeDemandFlow('CMD-MTS-NOOF', 'ART1', 100, new Date('2026-04-12'), 'MTS')
    const matcher = new CommandeOFMatcher([], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'mts_hard_pegging')
    assert.isNull(result.of)
    assert.equal(result.remainingUncoveredQty, 100)
    assert.isAbove(result.alerts.length, 0)
  })

  test('MTS article acheté couvert par stock → stock_complete (régression A2178/AR2601357)', ({
    assert,
  }) => {
    // Article acheté sans OF ni contremarque : avant le fix, tombait à tort en
    // « sans couverture » car matchMts ne regardait pas le stock. Le stock libre
    // (160) couvre la demande (77) → couverture par stock.
    const stockFlow: Flow = {
      article: 'A2178',
      quantity: 160,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', pmp: null },
    }
    const demand = makeDemandFlow('AR2601357', 'A2178', 77, new Date('2026-06-26'), 'MTS')

    const articles = new Map([['A2178', makeArticle('A2178', 'ACHAT')]])
    const matcher = new CommandeOFMatcher([stockFlow], articles, new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'stock_complete')
    assert.isNull(result.of)
    assert.equal(result.stockAllocation!.qteAllouee, 77)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('MTS article acheté partiellement couvert → purchase_supply', ({ assert }) => {
    // Stock insuffisant + article acheté : ce qui n'est pas couvert par le stock
    // relève d'un approvisionnement achat (matchingMethod purchase_supply).
    const stockFlow: Flow = {
      article: 'COMP1',
      quantity: 20,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', pmp: null },
    }
    const demand = makeDemandFlow('CMD-MTS-ACHAT', 'COMP1', 50, new Date('2026-04-12'), 'MTS')

    const articles = new Map([['COMP1', makeArticle('COMP1', 'ACHAT')]])
    const matcher = new CommandeOFMatcher([stockFlow], articles, new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'purchase_supply')
    assert.equal(result.stockAllocation!.qteAllouee, 20)
    assert.equal(result.remainingUncoveredQty, 30)
  })

  test('MTS article fabriqué sans OF ni stock reste uncov (trou de planif)', ({ assert }) => {
    // Article fabriqué sans OF lié ni stock : vrai trou de planification, on
    // conserve l'alerte « aucun OF » sans masquer le problème sous purchase_supply.
    const demand = makeDemandFlow('CMD-MTS-FAB', 'ART1', 100, new Date('2026-04-12'), 'MTS')

    const articles = new Map([['ART1', makeArticle('ART1')]]) // FABRICATION
    const matcher = new CommandeOFMatcher([], articles, new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'mts_hard_pegging')
    assert.isNull(result.of)
    assert.equal(result.remainingUncoveredQty, 100)
    assert.isTrue(result.alerts.some((a) => a.includes('aucun OF')))
  })

  test('NOR MTO can use multiple OFs sorted by status and date', ({ assert }) => {
    const ofFerme = makeOfFlow('OF-FERME', 'ART1', 1, 50, new Date('2026-04-10'))
    const ofPlan = makeOfFlow('OF-PLAN', 'ART1', 2, 20, new Date('2026-04-11'))
    const ofSugg = makeOfFlow('OF-SUGG', 'ART1', 3, 30, new Date('2026-04-12'))
    const demand = makeDemandFlow('CMD-NOR-MULTI', 'ART1', 90, new Date('2026-04-11'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFerme, ofPlan, ofSugg], articles, new Map(), 30)
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'nor_mto_cumulative')
    assert.equal(result.ofAllocations.length, 3)
    assert.equal(result.ofAllocations[0].qteAllouee, 50)
    assert.equal(result.ofAllocations[1].qteAllouee, 20)
    assert.equal(result.ofAllocations[2].qteAllouee, 20)
    assert.equal(result.remainingUncoveredQty, 0)
    assert.equal((result.of!.origin as Extract<FlowOrigin, { type: 'of' }>).id, 'OF-FERME')
  })

  test('NOR MTO partial multi OF keeps remaining qty and alerts', ({ assert }) => {
    const ofFerme = makeOfFlow('OF-FERME', 'ART1', 1, 30, new Date('2026-04-10'))
    const ofSugg = makeOfFlow('OF-SUGG', 'ART1', 3, 40, new Date('2026-04-12'))
    const stockFlow: Flow = {
      article: 'ART1',
      quantity: 10,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', pmp: null },
    }
    const demand = makeDemandFlow('CMD-NOR-PARTIAL', 'ART1', 100, new Date('2026-04-11'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFerme, ofSugg, stockFlow], articles, new Map(), 30)
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'nor_mto_cumulative')
    assert.equal(result.stockAllocation!.qteAllouee, 10)
    assert.equal(result.ofAllocations[0].qteAllouee, 30)
    assert.equal(result.ofAllocations[1].qteAllouee, 40)
    assert.equal(result.remainingUncoveredQty, 20)
    assert.isAbove(result.alerts.length, 0)
  })
})

/**
 * Scénario réel EHP187MGM du 28/07/2026 (issue #99). X3 nette le stock prévisionnel sur les
 * dates de FIN : stock 1080 + OF ferme F126 (fin 28/07, 1080) couvrent les deux commandes du
 * 29/07 ; la suggestion SGAE (fin 17/08, 2160) ne sert que les échéances d'août. Le board
 * affichait `AR2603276` (expé demain) sur `SGAE` — l'OF ferme, démarré le 25/07, était sorti
 * du pool de matching (fenêtre STRDAT) et la suggestion restait le seul candidat.
 */
test.group('CommandeOFMatcher — #99 commande déjà couverte par un OF ferme', () => {
  const F126 = () => makeOfFlow('F126-48851', 'EHP187MGM', 1, 1080, new Date('2026-07-28'))
  const SGAE = () => makeOfFlow('SGAE10654696101', 'EHP187MGM', 3, 2160, new Date('2026-08-17'))
  const stock = (qty: number): Flow => ({
    article: 'EHP187MGM',
    quantity: qty,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
  })
  const articles = () => new Map([['EHP187MGM', makeArticle('EHP187MGM')]])
  const demandes = (orderType?: string) => [
    makeDemandFlow('AR2602935', 'EHP187MGM', 1080, new Date('2026-07-29'), orderType),
    makeDemandFlow('AR2603276', 'EHP187MGM', 1080, new Date('2026-07-29'), orderType),
    makeDemandFlow('AR2603146', 'EHP187MGM', 1080, new Date('2026-08-19'), orderType),
    makeDemandFlow('AR2602935-2', 'EHP187MGM', 1080, new Date('2026-08-19'), orderType),
  ]
  const ofsDe = (r: { ofAllocations: { ofFlow: Flow; qteAllouee: number }[] }) =>
    r.ofAllocations
      .filter((a) => a.qteAllouee > 0)
      .map((a) => (a.ofFlow.origin as Extract<FlowOrigin, { type: 'of' }>).id)

  test('NOR: AR2603276 va sur F126, la suggestion ne prend que les échéances août', ({
    assert,
  }) => {
    const matcher = new CommandeOFMatcher([F126(), SGAE(), stock(1080)], articles(), new Map(), 30)
    const [juil1, juil2, aout1, aout2] = matcher.matchCommandes(demandes())

    // Stock d'abord (règle X3), puis l'OF ferme — jamais la suggestion pour du 29/07.
    assert.equal(juil1.stockAllocation!.qteAllouee, 1080)
    assert.deepEqual(ofsDe(juil1), [])
    assert.deepEqual(ofsDe(juil2), ['F126-48851'])
    assert.equal(juil2.remainingUncoveredQty, 0)
    // La suggestion sert les deux échéances d'août, et elles seulement.
    assert.deepEqual(ofsDe(aout1), ['SGAE10654696101'])
    assert.deepEqual(ofsDe(aout2), ['SGAE10654696101'])
  })

  test('MTS: idem — un OF épuisé ne reste pas collé à la commande suivante', ({ assert }) => {
    const matcher = new CommandeOFMatcher([F126(), SGAE()], articles(), new Map(), 30)
    const [juil1, juil2, aout1] = matcher.matchCommandes(demandes('MTS'))

    // F126 (ferme) couvre la 1ʳᵉ ; épuisé, il n'est plus candidat pour la 2ᵉ, qui bascule
    // sur la suggestion — et non plus « F126 avec 0 alloué » comme avant #99.
    assert.deepEqual(ofsDe(juil1), ['F126-48851'])
    assert.deepEqual(ofsDe(juil2), ['SGAE10654696101'])
    assert.equal(juil2.ofAllocations.length, 1)
    assert.deepEqual(ofsDe(aout1), ['SGAE10654696101'])
  })

  test('MTS: OF ferme hors pool → la commande de juillet retombe sur la suggestion (bug #99)', ({
    assert,
  }) => {
    // Reproduit l'état d'AVANT le fix côté données : sans F126 dans le supply, rien ne peut
    // empêcher l'attribution à la suggestion. Verrouille le fait que le correctif tient au
    // SCOPE du supply (delta matching), pas seulement à l'heuristique.
    const matcher = new CommandeOFMatcher([SGAE()], articles(), new Map(), 30)
    const [juil1] = matcher.matchCommandes(demandes('MTS'))
    assert.deepEqual(ofsDe(juil1), ['SGAE10654696101'])
  })
})

/**
 * Scénario réel AEA731XX du 02/09/2026 : le choix de l'OF doit suivre la CHRONOLOGIE du CBN,
 * pas l'écart absolu de date.
 *
 * Prévisionnel X3 (écran « ordres », article AEA731XX) — stock 12 au départ :
 *   12/09  WOS SGAE10663190683  +3609  → 3621
 *   15/09  SOF AR2603652        −1809  → 1812
 *   16/09  SOF AR2604129        −1809  →    3
 *   19/09  WOS SGAE10663190684  +1809  → 1812
 *   22/09  SOF AR2603805        −1809  →    3
 *
 * AR2604129 (16/09) est donc servie par ...683, qui a encore 1812 de capacité — pas par
 * ...684, qui n'arrive que le 19/09, APRÈS son expédition.
 *
 * L'ancien tri (`Math.abs(ofDate - demandDate)`) élisait ...684 : |19−16| = 3 < |12−16| = 4.
 * Conséquence en production : la commande héritait des manquants du mauvais OF (A1692E01
 * −1082) et s'affichait « Bloquée » dans la vue proactive, alors que son OF réel est faisable.
 */
test.group('CommandeOFMatcher — chronologie CBN (AEA731XX)', () => {
  const ART = 'AEA731XX'
  const of683 = () => makeOfFlow('SGAE10663190683', ART, 3, 3609, new Date('2026-09-12'))
  const of684 = () => makeOfFlow('SGAE10663190684', ART, 3, 1809, new Date('2026-09-19'))
  const of685 = () => makeOfFlow('SGAE10663190685', ART, 3, 3618, new Date('2026-09-26'))
  const stock12 = (): Flow => ({
    article: ART,
    quantity: 12,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
  })
  const articles = () => new Map([[ART, makeArticle(ART)]])
  const demandes = () => [
    makeDemandFlow('AR2603652', ART, 1809, new Date('2026-09-15')),
    makeDemandFlow('AR2604129', ART, 1809, new Date('2026-09-16')),
    makeDemandFlow('AR2603805', ART, 1809, new Date('2026-09-22')),
  ]
  const ofsDe = (r: { ofAllocations: Array<{ ofFlow: Flow }> }) =>
    r.ofAllocations.map((a) => (a.ofFlow.origin as Extract<FlowOrigin, { type: 'of' }>).id)

  test('un OF postérieur au besoin ne passe pas devant un OF antérieur encore disponible', ({
    assert,
  }) => {
    const matcher = new CommandeOFMatcher(
      [of683(), of684(), of685(), stock12()],
      articles(),
      new Map(),
      30
    )
    const [sept15, sept16, sept22] = matcher.matchCommandes(demandes())

    // 15/09 : 12 de stock + 1797 sur ...683 → il reste 1812 sur ...683.
    assert.equal(sept15.stockAllocation!.qteAllouee, 12)
    assert.deepEqual(ofsDe(sept15), ['SGAE10663190683'])
    assert.equal(sept15.ofAllocations[0].qteAllouee, 1797)

    // 16/09 : le reliquat de ...683 sert AVANT ...684 (fin 19/09, postérieure à l'expédition).
    assert.deepEqual(ofsDe(sept16), ['SGAE10663190683'])
    assert.equal(sept16.ofAllocations[0].qteAllouee, 1809)
    assert.equal(sept16.remainingUncoveredQty, 0)

    // 22/09 : ...683 est vidé (3 restants), le complément vient de ...684 — jamais de ...685.
    assert.deepEqual(ofsDe(sept22), ['SGAE10663190683', 'SGAE10663190684'])
    assert.equal(sept22.remainingUncoveredQty, 0)
  })

  test('à égalité de statut, le plus tôt gagne même quand un OF plus tardif est plus proche', ({
    assert,
  }) => {
    // Sans la commande du 15/09 : ...683 (J−4) doit encore battre ...684 (J+3).
    const matcher = new CommandeOFMatcher([of683(), of684()], articles(), new Map(), 30)
    const [seul] = matcher.matchCommandes([
      makeDemandFlow('AR2604129', ART, 1809, new Date('2026-09-16')),
    ])
    assert.deepEqual(ofsDe(seul), ['SGAE10663190683'])
  })

  test('aucun OF avant le besoin → repli sur le moins en retard', ({ assert }) => {
    const matcher = new CommandeOFMatcher([of685(), of684()], articles(), new Map(), 30)
    const [tardif] = matcher.matchCommandes([
      makeDemandFlow('AR2604129', ART, 1809, new Date('2026-09-16')),
    ])
    assert.deepEqual(ofsDe(tardif), ['SGAE10663190684'])
  })
})
