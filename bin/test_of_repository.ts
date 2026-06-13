import '#start/env'
import { Ignitor } from '@adonisjs/core'

const APP_ROOT = new URL('../', import.meta.url)
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

await new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((a) => {
    a.booting(async () => { await import('#start/env') })
    a.listen('SIGTERM', () => a.terminate())
  })
  .createApp('console')
  .boot()

const { X3OfRepository } = await import('#app/repositories/of_repository')
const repo = new X3OfRepository()
const flows = await repo.getSupplyFlows()

console.log(`Total: ${flows.length}, affichage 3 premiers:\n`)
flows.slice(0, 3).forEach((f, i) => {
  console.log(`[${i + 1}] OF=${(f.origin as any).id}  article=${f.article}  qte=${f.quantity}  fin=${f.date?.toISOString().slice(0, 10)}  statut=${(f.origin as any).status}  type=${(f.origin as any).typeOf}  designation=${(f.origin as any).designation}`)
})

process.exit(0)
