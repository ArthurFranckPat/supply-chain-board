/**
 * Construit les MCP Apps (issue #89) en fichiers HTML autonomes.
 *
 *   npm run mcp:apps          → construit resources/mcp-apps/<app>.html
 *   npm run mcp:apps:check    → échoue si l'artefact commité n'est plus à jour
 *
 * Pourquoi un script plutôt qu'une entrée du build principal :
 *  - Le HTML doit être **autonome** : JS et CSS inlinés, zéro requête réseau. La
 *    resource `ui://supply-board/<app>` est servie par le protocole MCP, pas par un
 *    serveur de fichiers, et la CSP déclarée n'autorise aucun domaine.
 *  - Une app par build (`inlineDynamicImports`) : avec plusieurs entrées, Rollup
 *    sortirait un chunk commun (React) partagé entre apps — inlinable seulement au
 *    prix d'un graphe d'imports à recoller. Une app = un chunk = une substitution.
 *  - L'artefact est **commité** (contrainte #80 : `npm run mcp:start` doit marcher
 *    sur un PC vierge, sans build front préalable). Même précédent que
 *    `inertia-react/lib/routes-manifest.ts` et son `routes:check`.
 */

import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const APPS_DIR = path.join(ROOT, 'inertia-react/mcp-apps')
const OUT_DIR = path.join(ROOT, 'resources/mcp-apps')

/**
 * Inline le chunk JS et les CSS dans le HTML, puis renomme `index.html` en
 * `<app>.html` — c'est le nom que `mcpAppHtmlPath()` (mcp_apps.ts) va lire.
 */
function inlineSingleFile(appName) {
  return {
    name: 'mcp-app-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith('.html'))
      if (!htmlKey) throw new Error(`[mcp:apps] ${appName} : aucun HTML produit`)
      const htmlAsset = bundle[htmlKey]
      let html = String(htmlAsset.source)

      // Les contenus sont d'abord remplacés par des jetons, puis substitués tout à
      // la fin : le code bundlé contient lui-même des chaînes qui ressemblent à des
      // attributs `src="…"` (React, sourcemaps) et ferait échouer le contrôle
      // « plus aucune référence externe » s'il était déjà inséré.
      const inserts = new Map()
      let token = 0
      const placeholder = (content) => {
        const key = `<!--mcp-inline-${token++}-->`
        inserts.set(key, content)
        return key
      }

      for (const [key, file] of Object.entries(bundle)) {
        if (key === htmlKey) continue

        if (file.type === 'chunk') {
          // `</script` dans le code fermerait la balise hôte prématurément.
          const code = file.code.replace(/<\/script/gi, '<\\/script')
          const tag = new RegExp(`<script[^>]*src="[^"]*${escapeRe(file.fileName)}"[^>]*></script>`)
          if (!tag.test(html))
            throw new Error(
              `[mcp:apps] ${appName} : chunk ${file.fileName} non référencé par le HTML`
            )
          html = html.replace(tag, placeholder(`<script type="module">${code}</script>`))
          delete bundle[key]
          continue
        }

        if (file.fileName.endsWith('.css')) {
          const css = String(file.source)
          const tag = new RegExp(`<link[^>]*href="[^"]*${escapeRe(file.fileName)}"[^>]*>`)
          if (!tag.test(html))
            throw new Error(
              `[mcp:apps] ${appName} : CSS ${file.fileName} non référencé par le HTML`
            )
          html = html.replace(tag, placeholder(`<style>${css}</style>`))
          delete bundle[key]
          continue
        }

        // Tout autre asset resterait un fichier séparé → requête réseau interdite.
        throw new Error(
          `[mcp:apps] ${appName} : asset non inlinable "${file.fileName}" — l'embarquer en data: URI ou le supprimer`
        )
      }

      if (/(?:src|href)="(?!data:)[^"]*\.(?:js|css|woff2?|png|svg|jpe?g)"/i.test(html)) {
        throw new Error(`[mcp:apps] ${appName} : le HTML référence encore un fichier externe`)
      }

      for (const [key, content] of inserts) html = html.replace(key, () => content)

      delete bundle[htmlKey]
      this.emitFile({ type: 'asset', fileName: `${appName}.html`, source: html })
    },
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listApps() {
  let entries
  try {
    entries = await readdir(APPS_DIR)
  } catch (err) {
    if (err && err.code === 'ENOENT') return []
    throw err
  }
  const apps = []
  for (const name of entries) {
    const dir = path.join(APPS_DIR, name)
    if ((await stat(dir)).isDirectory()) apps.push({ name, dir })
  }
  return apps
}

const apps = await listApps()
if (apps.length === 0) {
  console.log(`[mcp:apps] aucune app dans ${APPS_DIR} — rien à construire`)
  process.exit(0)
}

for (const app of apps) {
  await build({
    configFile: false,
    root: app.dir,
    // Les primitives de graphiques vivent dans le kit partagé (`@r/…`) : le
    // même alias que le build principal, sinon chart.tsx ne résoudrait pas
    // ses imports en « @r/lib/charts/theme ».
    resolve: {
      alias: [{ find: '@r', replacement: path.join(ROOT, 'inertia-react') }],
    },
    // Chemins relatifs : le HTML est lu depuis une iframe sandbox sans origine
    // stable, un chemin absolu `/assets/...` n'y voudrait rien dire.
    base: './',
    logLevel: 'warn',
    plugins: [react(), inlineSingleFile(app.name)],
    build: {
      outDir: OUT_DIR,
      // Plusieurs apps écrivent dans le même dossier, et l'artefact est commité :
      // vider le dossier effacerait les autres apps à chaque build.
      emptyOutDir: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      modulePreload: false,
      // Bundle déterministe : hash figé, sinon le diff git bouge à chaque build.
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: 'app.js',
          assetFileNames: 'app.[ext]',
        },
      },
    },
  })
  console.log(`[mcp:apps] ${app.name} → resources/mcp-apps/${app.name}.html`)
}
