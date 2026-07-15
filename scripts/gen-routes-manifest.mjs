#!/usr/bin/env node
/**
 * Génère `inertia/lib/routes-manifest.ts` depuis les routes Adonis nommées.
 *
 * Source unique : `start/routes.ts` → on boote Adonis via `node ace list:routes --jsonl`
 * (chaque ligne = { method, pattern, name? }) et on en déduit un manifeste typé
 * consommé par le helper `inertia/lib/routes.ts`.
 *
 * Quand relancer : après TOUTE modification de `start/routes.ts` (ajout/retrait/renommage
 * de route, changement de paramètre de path). À exécuter via `npm run routes:gen`.
 *
 * Fraîcheur vérifiable au CI : `npm run routes:check` (régénère puis `git diff --exit-code`).
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'inertia/lib/routes-manifest.ts')

const PARAM_RE = /:([A-Za-z_]\w*)/g

/** Noms de params de path extraits d'un pattern type Adonis `/api/.../ofs/:numOf`. */
function paramNames(pattern) {
  return [...pattern.matchAll(PARAM_RE)].map((m) => m[1])
}

// Boote Adonis et récupère le JSONL sur stdout. On filtre les lignes non-JSON
// (ex. bannière dotenvx « ⟐ injected env ... » qui pollue parfois le pipe).
const raw = execFileSync('node', ['ace', 'list:routes', '--jsonl'], {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
})

const routes = []
for (const line of raw.split('\n')) {
  const t = line.trim()
  if (!t || !t.startsWith('{')) continue
  const o = JSON.parse(t)
  // Les closures sans `.as()` ne sont pas adressables côté frontend par nom.
  if (!o.name) continue
  routes.push({ name: o.name, method: o.method, pattern: o.pattern })
}

routes.sort((a, b) => a.name.localeCompare(b.name))

const manifestEntries = routes
  .map(
    (r) =>
      `  ${JSON.stringify(r.name)}: { method: ${JSON.stringify(r.method)}, pattern: ${JSON.stringify(r.pattern)} }`
  )
  .join(',\n')

const paramEntries = routes
  .map((r) => {
    const ps = paramNames(r.pattern)
    const t =
      ps.length === 0
        ? 'void'
        : `{ ${ps.map((p) => `${JSON.stringify(p)}: string | number`).join('; ')} }`
    return `  ${JSON.stringify(r.name)}: ${t}`
  })
  .join(',\n')

const banner = `/**
 * AUTO-GÉNÉRÉ par scripts/gen-routes-manifest.mjs — NE PAS ÉDITER À LA MAIN.
 * Source : \`start/routes.ts\` → \`node ace list:routes --jsonl\`.
 * Régénérer : \`npm run routes:gen\` · Vérifier la fraîcheur : \`npm run routes:check\`.
 * ${routes.length} routes nommées.
 */
`

const body = `${banner}
export const MANIFEST = {
${manifestEntries},
} as const satisfies Record<string, { method: string; pattern: string }>

export type RouteName = keyof typeof MANIFEST

/**
 * Params de path attendus par route (côté frontend).
 * \`void\` = aucun paramètre de path ; les query strings (?start&days…) restent à l'appelant.
 */
export type RouteParams = {
${paramEntries}
}
`

writeFileSync(OUT, body)
console.log(`✓ ${routes.length} routes → ${OUT.replace(ROOT + '/', '')}`)
