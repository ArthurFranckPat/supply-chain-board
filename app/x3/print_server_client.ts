import { execFile } from 'node:child_process'
import type { X3EnvConfig } from '#config/x3'

/**
 * Client REST du serveur d'édition X3 (issue #85).
 *
 * X3 ne dit rien de l'aboutissement d'une impression : `ETAT` rend la main dès
 * que l'édition est soumise, et le dossier ne conserve aucune trace (ni table de
 * requêtes, ni historique). Le serveur d'édition, lui, expose depuis la version
 * 2.29 une API REST sur le port Syracuse :
 *
 *   GET http://<syracuse>:<port>/print/<serveur>:1890/$jobs      → tâches
 *   GET http://<syracuse>:<port>/print/<serveur>:1890/$printers  → files connues
 *
 * Vérifié en CLTEST le 22/07/2026 : une impression vers une file inexistante
 * (`ZETI1` → « Xerox », absente des 52 imprimantes déclarées) renvoie
 * `WRETCOD=0` côté subprogram MAIS `status: "Erreur"` côté serveur d'édition.
 * C'est la panne partielle de l'invariant 1 de l'issue, enfin détectable.
 *
 * ⚠️ Deux limites à garder en tête :
 *  - `status: "OK"` signifie « remis à la file d'impression », pas « le papier
 *    est sorti ». Un bac vide ou un bourrage reste invisible.
 *  - sans rétention configurée côté console (réglage « Time before deleting
 *    print job status », 0 par défaut), la tâche disparaît en quelques secondes.
 *    Le sondage court-circuite le problème pour un tirage unitaire ; la
 *    réconciliation différée, elle, exige la rétention.
 */

/** Tâche telle que renvoyée par `$jobs`. */
export interface PrintServerJob {
  /** Numéro de tâche du serveur d'édition (celui affiché par `PSIMP`). */
  rank: number
  order: number
  processId: number
  /** 'OK' tant que rien n'a échoué · 'Erreur' en cas d'échec. */
  status: string
  /** Étape courante : « Mise à jour du cache », « … moteur d'impression crystal »… */
  phase: string
  /** Fichier d'état, ex. `BONTRV.rpt`. */
  report: string
  /** Nature de la destination : « Imprimantes », « Fichier »… */
  destination: string
  user: string
  workstation: string
  serverDuration: number
  processDuration: number
  application: { folder: string; host: string; port: string } | null
}

/** Verdict normalisé d'un tirage. */
export type PrintVerdict = 'ok' | 'error' | 'unknown'

export interface PrintServerError {
  error: string
}

const TIMEOUT_MS = 15_000

/**
 * Serveur d'édition à interroger pour une destination donnée.
 * `PRTSRV` vide = X3 se rabat sur le serveur du dossier, que seule la config
 * applicative nomme (`X3_*_PRINT_SERVER`).
 */
export function resolvePrintServer(config: X3EnvConfig, destServer: string): string {
  const own = (destServer ?? '').trim()
  return own || config.printServer || ''
}

/** Appel REST authentifié, via curl (même chemin que le SOAP : proxy/VPN identiques). */
async function get(config: X3EnvConfig, path: string): Promise<any> {
  const url = `http://${config.host}:${config.port}${path}`
  const args = [
    '-sS',
    '--max-time',
    String(Math.floor(TIMEOUT_MS / 1000)),
    '-u',
    `${config.user}:${config.password}`,
    url,
  ]
  return new Promise((resolve, reject) => {
    execFile('curl', args, { timeout: TIMEOUT_MS + 2000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`curl: ${stderr?.trim() || error.message}`))
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Réponse non JSON du serveur d'édition : ${stdout.slice(0, 200)}`))
      }
    })
  })
}

/** Tâches en cours (et conservées, si la rétention est activée). */
export async function fetchJobs(
  config: X3EnvConfig,
  printServer: string
): Promise<PrintServerJob[] | PrintServerError> {
  if (!printServer) return { error: 'Aucun serveur d’édition connu pour cette destination.' }
  try {
    const raw = await get(config, `/print/${printServer}/$jobs`)
    if (Array.isArray(raw)) return raw as PrintServerJob[]
    // Le serveur répond `{$diagnoses:[…]}` quand le serveur d'édition nommé
    // n'est pas déclaré côté Syracuse (chaque environnement a le sien).
    const diag = raw?.$diagnoses?.[0]?.$message
    return { error: diag ? String(diag) : 'Réponse inattendue du serveur d’édition.' }
  } catch (e) {
    return { error: String(e) }
  }
}

