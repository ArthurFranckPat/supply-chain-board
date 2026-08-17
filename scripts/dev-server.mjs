#!/usr/bin/env node
/**
 * Lance le serveur de dev (`node ace serve --hmr`) en dupliquant sa sortie vers
 * `tmp/dev-server.log`.
 *
 * Pourquoi : quand le serveur meurt, le navigateur ne voit qu'un
 * `ERR_CONNECTION_REFUSED` et des chunks Vite en 504. La cause réelle (stack,
 * OOM, signal, EMFILE) est dans la sortie du process — qui partait au terminal
 * et disparaissait au premier scroll. Ici elle survit à la mort du process ET
 * au redémarrage suivant (rotation `.prev.log`).
 *
 * Le terminal reste interactif : `stdin` est hérité, donc les raccourcis du
 * serveur de dev (`h` pour l'aide, `r` pour relancer…) fonctionnent. Seuls
 * `stdout`/`stderr` passent par un tuyau — d'où `FORCE_COLOR` pour que les
 * enfants ne désactivent pas la couleur en voyant un flux non-TTY.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, renameSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const LOG = resolve(ROOT, 'tmp/dev-server.log')
const PREV = resolve(ROOT, 'tmp/dev-server.prev.log')

mkdirSync(dirname(LOG), { recursive: true })

// Rotation : le log de la session qui vient de mourir est ce qu'on veut lire.
// Sans elle, le redémarrage — souvent le premier réflexe — l'écrase.
if (existsSync(LOG)) {
  rmSync(PREV, { force: true })
  renameSync(LOG, PREV)
}

const log = createWriteStream(LOG, { flags: 'a' })
const horodatage = () => new Date().toISOString()

log.write(`=== démarrage ${horodatage()} · ${ROOT} · pid parent ${process.pid} ===\n`)

const enfant = spawn('dotenvx', ['run', '--', 'node', 'ace', 'serve', '--hmr'], {
  cwd: ROOT,
  // `stdin` hérité : garde les raccourcis clavier du serveur de dev.
  stdio: ['inherit', 'pipe', 'pipe'],
  // Pas de `detached` : le serveur de dev lit stdin (touche `h`). Dans un groupe
  // de process en arrière-plan, cette lecture déclencherait SIGTTIN et STOPPERAIT
  // le serveur. On garde donc le groupe du terminal et on tue l'arbre à la main.
  env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
})

for (const [flux, sortie] of [
  [enfant.stdout, process.stdout],
  [enfant.stderr, process.stderr],
]) {
  flux.on('data', (bloc) => {
    sortie.write(bloc)
    log.write(bloc)
  })
}

/**
 * Descendants de `racine`, feuilles d'abord.
 *
 * La chaîne est `dotenvx` → `ace serve` (superviseur HMR) → serveur HTTP. Un
 * signal envoyé au seul `dotenvx` ne descend pas : vérifié, `SIGTERM` sur lui
 * laisse le superviseur vivant, qui relance aussitôt un serveur HTTP et reprend
 * le port 3333. Deux superviseurs se disputent alors le port — mort du serveur
 * côté navigateur, sans trace.
 */
function descendants(racine) {
  const lignes = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).split('\n')
  const enfantsDe = new Map()
  for (const ligne of lignes) {
    const [pid, ppid] = ligne.trim().split(/\s+/).map(Number)
    if (!pid) continue
    enfantsDe.set(ppid, [...(enfantsDe.get(ppid) ?? []), pid])
  }
  const sortie = []
  const parcourir = (pid) => {
    for (const fils of enfantsDe.get(pid) ?? []) parcourir(fils)
    sortie.push(pid)
  }
  parcourir(racine)
  return sortie
}

/** Signale toute la chaîne, feuilles d'abord (le superviseur ne relance rien). */
function tuerLArbre(signal) {
  let cibles = []
  try {
    cibles = descendants(enfant.pid)
  } catch {
    cibles = [enfant.pid]
  }
  for (const pid of cibles) {
    try {
      process.kill(pid, signal)
    } catch {
      // Déjà mort (ESRCH) : rien à faire.
    }
  }
}

// Ctrl-C et `kill` doivent atteindre toute la chaîne, pas seulement ce wrapper :
// sinon le superviseur survit orphelin et garde le port 3333.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    tuerLArbre(signal)
    // Filet : le superviseur HMR n'honore pas toujours SIGTERM. On lui laisse
    // 5 s pour sortir proprement, puis SIGKILL — un orphelin sur le port coûte
    // plus cher qu'un arrêt brutal d'un serveur de dev.
    setTimeout(() => tuerLArbre('SIGKILL'), 5_000).unref()
  })
}

enfant.on('exit', (code, signal) => {
  // LA ligne qui manquait : elle distingue un arrêt volontaire (SIGINT) d'un
  // plantage (code ≠ 0) d'une mise à mort par l'OS (SIGKILL, typiquement OOM).
  log.write(`=== arrêt ${horodatage()} · code=${code} · signal=${signal} ===\n`)
  log.end(() => process.exit(code ?? 1))
})

enfant.on('error', (erreur) => {
  log.write(`=== échec de lancement ${horodatage()} · ${erreur.stack ?? erreur.message} ===\n`)
  process.stderr.write(`${erreur.stack ?? erreur.message}\n`)
  log.end(() => process.exit(1))
})
