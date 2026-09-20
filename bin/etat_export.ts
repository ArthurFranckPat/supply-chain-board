/*
| État hebdomadaire des commandes export (skill `etat-commandes-export`).
|
| Doublon assumé de `node ace otd:hebdo` : le chargeur de commandes d'ace échoue
| sous Node 26 sur ce worktree, pour toutes les commandes locales. Ce script est
| donc le point d'entrée RÉEL tant que ce n'est pas réparé. Il ne duplique aucune
| logique — tout vient de `export_causes_service`.
|
| Usage :
|   dotenvx run -q -- node --import @poppinss/ts-exec bin/etat_export.ts [recul] [--json]
|
| recul = 1 (défaut) pour la semaine dernière, 2 pour celle d'avant, etc.
*/

await import('reflect-metadata')
const { Ignitor } = await import('@adonisjs/core')

const APP_ROOT = new URL('../', import.meta.url)
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const recul = Number.parseInt(argv.find((a) => !a.startsWith('--')) ?? '1', 10) || 1

const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER }).tap((app) => {
  app.booting(async () => {
    await import('#start/env')
  })
})
const app = ignitor.createApp('console')
await app.init()
await app.boot()
await app.start(() => {})

const { construireEtatExport, formaterEtatTexte } = await import('#services/export_causes_service')
const complet = await construireEtatExport(recul)

if (asJson) {
  console.log(
    JSON.stringify({ ...complet.etat, causes: Object.fromEntries(complet.causes) }, null, 2)
  )
} else {
  for (const ligne of formaterEtatTexte(complet)) console.log(ligne)
}
process.exit(0)
