/**
 * Test X3 connection via REPL console
 * Run: node ace repl < bin/test_x3.ts
 * Or: npx tsx bin/test_x3.ts
 */

import '#start/env'
import { X3Database } from '#app/x3/client/x3_database'

async function test() {
  console.log('=== Test X3 via X3Database ===')

  const db = new X3Database()
  console.log('X3Database instantiated')

  const result = await db.raw(
    'SELECT SOHNUM_0, BPCNAM_0, ORDDAT_0 FROM SORDER WHERE ROWNUM <= 3'
  )
  console.log('Result:', JSON.stringify(result, null, 2))

  await db.destroy()
  console.log('Done')
  process.exit(0)
}

test().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
