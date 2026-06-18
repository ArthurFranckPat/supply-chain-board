import { test } from '@japa/runner'
import {
  assignStatuses,
  analyzeRetardCause,
  attachCauses,
  computePaletteSummary,
  computeRetardCharge,
  recommendActions,
  causeToDisplayString,
  isRetard,
  enZoneExpedition,
  EH_TO_EUROP_RATIO,
  type OrderLine,
  type StockBreakdown,
  type StockProvider,
  type OfMatcherPort,
  type OFInfo,
  type BomNavigator,
  type ChargeCalculatorPort,
  type PaletteInfoProvider,
  type PaletteInfo,
  type StatusAssignment,
} from '#app/domain/suivi'

const REF = new Date('2026-06-18')

function line(over: Partial<OrderLine> = {}): OrderLine {
  return {
    numCommande: 'C1',
    article: 'ART',
    designation: '',
    nomClient: 'Client',
    typeCommande: 'NOR',
    dateExpedition: new Date('2026-06-20'),
    dateLivPrevu: null,
    qteCommandee: 10,
    qteAllouee: 0,
    qteRestante: 10,
    isFabrique: false,
    isHardPegged: false,
    emplacements: [],
    ...over,
  }
}

function stockMap(entries: Record<string, StockBreakdown>): Map<string, StockBreakdown> {
  return new Map(Object.entries(entries))
}

// ---------------------------------------------------------------------------
// is_retard / zone d'expédition
// ---------------------------------------------------------------------------

test.group('isRetard + zone expédition', () => {
  test('passé sans zone → retard', ({ assert }) => {
    assert.isTrue(isRetard(line({ dateExpedition: new Date('2026-06-10') }), REF))
  })

  test("passé MAIS en zone d'expédition → pas retard", ({ assert }) => {
    const l = line({ dateExpedition: new Date('2026-06-10'), emplacements: [{ nom: 'QUAI-A' }] })
    assert.isFalse(isRetard(l, REF))
    assert.isTrue(enZoneExpedition(l))
  })

  test('futur → pas retard', ({ assert }) => {
    assert.isFalse(isRetard(line({ dateExpedition: new Date('2026-06-25') }), REF))
  })

  test('sans date → pas retard', ({ assert }) => {
    assert.isFalse(isRetard(line({ dateExpedition: null }), REF))
  })

  test('regex zone insensible à la casse (sm, exp, s9c, s3c)', ({ assert }) => {
    for (const nom of ['sm-12', 'Exp-Quai', 'S9C-01', 'S3C']) {
      assert.isTrue(enZoneExpedition(line({ emplacements: [{ nom }] })), nom)
    }
  })
})

// ---------------------------------------------------------------------------
// status_assigner — règles non couvertes ailleurs (zone + signal CQ)
// ---------------------------------------------------------------------------

test.group('assignStatuses — zone & signal CQ', () => {
  test('MTS fabriqué passé en zone expé → RAS (zone respectée)', ({ assert }) => {
    const l = line({
      typeCommande: 'MTS',
      isFabrique: true,
      dateExpedition: new Date('2026-06-10'),
      emplacements: [{ nom: 'EXP-1' }],
    })
    const [a] = assignStatuses([l], stockMap({ ART: { strict: 0, qc: 0, total: 0 } }), REF)
    assert.equal(a.status, 'RAS')
  })

  test('harmonisation : RAS + stock CQ consommé → ALLOCATION_A_FAIRE', ({ assert }) => {
    const l = line({ qteRestante: 10, qteAllouee: 0 }) // futur (pas retard)
    const [a] = assignStatuses([l], stockMap({ ART: { strict: 0, qc: 4, total: 4 } }), REF)
    assert.equal(a.status, 'ALLOCATION_A_FAIRE')
    assert.isTrue(a.alerteCqStatut)
  })

  test('signal CQ non déclenché si stock strict suffisant', ({ assert }) => {
    const [a] = assignStatuses([line()], stockMap({ ART: { strict: 50, qc: 50, total: 100 } }), REF)
    assert.isFalse(a.alerteCqStatut)
  })

  test('breakdown borné : strict > total est ramené au total', ({ assert }) => {
    const [a] = assignStatuses([line({ qteRestante: 10 })], stockMap({ ART: { strict: 999, qc: 999, total: 6 } }), REF)
    // total allocable = 6 < besoin 10 → non couvert, futur → RAS
    assert.equal(a.status, 'RAS')
    assert.equal(a.qteAlloueeVirtuelle, 6)
  })
})

