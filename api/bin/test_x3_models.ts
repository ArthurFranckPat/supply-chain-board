/**
 * Test X3 via X3Database (Knex wrapper)
 * Run: npx tsx bin/test_x3_models.ts
 */

import '#start/env'
import { X3Database } from '#app/database/x3_database'

async function test() {
  console.log('=== Test X3 via X3Database ===\n')

  const db = new X3Database()

  // Simple raw query
  console.log('1. Raw query: SELECT SOHNUM_0, BPCNAM_0, ORDDAT_0 FROM SORDER')
  const orders = await db.raw(
    'SELECT SOHNUM_0, BPCNAM_0, ORDDAT_0 FROM SORDER FETCH FIRST 3 ROWS ONLY'
  )
  console.log('Result:', JSON.stringify(orders, null, 2))

  // Query builder
  console.log('\n2. Query builder: db.from("SORDER").select().limit(3)')
  const rows = await db
    .from('SORDER')
    .select('SOHNUM_0', 'BPCNAM_0', 'ORDDAT_0')
    .limit(3)
  console.log('Result:', JSON.stringify(rows, null, 2))

  await db.destroy()
  console.log('\nDone')
  process.exit(0)
}

test().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
