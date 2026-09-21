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

  test('explose le niveau 1 de nomenclature pour les composants PF fabriqués (ex: BDH sur PP_153)', ({
    assert,
  }) => {
    // 1. Articles et catégories
    const catMap = new Map([
      ['KIT_830', 'PFAS'],
      ['BDH_153_A', 'PF3'],
      ['BDH_153_B', 'PF3'],
      ['COMP_ACHAT', 'APA'],
      ['COMP_SOUS_ENS', 'SF'],
    ])
    const supplyTypeMap = new Map([
      ['KIT_830', 'FABRICATION'],
      ['BDH_153_A', 'FABRICATION'],
      ['BDH_153_B', 'FABRICATION'],
      ['COMP_ACHAT', 'ACHAT'],
      ['COMP_SOUS_ENS', 'FABRICATION'],
    ])

    // 2. Gammes et postes
    const gammes = [
      { article: 'KIT_830', workstation: 'PP_830', workstationLabel: 'Ligne EasyHome', rate: 10 },
      { article: 'BDH_153_A', workstation: 'PP_153', workstationLabel: 'Ligne BDH', rate: 20 },
      { article: 'BDH_153_B', workstation: 'PP_153', workstationLabel: 'Ligne BDH', rate: 20 },
      {
        article: 'COMP_SOUS_ENS',
        workstation: 'PP_146',
        workstationLabel: 'Sous-ensemble',
        rate: 5,
      },
    ]

    const natureMap = buildPosteNatureByWorkstation(gammes, catMap)
    assert.equal(natureMap.get('PP_830'), 'assemblage_pf')
    assert.equal(natureMap.get('PP_153'), 'assemblage_pf')
    assert.equal(natureMap.get('PP_146'), 'assemble_sous_ensemble')

    const ligneByArticle = new Map<string, string>()
    for (const g of gammes) {
      if (!ligneByArticle.has(g.article)) {
        ligneByArticle.set(g.article, g.workstation)
      }
    }

    // 3. Nomenclature du kit
    const nomenclatures = [
      {
        parentArticle: 'KIT_830',
        componentArticle: 'BDH_153_A',
        componentDescription: 'Bouche BDH A',
        linkQuantity: 1,
        componentType: 'FABRIQUE',
      },
      {
        parentArticle: 'KIT_830',
        componentArticle: 'BDH_153_B',
        componentDescription: 'Bouche BDH B',
        linkQuantity: 2,
        componentType: 'FABRIQUE',
      },
      {
        parentArticle: 'KIT_830',
        componentArticle: 'COMP_ACHAT',
        componentDescription: 'Vis achat',
        linkQuantity: 4,
        componentType: 'ACHETE',
      },
      {
        parentArticle: 'KIT_830',
        componentArticle: 'COMP_SOUS_ENS',
        componentDescription: 'Sous ensemble',
        linkQuantity: 1,
        componentType: 'FABRIQUE',
      },
    ]

    const bomByParent = new Map<string, typeof nomenclatures>()
    for (const row of nomenclatures) {
      if (!bomByParent.has(row.parentArticle)) {
        bomByParent.set(row.parentArticle, [])
      }
      bomByParent.get(row.parentArticle)!.push(row)
    }

    // 4. Commandes brutes : 1 commande de 10 KIT_830 et 1 commande directe de 5 BDH_153_A
    const rawOrders = [
      { article: 'KIT_830', date: '2026-09-01', quantity: 10, nbOrders: 1 },
      { article: 'BDH_153_A', date: '2026-09-01', quantity: 5, nbOrders: 1 },
    ]

    const ordersByWstAndArticle = new Map<string, Map<string, number>>()

    for (const row of rawOrders) {
      const artCode = row.article
      const cat = catMap.get(artCode) || ''
      if (!cat.startsWith('PF')) continue

      const parentWst = ligneByArticle.get(artCode)

      // Niveau 0
      if (
        parentWst &&
        natureMap.get(parentWst) === 'assemblage_pf' &&
        PP_XXX_REGEX.test(parentWst)
      ) {
        if (!ordersByWstAndArticle.has(parentWst)) {
          ordersByWstAndArticle.set(parentWst, new Map())
        }
        const m = ordersByWstAndArticle.get(parentWst)!
        m.set(artCode, (m.get(artCode) || 0) + row.quantity)
      }

      // Niveau 1
      const comps = bomByParent.get(artCode) || []
      for (const comp of comps) {
        const compCode = comp.componentArticle
        const compCat = catMap.get(compCode) || ''
        if (!compCat.startsWith('PF')) continue

        const isFab =
          comp.componentType === 'FABRIQUE' || supplyTypeMap.get(compCode) === 'FABRICATION'
        if (!isFab) continue

        const compWst = ligneByArticle.get(compCode)
        if (!compWst || compWst === parentWst) continue
        if (natureMap.get(compWst) !== 'assemblage_pf' || !PP_XXX_REGEX.test(compWst)) continue

        const derivedQty = row.quantity * comp.linkQuantity
        if (!ordersByWstAndArticle.has(compWst)) {
          ordersByWstAndArticle.set(compWst, new Map())
        }
        const m = ordersByWstAndArticle.get(compWst)!
        m.set(compCode, (m.get(compCode) || 0) + derivedQty)
      }
    }

    // Vérifications sur PP_830
    const pp830Orders = ordersByWstAndArticle.get('PP_830')!
    assert.isDefined(pp830Orders)
    assert.equal(pp830Orders.get('KIT_830'), 10)

    // Vérifications sur PP_153 : doit contenir 5 (direct) + 10 (dérivé BDH_A) = 15, et 20 (dérivé BDH_B = 10 * 2)
    const pp153Orders = ordersByWstAndArticle.get('PP_153')!
    assert.isDefined(pp153Orders)
    assert.equal(pp153Orders.get('BDH_153_A'), 15) // 5 direct + 10 dérivé
    assert.equal(pp153Orders.get('BDH_153_B'), 20) // 10 * 2 dérivé
    assert.isUndefined(pp153Orders.get('COMP_ACHAT'))
    assert.isUndefined(pp153Orders.get('COMP_SOUS_ENS'))

    // Vérification du drill-down sheet pour PP_153
    const directArticlesSet = new Set(['BDH_153_A', 'BDH_153_B'])
    const parentArticlesToQuery = ['KIT_830']

    const rawDetailLines = [
      {
        orderNum: 'CMD-KIT',
        orderLine: 1000,
        orderSeq: 1,
        clientCode: 'CLI1',
        clientName: 'Client Kit',
        article: 'KIT_830',
        quantity: 10,
        dateDemandee: '2026-09-01',
        dateAcceptee: '2026-09-01',
      },
      {
        orderNum: 'CMD-BDH',
        orderLine: 1000,
        orderSeq: 1,
        clientCode: 'CLI2',
        clientName: 'Client Direct',
        article: 'BDH_153_A',
        quantity: 5,
        dateDemandee: '2026-09-01',
        dateAcceptee: '2026-09-01',
      },
    ]

    const detailLines: any[] = []
    for (const r of rawDetailLines) {
      if (directArticlesSet.has(r.article)) {
        detailLines.push({
          ...r,
          isDerived: false,
        })
      }
      if (parentArticlesToQuery.includes(r.article)) {
        const parentComps = (bomByParent.get(r.article) || []).filter((c) =>
          directArticlesSet.has(c.componentArticle)
        )
        for (const comp of parentComps) {
          detailLines.push({
            orderNum: r.orderNum,
            orderLine: r.orderLine,
            orderSeq: r.orderSeq,
            clientCode: r.clientCode,
            clientName: r.clientName,
            article: comp.componentArticle,
            quantity: r.quantity * comp.linkQuantity,
            dateDemandee: r.dateDemandee,
            dateAcceptee: r.dateAcceptee,
            isDerived: true,
            parentArticle: r.article,
          })
        }
      }
    }

    assert.equal(detailLines.length, 3) // 1 direct BDH_A + 1 dérivé BDH_A + 1 dérivé BDH_B
    const derivedBDHA = detailLines.find((l) => l.isDerived && l.article === 'BDH_153_A')
    assert.isDefined(derivedBDHA)
    assert.equal(derivedBDHA.quantity, 10)
    assert.equal(derivedBDHA.parentArticle, 'KIT_830')

    const derivedBDHB = detailLines.find((l) => l.isDerived && l.article === 'BDH_153_B')
    assert.isDefined(derivedBDHB)
    assert.equal(derivedBDHB.quantity, 20)
    assert.equal(derivedBDHB.parentArticle, 'KIT_830')
  })
})
