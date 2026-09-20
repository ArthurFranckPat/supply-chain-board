import { execFileSync } from 'node:child_process'
import { readdirSync, readlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Signature d'un serveur de dev de ce projet : le superviseur (`node ace serve`)
 * comme le processus applicatif qu'il relance (`bin/server.ts`), plus un
 * `vite` lancé à la main. Chacun de ces processus ouvre un serveur Vite, donc
 * un optimizer de deps, donc le même `node_modules/.vite`.
 */
const SIGNATURES = [/\bbin\/server\.(ts|js)\b/, /\bace\b[^\n]*\bserve\b/, /\bvite\b(?!st)(\s|$)/]

/** Un build ne tient pas de serveur : il n'entre jamais en conflit de cache. */
const NOT_A_DEV_SERVER = [/\bace\b[^\n]*\bbuild\b/, /\bvite\b[^\n]*\bbuild\b/, /\bvitest\b/]

function sh(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

/** PID de nos propres ancêtres : les tuer reviendrait à se tuer soi-même. */
function ancestors() {
  const seen = new Set([process.pid])
  let pid = process.ppid
  while (pid && pid > 1 && !seen.has(pid)) {
    seen.add(pid)
    const parent = Number(sh('ps', ['-o', 'ppid=', '-p', String(pid)]).trim())
    if (!Number.isInteger(parent)) break
    pid = parent
  }
  return seen
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function cwdOf(pid) {
  if (process.platform === 'linux') {
    try {
      return readlinkSync(`/proc/${pid}/cwd`)
    } catch {
      return null
    }
  }
  // macOS : pas de /proc, lsof est le seul accès au cwd d'un autre processus.
  const out = sh('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
  const line = out.split('\n').find((l) => l.startsWith('n'))
  return line ? line.slice(1) : null
}

/**
 * Termine les autres serveurs de dev ouverts sur CE worktree, et fait le
 * ménage des restes d'optimisation interrompue.
 *
 * Pourquoi : deux serveurs Vite qui partagent un `cacheDir` se le volent. Au
 * démarrage et à chaque dep découverte, l'optimizer supprime `deps/` et le
 * reconstruit avec un `browserHash` neuf ; le client de l'autre serveur, lui,
 * demande toujours l'ancien `?v=` et reçoit « 504 (Outdated Optimize Dep) ».
 * L'import dynamique de la page rejette, en boucle, sur n'importe quelle page.
 * Un serveur orphelin (terminal fermé, TTY `??`) peut tenir des jours sans
 * écouter de port : une garde par port ne le voit pas, le cwd si.
 *
 * @param {string} root      racine du worktree
 * @param {string} cacheDir  node_modules/.vite
 * @param {(msg: string) => void} warn
 */
export async function killRivalDevServers(root, cacheDir, warn) {
  // `ps`/`lsof`/`/proc` : le repérage par cwd n'existe que sur Unix. Le
  // ménage du cacheDir, lui, reste utile partout.
  const victims = []
  const unix = process.platform === 'darwin' || process.platform === 'linux'
  const mine = unix ? ancestors() : new Set()

  for (const line of (unix ? sh('ps', ['-axo', 'pid=,command=']) : '').split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/)
    if (!match) continue
    const pid = Number(match[1])
    const command = match[2]
    if (mine.has(pid)) continue
    if (!SIGNATURES.some((re) => re.test(command))) continue
    if (NOT_A_DEV_SERVER.some((re) => re.test(command))) continue
    if (cwdOf(pid) !== root) continue
    victims.push({ pid, command })
  }

  if (victims.length > 0) {
    for (const { pid, command } of victims) {
      warn(
        `[single-dev-server] serveur de dev concurrent sur ce worktree (pid ${pid}) — arrêt.\n` +
          `  ${command.slice(0, 120)}\n` +
          `  Deux serveurs Vite partagent node_modules/.vite et se volent le cache ` +
          `(504 Outdated Optimize Dep).`
      )
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* déjà mort */
      }
    }

    // `node ace serve` IGNORE SIGTERM (vérifié : survit >3 s) et relance son
    // enfant `bin/server.ts`. Sans escalade, le garde ne garde rien.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    for (const { pid } of victims) {
      if (!alive(pid)) continue
      warn(`[single-dev-server] pid ${pid} a ignoré SIGTERM — SIGKILL.`)
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* déjà mort */
      }
    }
  }

  // Restes d'une optimisation interrompue : sans ménage ils s'accumulent et
  // masquent l'état réel du cache au diagnostic suivant.
  try {
    for (const entry of readdirSync(cacheDir)) {
      if (entry.startsWith('deps_temp_'))
        rmSync(join(cacheDir, entry), { recursive: true, force: true })
    }
  } catch {
    /* cacheDir pas encore créé */
  }

  return victims.length
}

/**
 * Filet de sécurité : si le serveur est lancé autrement que par `npm run dev`
 * (donc sans le `predev`), le garde passe quand même ici. Trop tard pour
 * libérer le port — `@adonisjs/assembler` le sonde dans le superviseur, avant
 * de lancer ce processus — mais à temps pour le cache de deps, qui est le
 * sujet.
 */
export function singleDevServer() {
  return {
    name: 'single-dev-server',
    apply: 'serve',
    async configureServer(server) {
      await killRivalDevServers(server.config.root, server.config.cacheDir, (msg) =>
        server.config.logger.warn(msg)
      )
    },
  }
}

// Mode CLI (`predev`) : s'exécute AVANT que l'assembler ne sonde le port, donc
// le nouveau serveur récupère bien 3333 au lieu d'un port aléatoire.
if (process.argv[1] && process.argv[1].endsWith('vite-single-dev-server.mjs')) {
  const root = process.cwd()
  await killRivalDevServers(root, join(root, 'node_modules', '.vite'), (msg) => console.warn(msg))
}