// ---------------------------------------------------------------------------
// cause_analyzer — chaque CauseType
// ---------------------------------------------------------------------------

function stockProvider(avail: Record<string, number>): StockProvider {
  return {
    getAvailableStock: (a) => avail[a] ?? 0,
    getStockBreakdown: (a) => ({ strict: avail[a] ?? 0, qc: 0, total: avail[a] ?? 0 }),
  }
}

function ofMatcher(
  ofByArticle: Record<string, OFInfo>,
  allocs: Record<string, Record<string, number>> = {},
): OfMatcherPort {
  return {
    findMatchingOf: (_c, article) => ofByArticle[article] ?? null,
    getAllocations: (numOf) => allocs[numOf] ?? {},
  }
}

function bomNavigator(shortages: Record<string, number>, opts: { inSub?: boolean } = {}): BomNavigator {
  return {
    getComponentShortages: () => shortages,
    isComponentInSubassembly: () => opts.inSub ?? false,
    isInBom: () => true,
  }
}

test.group('analyzeRetardCause', () => {
  test('acheté + stock dispo → STOCK_DISPONIBLE_NON_ALLOUE', ({ assert }) => {
    const c = analyzeRetardCause(line({ isFabrique: false }), stockProvider({ ART: 5 }), ofMatcher({}), bomNavigator({}))
    assert.equal(c?.typeCause, 'STOCK_DISPONIBLE_NON_ALLOUE')
  })

  test('acheté + pas de stock → ATTENTE_RECEPTION_FOURNISSEUR', ({ assert }) => {
    const c = analyzeRetardCause(line({ isFabrique: false }), stockProvider({ ART: 0 }), ofMatcher({}), bomNavigator({}))
    assert.equal(c?.typeCause, 'ATTENTE_RECEPTION_FOURNISSEUR')
  })

  test('fabriqué + aucun OF → AUCUN_OF_PLANIFIE', ({ assert }) => {
    const c = analyzeRetardCause(line({ isFabrique: true }), stockProvider({}), ofMatcher({}), bomNavigator({}))
    assert.equal(c?.typeCause, 'AUCUN_OF_PLANIFIE')
  })

  test('fabriqué + OF + ruptures (epsilon filtré) → RUPTURE_COMPOSANTS', ({ assert }) => {
    const of: OFInfo = { numOf: 'OF1', article: 'ART', qteRestante: 10, statutNum: 2 }
    const c = analyzeRetardCause(
      line({ isFabrique: true }),
      stockProvider({}),
      ofMatcher({ ART: of }),
      bomNavigator({ COMP1: 3, COMP2: 0.0005 }),
    )
    assert.equal(c?.typeCause, 'RUPTURE_COMPOSANTS')
    assert.deepEqual(c?.composants, { COMP1: 3 })
  })

  test('fabriqué + OF + aucune rupture → null', ({ assert }) => {
    const of: OFInfo = { numOf: 'OF1', article: 'ART', qteRestante: 10, statutNum: 2 }
    const c = analyzeRetardCause(line({ isFabrique: true }), stockProvider({}), ofMatcher({ ART: of }), bomNavigator({}))
    assert.isNull(c)
  })

  test('causeToDisplayString rupture trié alpha', ({ assert }) => {
    const s = causeToDisplayString({ typeCause: 'RUPTURE_COMPOSANTS', composants: { B: 2, A: 1.5 }, message: '' })
    assert.equal(s, 'Rupture composants: A x1.5, B x2')
  })

  test('attachCauses ne renseigne que les RETARD_PROD', ({ assert }) => {
    const mk = (numCommande: string, status: StatusAssignment['status'], isFabrique: boolean): StatusAssignment => ({
      line: line({ numCommande, isFabrique }),
      status,
      besoinNet: 10,
      qteAlloueeVirtuelle: 0,
      qteAlloueeVirtuelleStricte: 0,
      qteAlloueeVirtuelleCq: 0,
      utiliseStockSousCq: false,
      alerteCqStatut: false,
      cause: null,
    })
    const assignments = [mk('R', 'RETARD_PROD', false), mk('A', 'A_EXPEDIER', false)]
    attachCauses(assignments, stockProvider({ ART: 5 }), ofMatcher({}), bomNavigator({}))
    assert.equal(assignments[0].cause?.typeCause, 'STOCK_DISPONIBLE_NON_ALLOUE')
    assert.isNull(assignments[1].cause)
  })
})

