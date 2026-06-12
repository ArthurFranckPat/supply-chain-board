import { test } from '@japa/runner'
import { X3Database } from '#app/x3/client/x3_database'
import app from '@adonisjs/core/services/app'
import SalesOrder from '#models/x3/sorder'
import { X3OfRepository } from '#app/repositories/of_repository'
import { X3StockRepository } from '#app/repositories/stock_repository'
import { X3ReceptionRepository } from '#app/repositories/reception_repository'
import { X3BesoinClientRepository } from '#app/repositories/besoin_client_repository'
import { X3GammeRepository } from '#app/repositories/gamme_repository'

test.group('X3 Models', () => {
  test('SalesOrder.query() returns SORDER data from X3', async ({ assert }) => {
    const orders = await SalesOrder.query()
      .select('SOHNUM_0', 'BPCNAM_0', 'ORDDAT_0')
      .limit(3)

    assert.isArray(orders)
    assert.equal(orders.length, 3)
    // Lucid uses TypeScript property names as $attributes keys (not column names)
    assert.equal(orders[0].$attributes.noCommande, 'AR0802469')
    assert.equal(orders[0].$attributes.nomClientCommande, 'AERECO GmbH')
  })

  test('SalesOrder.query() with where clause', async ({ assert }) => {
    const orders = await SalesOrder.query()
      .select('SOHNUM_0', 'BPCNAM_0')
      .where('SOHNUM_0', 'AR0802469')
      .limit(1)

    assert.equal(orders.length, 1)
    assert.equal(orders[0].$attributes.noCommande, 'AR0802469')
    assert.equal(orders[0].$attributes.nomClientCommande, 'AERECO GmbH')
  })

  test('SalesOrder.query() with orderBy', async ({ assert }) => {
    const orders = await SalesOrder.query()
      .select('SOHNUM_0', 'ORDDAT_0')
      .orderBy('ORDDAT_0', 'desc')
      .limit(3)

    assert.isArray(orders)
    assert.equal(orders.length, 3)
  })

  test('X3Database raw query returns same data', async ({ assert }) => {
    const db = new X3Database()
    const rows = await db.raw(
      'SELECT SOHNUM_0, BPCNAM_0, ORDDAT_0 FROM SORDER FETCH FIRST 3 ROWS ONLY'
    )

    assert.isArray(rows)
    assert.equal(rows.length, 3)
    assert.equal(rows[0].SOHNUM_0, 'AR0802469')
    assert.equal(rows[0].BPCNAM_0, 'AERECO GmbH')
    await db.destroy()
  })

  test('x3db from container (like controllers use) returns SORDER data', async ({ assert }) => {
    const db = await app.container.make('x3db') as X3Database
    const rows = await db
      .from('SORDER')
      .select('SOHNUM_0', 'BPCNAM_0')
      .limit(2)

    assert.equal(rows.length, 2)
    assert.equal(rows[0].SOHNUM_0, 'AR0802469')
  })

  test('X3StockRepository returns stock flows from ITMMVT', async ({ assert }) => {
    const repo = new X3StockRepository()
    const flows = await repo.getStockFlows()
    assert.isArray(flows)
    assert.isAbove(flows.length, 0)
    for (const f of flows.slice(0, 3)) {
      const o = f.origin as Extract<typeof f.origin, { type: 'stock' }>
      console.log(`[STOCK] article=${f.article}  qte=${f.quantity}  subType=${o.subType}  pmp=${o.pmp}`)
    }
    const strictFlows = flows.filter(f => (f.origin as any).subType === 'strict')
    assert.isAbove(strictFlows.length, 0)
  })

  test('X3ReceptionRepository returns reception flows from PORDERQ', async ({ assert }) => {
    const repo = new X3ReceptionRepository()
    const flows = await repo.getReceptionFlows()
    assert.isArray(flows)
    assert.isAbove(flows.length, 0)
    for (const f of flows.slice(0, 3)) {
      const o = f.origin as Extract<typeof f.origin, { type: 'reception' }>
      const fmtFR = (d: Date | null) => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : 'N/A'
      console.log(`[REC] id=${o.id}  article=${f.article}  qte=${f.quantity}  dateFin=${fmtFR(f.date)}  fournisseur=${o.supplier}`)
    }
  })

  test('X3BesoinClientRepository returns demand flows from ORDERS', async ({ assert }) => {
    const repo = new X3BesoinClientRepository()
    const flows = await repo.getDemandFlows()
    assert.isArray(flows)
    assert.isAbove(flows.length, 0)
    const fmtFR = (d: Date | null) => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : 'N/A'
    for (const f of flows.slice(0, 3)) {
      const o = f.origin as any
      console.log(`[BESOIN] id=${o.id}  article=${f.article}  qte=${f.quantity}  type=${o.type}  client=${o.customer}  pays=${o.pays}  orderType=${o.orderType}  echeance=${fmtFR(f.date)}`)
    }
  })

  test('X3GammeRepository returns first operation per article', async ({ assert }) => {
    const repo = new X3GammeRepository()
    const ops = await repo.getFirstOperations()
    assert.isArray(ops)
    assert.isAbove(ops.length, 0)
    for (const op of ops.slice(0, 3)) {
      console.log(`[GAMME] article=${op.article}  poste=${op.workstation}  libelle=${op.workstationLabel}  cadence=${op.rate}`)
    }
    assert.isString(ops[0].article)
    assert.isString(ops[0].workstation)
  })

  test('X3OfRepository resolves statutLabel from local_menus', async ({ assert }) => {
    const repo = new X3OfRepository()
    const flows = await repo.getSupplyFlows()
    assert.isArray(flows)
    assert.isAbove(flows.length, 0)
    const ofFlows = flows.filter(f => f.origin.type === 'of').slice(0, 3)
    for (const f of ofFlows) {
      const o = f.origin as Extract<typeof f.origin, { type: 'of' }>
      console.log(`[OF] id=${o.id}  article=${f.article}  qte=${f.quantity}  statut=${o.status}  statutLabel=${o.statutLabel}  typeOf=${o.typeOf}  typeOfLabel=${o.typeOfLabel}  designation=${o.designation}`)
      assert.isNotNull(o.statutLabel, `OF ${o.id}: statutLabel should not be null`)
      assert.include(['Ferme', 'Planifié', 'Suggéré'], o.statutLabel!)
    }
  })
})