/** Files d'impression déclarées au serveur d'édition (`$printers`). */
export async function fetchPrinters(
  config: X3EnvConfig,
  printServer: string
): Promise<string[] | PrintServerError> {
  if (!printServer) return { error: 'Aucun serveur d’édition connu.' }
  try {
    const raw = await get(config, `/print/${printServer}/$printers`)
    if (raw && typeof raw === 'object' && !raw.$diagnoses) {
      return Object.entries(raw)
        .filter(([k]) => k.startsWith('_PrinterName'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => String(v))
    }
    const diag = raw?.$diagnoses?.[0]?.$message
    return { error: diag ? String(diag) : 'Réponse inattendue du serveur d’édition.' }
  } catch (e) {
    return { error: String(e) }
  }
}

export interface WatchResult {
  verdict: PrintVerdict
  /** Numéro de tâche observé, null si jamais vue. */
  rank: number | null
  /** Dernière étape connue. */
  phase: string
  /** Cause si le verdict n'est pas concluant. */
  detail: string
  /**
   * true quand `ok` est DÉDUIT de la disparition de la tâche, et non lu sur un
   * statut terminal. Sans rétention côté console, c'est le seul « succès »
   * disponible — et il reste inférieur à une lecture directe : une erreur
   * survenue entre deux sondages disparaîtrait de la même façon.
   */
  inferred: boolean
}

/**
 * Suit une tâche jusqu'à son issue.
 *
 * Deux modes de rapprochement, par ordre de fiabilité :
 *  - `expectedRank` fourni — le numéro rendu par `ETATJOB` (paramètre `NOJOB`).
 *    Identification exacte, y compris si plusieurs tirages partent ensemble.
 *  - à défaut, exclusion sur `(dossier, état, rang absent de `knownRanks`)`, ce
 *    relevé devant être pris JUSTE AVANT de soumettre. Honnête, mais ambigu si
 *    deux tirages du même état partent simultanément.
 *
 * `unknown` n'est jamais transformé en `ok` : une tâche disparue avant d'être
 * vue (rétention à 0 + tirage très court) reste une tâche dont on ne sait rien.
 */
export async function watchJob(
  config: X3EnvConfig,
  printServer: string,
  params: {
    folder: string
    report: string
    knownRanks: Set<number>
    /** Numéro de tâche rendu par `ETATJOB` — rapprochement exact quand présent. */
    expectedRank?: number
    timeoutMs?: number
    intervalMs?: number
  }
): Promise<WatchResult> {
  const timeout = params.timeoutMs ?? 12_000
  const interval = params.intervalMs ?? 400
  const deadline = Date.now() + timeout
  const reportFile = `${params.report}.rpt`.toLowerCase()

  // Un rang connu d'avance vaut identification : on part avec.
  let seenRank: number | null = params.expectedRank && params.expectedRank > 0 ? params.expectedRank : null
  const exact = seenRank !== null
  let lastPhase = ''
  let lastError = ''
  let everSeen = false

  while (Date.now() < deadline) {
    const jobs = await fetchJobs(config, printServer)
    if ('error' in jobs) {
      lastError = jobs.error
      break
    }

    const mine = jobs.find(
      (j) =>
        (seenRank !== null && j.rank === seenRank) ||
        (seenRank === null &&
          !params.knownRanks.has(j.rank) &&
          j.report?.toLowerCase() === reportFile &&
          (!j.application || j.application.folder === params.folder))
    )

    if (mine) {
      seenRank = mine.rank
      everSeen = true
      lastPhase = mine.phase ?? lastPhase
      if (mine.status && mine.status !== 'OK') {
        return {
          verdict: 'error',
          rank: mine.rank,
          phase: lastPhase,
          detail: mine.status,
          inferred: false,
        }
      }
    } else if (everSeen) {
      // Vue puis disparue sans passer en erreur : le serveur d'édition l'a
      // terminée et purgée (rétention à 0). Le succès est déduit, pas lu —
      // une erreur survenue entre deux sondages se lirait pareil.
      return { verdict: 'ok', rank: seenRank, phase: lastPhase, detail: '', inferred: true }
    }

    await new Promise((r) => setTimeout(r, interval))
  }

  if (everSeen) {
    // Toujours en pile à l'expiration : pas d'échec constaté, pas de fin non plus.
    return {
      verdict: 'unknown',
      rank: seenRank,
      phase: lastPhase,
      detail: 'Tâche encore en cours à l’expiration du suivi.',
      inferred: false,
    }
  }
  return {
    verdict: 'unknown',
    // Le rang d'`ETATJOB` reste vrai même si la tâche n'a jamais été observée :
    // c'est lui qui rendra la réconciliation différée possible.
    rank: seenRank,
    phase: '',
    inferred: false,
    detail:
      lastError ||
      (exact
        ? 'Tâche jamais observée malgré son numéro : terminée avant le premier sondage. Activer la rétention côté console (« Time before deleting print job status ») permet de trancher après coup.'
        : 'Tâche jamais observée : trop rapide pour le sondage, ou serveur d’édition muet. Activer la rétention côté console lève l’ambiguïté.'),
  }
}
