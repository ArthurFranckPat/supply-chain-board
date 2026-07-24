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
 *  - la tâche ne survit à sa fin que le temps de la rétention, réglée dans
 *    `adxeditionserverconfig.xml` (élément `<jobs>`) : `SuccessfulJobsStatusRetention`
 *    vaut 10 min par défaut et `FailedJobsStatusRetention` 15 min depuis la
 *    version 2.29. Une pile qui se vide en quelques secondes signale donc une
 *    valeur mise à 0 dans le fichier, pas un réglage absent. Le sondage
 *    court-circuite le problème pour un tirage unitaire ; la réconciliation
 *    différée, elle, exige la rétention.
 */

/** Tâche telle que renvoyée par `$jobs`. */
export interface PrintServerJob {
  /** Numéro de tâche du serveur d'édition (celui affiché par `PSIMP`). */
  rank: number
  order: number
  /** Processus servant la tâche. 0 = terminé — mais 0 aussi tant qu'elle attend. */
  processId: number
  /**
   * 'Finished' | 'InProgress' | 'Standby' — état de traitement, distinct de
   * `status` (qui dit seulement si quelque chose a échoué). Absent des serveurs
   * d'édition antérieurs à 2.29 : ne jamais s'y fier sans repli.
   */
  state?: string
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
 * Budget d'attente quand la lecture est sur le chemin d'un geste utilisateur
 * (relevé avant tirage, sondage de suivi). Le verdict du serveur d'édition est
 * un confort ; l'affermissement, lui, a déjà eu lieu. Attendre 15 s de plus par
 * document ne rend le verdict ni plus sûr ni plus rapide à obtenir.
 */
export const FAST_TIMEOUT_MS = 3_000

/**
 * Disjoncteur par serveur d'édition.
 *
 * Relevé sur prod le 24/07/2026 : `srv-x3imp-01-fr` ne répond plus du tout
 * (`curl (28) timed out after 15011 ms with 0 bytes received`), sur `$jobs`
 * comme sur `$printers`. Sans disjoncteur, chaque tirage repayait ce mur : le
 * relevé d'avant tirage PUIS le premier sondage, soit ~30 s par document et une
 * minute par dossier d'OF — sur un geste qui, côté ERP, est déjà terminé.
 *
 * Ne se déclenche QUE sur une panne de transport. Un serveur qui répond, même
 * pour dire `DESTINATION_10 not found`, n'est pas muet : sa réponse est une
 * information, et elle doit continuer de remonter telle quelle.
 */
const DOWN_TTL_MS = 60_000
const down = new Map<string, { until: number; error: string }>()

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
async function get(config: X3EnvConfig, path: string, timeoutMs = TIMEOUT_MS): Promise<any> {
  const url = `http://${config.host}:${config.port}${path}`
  const args = [
    '-sS',
    '--max-time',
    String(Math.max(1, Math.floor(timeoutMs / 1000))),
    '-u',
    `${config.user}:${config.password}`,
    url,
  ]
  return new Promise((resolve, reject) => {
    execFile('curl', args, { timeout: timeoutMs + 2000 }, (error, stdout, stderr) => {
      if (error) {
        const e = new Error(`curl: ${stderr?.trim() || error.message}`)
        // Marqué transport : c'est ce qui distingue « muet » de « répond mal ».
        ;(e as Error & { transport?: boolean }).transport = true
        return reject(e)
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Réponse non JSON du serveur d'édition : ${stdout.slice(0, 200)}`))
      }
    })
  })
}

/** Serveur déjà constaté muet ? Rend l'erreur mémorisée, sans repayer l'attente. */
function tripped(printServer: string): PrintServerError | null {
  const flag = down.get(printServer)
  if (!flag) return null
  if (Date.now() >= flag.until) {
    down.delete(printServer)
    return null
  }
  const left = Math.ceil((flag.until - Date.now()) / 1000)
  return { error: `${flag.error} (serveur muet, nouvelle tentative dans ${left} s)` }
}

/** Consigne une panne de transport ; toute réponse, même mauvaise, réarme. */
function record(printServer: string, e: unknown): void {
  if ((e as { transport?: boolean })?.transport) {
    down.set(printServer, { until: Date.now() + DOWN_TTL_MS, error: String(e) })
  } else {
    down.delete(printServer)
  }
}

/** Tâches en cours (et conservées, si la rétention est activée). */
export async function fetchJobs(
  config: X3EnvConfig,
  printServer: string,
  timeoutMs = TIMEOUT_MS
): Promise<PrintServerJob[] | PrintServerError> {
  if (!printServer) return { error: 'Aucun serveur d’édition connu pour cette destination.' }
  const short = tripped(printServer)
  if (short) return short
  try {
    const raw = await get(config, `/print/${printServer}/$jobs`, timeoutMs)
    down.delete(printServer)
    if (Array.isArray(raw)) return raw as PrintServerJob[]
    // Le serveur répond `{$diagnoses:[…]}` quand le serveur d'édition nommé
    // n'est pas déclaré côté Syracuse (chaque environnement a le sien).
    const diag = raw?.$diagnoses?.[0]?.$message
    return { error: diag ? String(diag) : 'Réponse inattendue du serveur d’édition.' }
  } catch (e) {
    record(printServer, e)
    return { error: String(e) }
  }
}

/** Files d'impression déclarées au serveur d'édition (`$printers`). */
export async function fetchPrinters(
  config: X3EnvConfig,
  printServer: string,
  timeoutMs = TIMEOUT_MS
): Promise<string[] | PrintServerError> {
  if (!printServer) return { error: 'Aucun serveur d’édition connu.' }
  const short = tripped(printServer)
  if (short) return short
  try {
    const raw = await get(config, `/print/${printServer}/$printers`, timeoutMs)
    down.delete(printServer)
    if (raw && typeof raw === 'object' && !raw.$diagnoses) {
      return Object.entries(raw)
        .filter(([k]) => k.startsWith('_PrinterName'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => String(v))
    }
    const diag = raw?.$diagnoses?.[0]?.$message
    return { error: diag ? String(diag) : 'Réponse inattendue du serveur d’édition.' }
  } catch (e) {
    record(printServer, e)
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
 * Deux verdicts positifs, par ordre de fiabilité : `state: "Finished"` lu sur la
 * tâche (serveur d'édition ≥ 2.29), sinon disparition de la tâche — succès
 * déduit, marqué comme tel (`inferred`).
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
    // Jamais plus que ce qu'il reste à vivre au suivi : un sondage à 15 s dans
    // une fenêtre de 6 s faisait dépasser le budget d'un facteur trois.
    const jobs = await fetchJobs(
      config,
      printServer,
      Math.min(FAST_TIMEOUT_MS, Math.max(1000, deadline - Date.now()))
    )
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
      // Fin LUE, pas déduite d'une disparition. `state` n'existe qu'à partir du
      // serveur d'édition 2.29 ; quand il est là, il évite d'attendre la purge
      // et retire l'ambiguïté du succès inféré (une erreur survenue entre deux
      // sondages se lisait comme une réussite).
      if (mine.state === 'Finished') {
        return { verdict: 'ok', rank: mine.rank, phase: lastPhase, detail: '', inferred: false }
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
