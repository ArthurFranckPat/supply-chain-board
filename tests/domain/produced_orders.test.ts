import { test } from '@japa/runner'
import { buildPosteNatureByWorkstation } from '#app/domain/atelier'
import { PP_XXX_REGEX, ALLOWED_ATELIERS } from '#services/produced_hours_loader'

test.group('Produced Orders - Final Assembly Filtering & Aggregation', () => {
  test('filtre strictement au niveau 0 PF et aux postes assemblage_pf', ({ assert }) => {
    // 1. Articles
    const catMap = new Map([
      ['ART_PF1', 'PF3'],
      ['ART_PF2', 'PFAS'],
      ['ART_SE1', 'SF'],
      ['ART_ACHAT', 'AC'],
    ])

    // 2. Gammes : ART_PF1 sur PP_093, ART_PF2 sur PP_128, ART_SE1 sur PP_146
    const gammes = [
      { article: 'ART_PF1', workstation: 'PP_093', workstationLabel: 'Ligne BXC', rate: 10 },
      { article: 'ART_PF1', workstation: 'PP_SCA', workstationLabel: 'Scannage', rate: 0 },
      { article: 'ART_PF2', workstation: 'PP_128', workstationLabel: 'Ligne Kit', rate: 15 },
      { article: 'ART_SE1', workstation: 'PP_146', workstationLabel: 'Sous-ensemble', rate: 5 },
    ]

    const natureMap = buildPosteNatureByWorkstation(gammes, catMap)
    assert.equal(natureMap.get('PP_093'), 'assemblage_pf')
    assert.equal(natureMap.get('PP_128'), 'assemblage_pf')
    assert.equal(natureMap.get('PP_146'), 'assemble_sous_ensemble')

    // 3. Commandes brutes
    const rawOrders = [
      { article: 'ART_PF1', date: '2026-08-05', quantity: 100, nbOrders: 2 },
      { article: 'ART_PF1', date: '2026-08-10', quantity: 50, nbOrders: 1 },
      { article: 'ART_PF2', date: '2026-08-12', quantity: 30, nbOrders: 1 },
      { article: 'ART_SE1', date: '2026-08-15', quantity: 200, nbOrders: 3 }, // Doit être exclu (SE)
      { article: 'ART_ACHAT', date: '2026-08-20', quantity: 80, nbOrders: 1 }, // Doit être exclu (Achat)
    ]

    // Vérification des filtres
    const ligneByArticle = new Map<string, string>()
    for (const g of gammes) {
      if (!ligneByArticle.has(g.article)) {
        ligneByArticle.set(g.article, g.workstation)
      }
    }

    const eligibleOrders = rawOrders.filter((o) => {
      const cat = catMap.get(o.article) || ''
      if (!cat.startsWith('PF')) return false
      const wst = ligneByArticle.get(o.article)
      if (!wst) return false
      if (natureMap.get(wst) !== 'assemblage_pf') return false
      if (!PP_XXX_REGEX.test(wst)) return false
      return true
    })

    assert.equal(eligibleOrders.length, 3)
    assert.deepEqual(
      eligibleOrders.map((o) => o.article),
      ['ART_PF1', 'ART_PF1', 'ART_PF2']
    )

    // Total quantity pour PP_093
    const pp093Qty = eligibleOrders
      .filter((o) => ligneByArticle.get(o.article) === 'PP_093')
      .reduce((acc, o) => acc + o.quantity, 0)
    assert.equal(pp093Qty, 150)

    // Total quantity pour PP_128
    const pp128Qty = eligibleOrders
      .filter((o) => ligneByArticle.get(o.article) === 'PP_128')
      .reduce((acc, o) => acc + o.quantity, 0)
    assert.equal(pp128Qty, 30)
  })

  test('respecte les ateliers autorisés et le format PP_XXX', ({ assert }) => {
    assert.isTrue(PP_XXX_REGEX.test('PP_093'))
    assert.isTrue(PP_XXX_REGEX.test('PP_128'))
    assert.isFalse(PP_XXX_REGEX.test('PP_SCA'))
    assert.isFalse(PP_XXX_REGEX.test('PP_EXP'))

    assert.isTrue(ALLOWED_ATELIERS.has('S3P'))
    assert.isTrue(ALLOWED_ATELIERS.has('S4P'))
    assert.isTrue(ALLOWED_ATELIERS.has('S9P'))
    assert.isTrue(ALLOWED_ATELIERS.has('CLP'))
    assert.isFalse(ALLOWED_ATELIERS.has('MEC'))
    assert.isFalse(ALLOWED_ATELIERS.has('EXP'))
  })

  test('calcule correctement les écarts de délai et la synthèse des commandes détaillées', ({
    assert,
  }) => {
    const rawLines = [
      {
        orderNum: 'CMD-001',
        orderLine: 1000,
        orderSeq: 1,
        clientCode: 'CLI1',
        clientName: 'Client Un',
        article: 'ART_PF1',
        quantity: 50,
        dateDemandee: '2026-08-01',
        dateAcceptee: '2026-08-01', // Conforme (0j)
      },
      {
        orderNum: 'CMD-002',
        orderLine: 1000,
        orderSeq: 1,
        clientCode: 'CLI2',
        clientName: 'Client Deux',
        article: 'ART_PF1',
        quantity: 25,
        dateDemandee: '2026-08-01',
        dateAcceptee: '2026-08-05', // +4j retard
      },
      {
        orderNum: 'CMD-003',
        orderLine: 1000,
        orderSeq: 1,
        clientCode: 'CLI3',
        clientName: 'Client Trois',
        article: 'ART_PF2',
        quantity: 10,
        dateDemandee: '2026-08-04',
        dateAcceptee: '2026-08-02', // -2j avance
      },
    ]

    const processedLines = rawLines.map((r) => {
      let deltaDays = 0
      if (r.dateDemandee && r.dateAcceptee) {
        const tDem = new Date(r.dateDemandee).getTime()
        const tAcc = new Date(r.dateAcceptee).getTime()
        deltaDays = Math.round((tAcc - tDem) / 86_400_000)
      }
      return { ...r, deltaDays }
    })

    assert.equal(processedLines[0].deltaDays, 0)
    assert.equal(processedLines[1].deltaDays, 4)
    assert.equal(processedLines[2].deltaDays, -2)

    // Top produit
    const prodQtyMap = new Map<string, number>()
    for (const l of processedLines) {
      prodQtyMap.set(l.article, (prodQtyMap.get(l.article) || 0) + l.quantity)
    }
    assert.equal(prodQtyMap.get('ART_PF1'), 75)
    assert.equal(prodQtyMap.get('ART_PF2'), 10)
  })
})