// ---------------------------------------------------------------------------
// palette_calculator
// ---------------------------------------------------------------------------

function paletteProvider(map: Record<string, PaletteInfo>): PaletteInfoProvider {
  return { getPaletteInfo: (a) => map[a] ?? null }
}

function rasAssignment(l: OrderLine): StatusAssignment {
  return {
    line: l,
    status: 'RAS',
    besoinNet: l.qteRestante,
    qteAlloueeVirtuelle: 0,
    qteAlloueeVirtuelleStricte: 0,
    qteAlloueeVirtuelleCq: 0,
    utiliseStockSousCq: false,
    alerteCqStatut: false,
    cause: null,
  }
}

test.group('computePaletteSummary', () => {
  test('nb_palettes = CEIL(qte / unites) + camions standard', ({ assert }) => {
    const l = line({ typeCommande: 'MTS', article: 'P1', qteRestante: 100, dateExpedition: new Date('2026-06-20') })
    const sum = computePaletteSummary(
      [rasAssignment(l)],
      paletteProvider({ P1: { unitesParPal: 30, typePalette: '800x1200', gamme: 'Standard' } }),
      REF,
    )
    assert.equal(sum.lignes[0].nbPalettes, 4) // ceil(100/30)
    assert.equal(sum.totaux.palettesStandard, 4)
    assert.equal(sum.totaux.camions, 1) // ceil(4/33)
    assert.equal(sum.byDay.length, 15)
  })

  test('camions EasyHome via ratio ~1.27', ({ assert }) => {
    const l = line({ typeCommande: 'MTO', article: 'EH', qteRestante: 33, dateExpedition: new Date('2026-06-20') })
    const sum = computePaletteSummary(
      [rasAssignment(l)],
      paletteProvider({ EH: { unitesParPal: 1, typePalette: '1000x1200', gamme: 'EasyHome' } }),
      REF,
    )
    assert.equal(sum.totaux.palettesEasyhome, 33)
    assert.equal(sum.totaux.camions, Math.ceil((33 * EH_TO_EUROP_RATIO) / 33)) // 2
  })

  test('hors horizon 15j ignoré', ({ assert }) => {
    const l = line({ typeCommande: 'MTS', article: 'P1', qteRestante: 100, dateExpedition: new Date('2026-07-30') })
    const sum = computePaletteSummary(
      [rasAssignment(l)],
      paletteProvider({ P1: { unitesParPal: 30, typePalette: '800x1200', gamme: 'Standard' } }),
      REF,
    )
    assert.equal(sum.lignes.length, 0)
  })

  test('NOR ignoré (filtre MTS/MTO)', ({ assert }) => {
    const l = line({ typeCommande: 'NOR', article: 'P1', qteRestante: 100, dateExpedition: new Date('2026-06-20') })
    const sum = computePaletteSummary(
      [rasAssignment(l)],
      paletteProvider({ P1: { unitesParPal: 30, typePalette: '800x1200', gamme: 'Standard' } }),
      REF,
    )
    assert.equal(sum.lignes.length, 0)
  })

  test('article sans info palette ignoré', ({ assert }) => {
    const l = line({ typeCommande: 'MTS', article: 'X', qteRestante: 100, dateExpedition: new Date('2026-06-20') })
    const sum = computePaletteSummary([rasAssignment(l)], paletteProvider({}), REF)
    assert.equal(sum.lignes.length, 0)
  })

  test('liste vide → résumé vide structuré', ({ assert }) => {
    const sum = computePaletteSummary([], paletteProvider({}), REF)
    assert.equal(sum.byDay.length, 0)
    assert.equal(sum.totaux.totalLignes, 0)
  })
})

// ---------------------------------------------------------------------------
// retard_charge_calculator
// ---------------------------------------------------------------------------

function chargeCalculator(
  direct: Record<string, number>,
  recursive: Record<string, number>,
  libelles: Record<string, string> = {},
): ChargeCalculatorPort {
  return {
    calculateDirectCharge: () => direct,
    calculateRecursiveCharge: () => recursive,
    getPosteLibelle: (p) => libelles[p] ?? '',
    isValidPoste: () => true,
  }
}

