/*
| Diagnostic hors HTTP de la vue PROACTIVE de /suivi.
|
| Rejoue la chaîne exacte de `SuiviController.proactiveRows` en exposant les
| étapes intermédiaires :
|   1. matching commande→OF (CommandeOFMatcher, mêmes entrées que le moteur)
|   2. verdict de faisabilité par OF (missingComponents)
|   3. agrégation affichée dans la colonne « Composants en rupture »
|
| Usage :
|   dotenvx run -q -- node --import @poppinss/ts-exec bin/diag_proactive.ts [FILTRE] [--json]
|
| FILTRE = sous-chaîne sur n° commande, client, article ou composant.
| Sans filtre : toutes les lignes ayant au moins un composant en rupture.
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
const needle = (argv.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase()

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
const { RETARD_LOOKBACK_DAYS, SUIVI_FORWARD_DAYS } = await import('#services/suivi_service')
const { CommandeOFMatcher } = await import('#app/domain/of_conso')
const { buildProactiveDisplay } = await import('#controllers/suivi_controller')
const { groupReceptionsByArticle, RECEPTION_LOOKBACK_DAYS } =
  await import('#repositories/reception_repository')
type Flow = import('#app/domain/models/flow').Flow

const refDate = new Date()
const from = new Date(refDate)
from.setDate(from.getDate() - RETARD_LOOKBACK_DAYS)
const to = new Date(refDate)
to.setDate(to.getDate() + SUIVI_FORWARD_DAYS)

console.log(
  `# Fenêtre ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} · pipeline=proactive · mode=sequential`
)

const ctx = await loadOrderImpacts({ from, to, mode: 'sequential', pipeline: 'proactive' })
const { result, articles, nomenclatures, receptionFlows, planInputs, fabricationHoursByOf } = ctx

// ---- Étape 1 : matching commande→OF (mêmes entrées que evaluateOrderImpacts) ----
const windowDemands = planInputs.demands.filter((d: Flow) => {
  if (d.direction !== 'demand' || d.quantity <= 0) return false
  if (!d.date) return false
  return d.date >= from && d.date <= to
})
const matcher = new CommandeOFMatcher(planInputs.supplyFlows, articles, nomenclatures, 30)
const matchings = matcher.matchCommandes(windowDemands)
// La ligne d'affichage ne porte pas le n° de ligne X3 : clé = commande|article|date expé.
// Plusieurs lignes d'une même commande sur le même article et la même date se cumulent
// dans le même seau — c'est signalé plutôt que masqué.
const matchByKey = new Map<string, (typeof matchings)[number][]>()
for (const m of matchings) {
  const o = m.demandFlow.origin as { id?: string }
  const iso = m.demandFlow.date?.toISOString().slice(0, 10) ?? ''
  const k = `${o.id ?? ''}|${m.demandFlow.article}|${iso}`
  matchByKey.set(k, [...(matchByKey.get(k) ?? []), m])
}

// ---- Étape 3 : rendu exact de la colonne ----
const recFrom = new Date(refDate)
recFrom.setDate(recFrom.getDate() - RECEPTION_LOOKBACK_DAYS)
recFrom.setHours(0, 0, 0, 0)
const receptionsByArticle = groupReceptionsByArticle(receptionFlows, recFrom)
const built = buildProactiveDisplay(
  result,
  articles,
  receptionsByArticle,
  new Map(),
  { nomenclatures, supplyFlows: planInputs.supplyFlows },
  fabricationHoursByOf
)

const rows = (built.rows as any[]).filter((r) => {
  if (!needle) return r.composants.length > 0
  return (
    r.numCommande.toLowerCase().includes(needle) ||
    (r.client ?? '').toLowerCase().includes(needle) ||
    (r.article ?? '').toLowerCase().includes(needle) ||
    r.composants.some((c: any) => c.art.toLowerCase().includes(needle))
  )
})

console.log(
  `# ${built.rows.length} lignes proactives · ${rows.length} retenues · verdicts=${JSON.stringify(built.verdictCounts)}`
)
console.log(
  `# demandes fenêtre=${windowDemands.length} · supply=${planInputs.supplyFlows.length} · OF évalués=${result.ofs.length}`
)

if (asJson) {
  console.log(JSON.stringify(rows, null, 2))
  await app.terminate()
  process.exit(0)
}

// --besoins=ARTICLE : détaille, pour chaque OF produisant cet article, le besoin brut
// résolu par le moteur (avant contention) — met en regard la taille de l'OF et le manque
// affiché dans la colonne.
const besoinsArt = (argv.find((a) => a.startsWith('--besoins=')) ?? '').split('=')[1]
if (besoinsArt) {
  const { resolveOfRequirements, buildOfSupply: mkSupply } =
    await import('#app/domain/rupture_engine')
  const stockNet = new Map<string, number>()
  for (const f of planInputs.supplyFlows) {
    if (f.date !== null) continue
    stockNet.set(
      f.article,
      (stockNet.get(f.article) ?? 0) + (f.direction === 'supply' ? f.quantity : -f.quantity)
    )
  }
  const engineOfs = planInputs.supplyFlows
    .filter((f) => f.direction === 'supply' && f.origin.type === 'of' && f.quantity > 0)
    .map((f) => ({
      numOf: (f.origin as any).id ?? '',
      article: f.article,
      qteRestante: f.quantity,
      statutNum: (f.origin as any).status ?? 3,
      dateBesoin: f.date ? new Date(f.date) : null,
    }))
  const ds = {
    articles,
    nomenclatures,
    stockNet,
    ofSupply: mkSupply(engineOfs),
  }
  for (const of of engineOfs.filter((o) => o.article === besoinsArt)) {
    console.log(
      `\nOF ${of.numOf} · qteRestante=${of.qteRestante} · statut=${of.statutNum} · besoin=${of.dateBesoin?.toISOString().slice(0, 10)}`
    )
    for (const req of resolveOfRequirements(of, ds)) {
      const stock = stockNet.get(req.article) ?? 0
      console.log(
        `   ${req.article} besoin=${req.need} fabriqué=${req.fabricated} stockNetGlobal=${stock} ofSupply=${ds.ofSupply.get(req.article) ?? 0}`
      )
    }
  }
  await app.terminate()
  process.exit(0)
}

for (const r of rows) {
  const key = `${r.numCommande}|${r.article}|${r.dateExpIso ?? ''}`
  const candidats = matchByKey.get(key) ?? []
  const m = candidats[0]
  console.log('')
  console.log('='.repeat(100))
  console.log(`${r.numCommande} · ${r.client} · ${r.article} (${r.designation ?? ''})`)
  console.log(
    `  expé=${r.dateExp} (${r.dateExpIso}) · type=${r.type} · qté=${r.qteRestante} · alloué=${r.qteAllouee} · reliquat=${r.reliquat}\n  verdict=${r.verdictLabel} (${r.verdictKey}) · retard=${r.joursRetard}j · couverture=${r.couverture}`
  )

  console.log('  -- 1. MATCHING --')
  if (candidats.length > 1) {
    console.log(`     (${candidats.length} lignes de demande partagent cette clé — 1ʳᵉ détaillée)`)
  }
  if (!m) {
    console.log('     (aucun résultat de matching — ligne hors windowDemands ?)')
  } else {
    const o = m.demandFlow.origin as any
    console.log(
      `     méthode=${m.matchingMethod} · type=${o.orderType} · contremarque=${o.contremarque ?? '—'}`
    )
    console.log(
      `     demande nettée=${m.demandFlow.quantity} · non couvert=${m.remainingUncoveredQty}`
    )
    if (m.stockAllocation) {
      console.log(
        `     stock: dispo=${m.stockAllocation.qteDisponible} alloué=${m.stockAllocation.qteAllouee} besoinNet=${m.stockAllocation.besoinNet}`
      )
    }
    for (const a of m.ofAllocations) {
      const oo = a.ofFlow.origin as any
      console.log(
        `     OF ${oo.id} (statut ${oo.status}, fin ${a.ofFlow.date?.toISOString().slice(0, 10) ?? '—'}) ` +
          `alloué=${a.qteAllouee} [dispo ${a.qteDisponibleAvant}→${a.qteDisponibleApres}] « ${a.matchReason} »`
      )
    }
    for (const al of m.alerts) console.log(`     ! ${al}`)
  }

  console.log('  -- 2. FAISABILITE PAR OF --')
  for (const of of r.ofs) {
    const miss = of.missingComponents.map((c: any) => `${c.art}x${c.qty}`).join(', ') || '—'
    console.log(
      `     OF ${of.numOf} · art=${of.article} · qté=${of.qteAllouee} · fin=${of.dateFin} · statut=${of.statutNum} · feasible=${of.feasible}`
    )
    console.log(`        manquants: ${miss}`)
  }

  console.log('  -- 3. COLONNE COMPOSANTS EN RUPTURE --')
  for (const c of r.composants) {
    const parts = [`${c.art} manque ${c.qty}`]
    if (c.qc) parts.push(`dont Q=${c.qc}`)
    if (c.couvertParOf) {
      parts.push(
        `couvert par OF ${c.couvertParOf.ofs.map((x: any) => x.numOf).join('/')} (${c.couvertParOf.parOf})`
      )
    }
    if (c.reception) {
      parts.push(
        `réception ${c.reception.po} ETA ${c.reception.eta}${c.reception.overdue ? ' EN RETARD' : ''}`
      )
    }
    if (c.descente) {
      parts.push(
        c.descente.statut === 'se_a_lancer'
          ? 'SE à lancer'
          : `SE bloqué par ${c.descente.par.map((p: any) => `${p.art}x${p.manque}`).join(', ')}`
      )
    }
    console.log(`     * ${parts.join(' · ')}   [${c.desc}]`)
  }
  if (!r.composants.length) console.log('     (aucun)')
}

await app.terminate()
process.exit(0)
