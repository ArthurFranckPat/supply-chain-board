/*
| Diagnostic hors HTTP : compare la faisabilité PHOTO (mode immédiat) et la
| faisabilité EN FILE (mode projeté, contention par ligne) sur les mêmes données.
|
| Sert à vérifier l'ordre de la file (dates d'expédition issues du matching) et à
| mesurer combien d'OF basculent entre les deux lectures.
|
| Usage :
|   dotenvx run -q -- node --import @poppinss/ts-exec bin/diag_file_sequentielle.ts [POSTE] [--days=90] [--all]
|
| POSTE  = code poste (ex. PP_830). Absent → balaie tous les postes et classe les
|          lignes par nombre d'OF qui basculent.
| --all  = affiche toutes les lignes du poste, pas seulement les 40 premières.
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
const showAll = argv.includes('--all')
const daysArg = argv.find((a) => a.startsWith('--days='))
const horizon = daysArg ? Number(daysArg.slice(7)) : 90
const poste = (argv.find((a) => !a.startsWith('--')) ?? '').trim()

const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER }).tap((app) => {
  app.booting(async () => {
    await import('#start/env')
  })
})
const app = ignitor.createApp('console')
await app.init()
await app.boot()
await app.start(() => {})

const { loadOrderImpacts } = await import('#services/order_impacts_loader')
const { getX3EnvConfig } = await import('#config/x3')

const from = new Date()
from.setDate(from.getDate() - 7)
from.setHours(0, 0, 0, 0)
const to = new Date()
to.setDate(to.getDate() + horizon)
to.setHours(23, 59, 59, 999)

const iso = (d: Date) => d.toISOString().slice(0, 10)
console.log(
  `Env ${getX3EnvConfig().pool} · poste ${poste || '(tous)'} · fenêtre ${iso(from)} → ${iso(to)}`
)

const common = {
  from,
  to,
  force: false,
  ...(poste ? { workstation: poste.toLowerCase() } : {}),
}

const t0 = Date.now()
const photo = await loadOrderImpacts({ ...common, mode: 'immediate', pipeline: 'board-badges' })
const t1 = Date.now()
const file = await loadOrderImpacts({
  ...common,
  mode: 'sequential',
  pipeline: 'board-contention',
})
const t2 = Date.now()

const byPhoto = new Map(photo.result.ofs.map((o) => [o.numOf, o]))

/** Date d'expédition retenue par le matching — c'est elle qui ordonne la file. */
const shipment = new Map<string, string>()
for (const order of file.result.orders) {
  for (const of of order.ofs) {
    if (!order.dateExpedition) continue
    const known = shipment.get(of.numOf)
    if (!known || order.dateExpedition < known) shipment.set(of.numOf, order.dateExpedition)
  }
}

/** Poste de l'OF (même résolution que la charge) — pour le balayage tous postes. */
const { default: boardDataset } = await import('#services/board_dataset')
const { gamme } = await boardDataset.getReferential()
const wstByArticle = new Map<string, string>()
for (const g of gamme) {
  if (g.workstation && g.article) wstByArticle.set(g.article, g.workstation)
}

const missCount = (m: Record<string, number> | undefined) => Object.keys(m ?? {}).length
const rows = file.result.ofs.map((o) => {
  const p = byPhoto.get(o.numOf)
  return {
    numOf: o.numOf,
    article: o.article,
    poste: wstByArticle.get(o.article) ?? '',
    statut: o.statutNum,
    exp: shipment.get(o.numOf) ?? null,
    photoOk: p?.feasible ?? null,
    fileOk: o.feasible,
    photoMiss: missCount(p?.missingComponents),
    fileMiss: missCount(o.missingComponents),
  }
})

rows.sort((a, b) => {
  const ta = a.exp ?? '9999-12-31'
  const tb = b.exp ?? '9999-12-31'
  if (ta !== tb) return ta < tb ? -1 : 1
  if (a.statut !== b.statut) return a.statut - b.statut
  return a.numOf.localeCompare(b.numOf)
})

const bascule = (r: (typeof rows)[number]) => r.photoOk !== r.fileOk
const plusManque = (r: (typeof rows)[number]) => r.fileMiss > r.photoMiss

console.log(
  `OF évalués ${rows.length} · photo ${t1 - t0} ms · file ${t2 - t1} ms · bascules ${rows.filter(bascule).length} · manques aggravés ${rows.filter(plusManque).length}`
)
console.log(`Sans date d'expédition (fin de file) : ${rows.filter((r) => !r.exp).length}`)

if (!poste) {
  const parPoste = new Map<string, { total: number; bascule: number; manque: number }>()
  for (const r of rows) {
    const k = r.poste || '(sans poste)'
    const e = parPoste.get(k) ?? { total: 0, bascule: 0, manque: 0 }
    e.total++
    if (bascule(r)) e.bascule++
    if (plusManque(r)) e.manque++
    parPoste.set(k, e)
  }
  console.log('\n--- LIGNES OÙ LA FILE CHANGE LE VERDICT ---')
  const classement = [...parPoste.entries()]
    .filter(([, e]) => e.bascule > 0 || e.manque > 0)
    .sort((a, b) => b[1].bascule - a[1].bascule || b[1].manque - a[1].manque)
  if (classement.length === 0) console.log('(aucune)')
  for (const [k, e] of classement.slice(0, 25)) {
    console.log(
      `${k.padEnd(14)} OF ${String(e.total).padStart(4)} · bascules ${String(e.bascule).padStart(3)} · manques aggravés ${String(e.manque).padStart(3)}`
    )
  }
} else {
  console.log('\n--- ORDRE DE LA FILE (expédition, statut, n°) ---')
  const list = showAll ? rows : rows.slice(0, 40)
  for (const r of list) {
    const flag = bascule(r) ? ' <<< BASCULE' : plusManque(r) ? ' <<< +MANQUE' : ''
    console.log(
      `${(r.exp ?? '—').padEnd(11)} st${r.statut} ${r.numOf.padEnd(13)} ${r.article.padEnd(16)} photo=${String(r.photoOk).padEnd(5)}(${r.photoMiss}) file=${String(r.fileOk).padEnd(5)}(${r.fileMiss})${flag}`
    )
  }
  if (!showAll && rows.length > 40) console.log(`… ${rows.length - 40} de plus (--all)`)
}

await app.terminate()