function retardAssignment(over: Partial<OrderLine>, cause: StatusAssignment['cause']): StatusAssignment {
  return {
    line: line({ isFabrique: true, qteRestante: 10, ...over }),
    status: 'RETARD_PROD',
    besoinNet: 10,
    qteAlloueeVirtuelle: 0,
    qteAlloueeVirtuelleStricte: 0,
    qteAlloueeVirtuelleCq: 0,
    utiliseStockSousCq: false,
    alerteCqStatut: false,
    cause,
  }
}

test.group('computeRetardCharge', () => {
  test('charge directe quand pas de rupture sous-ensemble', ({ assert }) => {
    const a = retardAssignment({}, null)
    const charge = computeRetardCharge([a], bomNavigator({}), chargeCalculator({ P10: 5 }, { P10: 999 }, { P10: 'Montage' }))
    assert.equal(charge.P10.heures, 5)
    assert.equal(charge.P10.libelle, 'Montage')
  })

  test('charge récursive si composant dans un sous-ensemble', ({ assert }) => {
    const a = retardAssignment({}, { typeCause: 'RUPTURE_COMPOSANTS', composants: { SUBCOMP: 2 }, message: '' })
    const charge = computeRetardCharge([a], bomNavigator({}, { inSub: true }), chargeCalculator({ P10: 5 }, { P10: 8, P20: 3 }))
    assert.equal(charge.P10.heures, 8)
    assert.equal(charge.P20.heures, 3)
  })

  test('agrège plusieurs lignes par poste', ({ assert }) => {
    const a1 = retardAssignment({ numCommande: 'C1' }, null)
    const a2 = retardAssignment({ numCommande: 'C2' }, null)
    const charge = computeRetardCharge([a1, a2], bomNavigator({}), chargeCalculator({ P10: 4 }, {}))
    assert.equal(charge.P10.heures, 8)
  })

  test('ignore les non-RETARD_PROD', ({ assert }) => {
    const a = { ...retardAssignment({}, null), status: 'RAS' as const }
    const charge = computeRetardCharge([a], bomNavigator({}), chargeCalculator({ P10: 4 }, {}))
    assert.deepEqual(charge, {})
  })
})

// ---------------------------------------------------------------------------
// action_recommender
// ---------------------------------------------------------------------------

test.group('recommendActions', () => {
  function asg(
    status: StatusAssignment['status'],
    cause: StatusAssignment['cause'] = null,
    alerteCqStatut = false,
  ): StatusAssignment {
    return {
      line: line(),
      status,
      besoinNet: 0,
      qteAlloueeVirtuelle: 0,
      qteAlloueeVirtuelleStricte: 0,
      qteAlloueeVirtuelleCq: 0,
      utiliseStockSousCq: false,
      alerteCqStatut,
      cause,
    }
  }

  test('A_EXPEDIER → info', ({ assert }) => {
    assert.equal(recommendActions(asg('A_EXPEDIER')).severity, 'info')
  })

  test('A_EXPEDIER + signal CQ → action qualité', ({ assert }) => {
    assert.match(recommendActions(asg('A_EXPEDIER', null, true)).actions[0], /qualité/)
  })

  test('ALLOCATION_A_FAIRE → warning', ({ assert }) => {
    assert.equal(recommendActions(asg('ALLOCATION_A_FAIRE')).severity, 'warning')
  })

  test('RAS → info sans action', ({ assert }) => {
    assert.deepEqual(recommendActions(asg('RAS')).actions, [])
  })

  test('RETARD_PROD AUCUN_OF_PLANIFIE → critical + action OF', ({ assert }) => {
    const r = recommendActions(asg('RETARD_PROD', { typeCause: 'AUCUN_OF_PLANIFIE', composants: {}, message: '' }))
    assert.equal(r.severity, 'critical')
    assert.match(r.actions[0], /OF/)
  })

  test('RETARD_PROD RUPTURE_COMPOSANTS → liste composants', ({ assert }) => {
    const r = recommendActions(
      asg('RETARD_PROD', { typeCause: 'RUPTURE_COMPOSANTS', composants: { COMP1: 2 }, message: '' }),
    )
    assert.match(r.actions[0], /COMP1/)
  })

  test('RETARD_PROD sans cause → analyser', ({ assert }) => {
    assert.match(recommendActions(asg('RETARD_PROD', null)).actions[0], /Analyser/)
  })
})
