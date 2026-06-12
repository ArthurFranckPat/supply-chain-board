/**
 * Test X3 via Lucid Model (SalesOrder.query())
 * Run: npx tsx bin/test_x3_model_instance.ts
 */

import '#start/env'
import { Ignitor } from '@adonisjs/core'
import app from '@adonisjs/core/services/app'

async function test() {
  console.log('=== Test X3 via Lucid Model ===\n')

  const APP_ROOT = new URL('./', import.meta.url)
  const IMPORTER = (filePath: string) => {
    if (filePath.startsWith('./') || filePath.startsWith('../')) {
      return import(new URL(filePath, APP_ROOT).href)
    }
    return import(filePath)
  }

  new Ignitor(APP_ROOT, { importer: IMPORTER })
    .tap((a) => {
      a.booting(async () => { await import('#start/env') })
      a.listen('SIGTERM', () => a.terminate())
    })
    .createApp('console')
    .boot()

  // Use the singleton app (same as app from @adonisjs/core/services/app)
  console.log('App booted, singleton app ready\n')

  // Get testUtils from the singleton app
  const testUtils = await app.container.make('testUtils')
  console.log('testUtils ready:', !!testUtils)

  // Load the SalesOrder model
  const { default: SalesOrder } = await import('#models/x3/sorder')
  console.log('SalesOrder table:', SalesOrder.table)
  console.log('SalesOrder connection:', (SalesOrder as any).connection)

  // Query via Lucid model
  const orders = await SalesOrder.query()
    .select('SOHNUM_0', 'BPCNAM_0', 'ORDDAT_0')
    .limit(3)

  console.log('\nLucid query result:')
  console.log('Count:', orders.length)
  orders.forEach((o: any, i: number) => {
    console.log(`  ${i+1}. SOHNUM_0=${o.sohnum0} BPCNAM_0=${o.bpcnam0} ORDDAT_0=${o.orddat0}`)
  })

  console.log('\nDone')
  process.exit(0)
}

test().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
