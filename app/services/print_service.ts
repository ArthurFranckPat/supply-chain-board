import cache from '@adonisjs/cache/services/main'
import { getX3EnvConfig, type X3EnvConfig } from '#config/x3'
import { callRunSubprog } from '#app/x3/run-client'
import { X3Connection } from '#app/x3/connection'
import PrintDestination from '#models/print_destination'
import PrintJob from '#models/print_job'
import PrintSetting from '#models/print_setting'
import boardDataset from '#services/board_dataset'
import { atelierLabel } from '#app/domain/atelier'
import {
  fetchJobs,
  fetchPrinters,
  resolvePrintServer,
  watchJob,
  type PrintVerdict,
} from '#app/x3/print_server_client'

/**
 * Impression du dossier d'OF (issue #85, lot 2) — routage, verrou, journal.
 *
 * Trois responsabilités, dans cet ordre d'importance :
 *
 *  1. **Verrou.** Le papier ne se reprend pas. Un couple (OF, document) déjà
 *     imprimé avec succès ne se réimprime que sur `force`, et le rang du tirage
 *     est unique en base : deux appels concurrents ne peuvent pas produire deux
 *     tirages « initiaux ».
 *  2. **Routage.** Atelier (STOLOC) × type de document → code destination X3.
 *     Repli sur la règle par défaut (`stoloc = ''`) ; aucune destination codée
 *     en dur, aucune invention de destination.
 *  3. **Journal.** Chaque tentative laisse une ligne, y compris les échecs et
 *     les refus par verrou — sans quoi une panne partielle (affermissement OK,
 *     impression muette) resterait invisible.
 *
 * ⚠️ `WRETCOD=0` atteste que X3 a **soumis** l'édition, pas que le document est
 * sorti. Le statut journalisé est donc `submitted`, jamais `printed`.
 */

export type DocType = 'BONTRV' | 'BSM'
export const DOC_TYPES: DocType[] = ['BONTRV', 'BSM']

/**
 * Déclenchement automatique à l'affermissement.
 *  - `off`    : jamais. La réimpression explicite reste disponible.
 *  - `single` : affermissement unitaire seulement — le geste est délibéré et
 *               l'utilisateur voit le verdict à l'écran.
 *  - `all`    : unitaire et groupé. Un lot de 20 OF sort 40 documents.
 */
export type AutoPrintMode = 'off' | 'single' | 'all'
export const AUTO_PRINT_MODES: AutoPrintMode[] = ['off', 'single', 'all']

/** Libellés métier des documents (l'utilisateur ne parle pas en codes X3). */
export const DOC_LABELS: Record<DocType, string> = {
  BONTRV: 'Bon de travail',
  BSM: 'Bon de sortie matière',
}

/** Destination X3 telle que déclarée dans `APRINTER` (GESAIM). */
export interface X3Destination {
  code: string
  label: string
  /** 1 aperçu · 2 imprimante · 3 mail · 4 fichier. */
  kind: number
  kindLabel: string
  /** Serveur d'impression ; vide = repli serveur par défaut (destinations legacy). */
  server: string
  /** File d'attente / UNC. */
  queue: string
  active: boolean
  /** true = aucun effet physique (aperçu, mail, fichier). */
  sandbox: boolean
}

const KIND_LABELS: Record<number, string> = {
  1: 'Aperçu',
  2: 'Imprimante',
  3: 'Mail',
  4: 'Fichier',
}

/** Résolution d'une règle de routage. */
export interface ResolvedDestination {
  destCode: string
  destLabel: string
  sandbox: boolean
  /** 'atelier' = règle propre au STOLOC · 'defaut' = règle de repli. */
  source: 'atelier' | 'defaut'
}

export interface PrintOutcome {
  ok: boolean
  /** 'submitted' | 'failed' | 'locked' — `locked` = refus par idempotence. */
  status: 'submitted' | 'failed' | 'locked'
  ofNum: string
  docType: DocType
  destCode: string
  sandbox: boolean
  attempt: number
  message: string
  error: string
  /** Ligne de journal créée (absente si refus par verrou). */
  jobId: number | null
  /** Tirage précédent, quand le verrou refuse. */
  previous: { attempt: number; at: number; destCode: string; by: string } | null
  /**
   * Second verdict, celui du serveur d'édition. `status: 'submitted'` avec
   * `serverVerdict: 'error'` est exactement la panne partielle que l'issue #85
   * désigne comme l'état dangereux : X3 a dit oui, rien n'est sorti.
   */
  serverVerdict: PrintVerdict | 'pending'
  jobRank: number
  jobPhase: string
  jobDetail: string
  verdictInferred: boolean
}

class PrintService {
  /**
   * Destinations déclarées dans X3 (`APRINTER`, fonction GESAIM).
   *
   * Cache 10 min : le parc d'imprimantes bouge à l'échelle du mois, et l'écran
   * de configuration ne doit pas payer un aller-retour SOAP à chaque ouverture.
   */
  async listX3Destinations(config?: X3EnvConfig): Promise<X3Destination[]> {
    const cfg = config ?? getX3EnvConfig()
    return cache.namespace('print').getOrSet({
      key: `destinations:${cfg.pool}`,
      ttl: '10m',
      factory: async () => {
        const conn = new X3Connection(cfg)
        const res = await conn.query(
          `SELECT COD_0, DES_0, PRT_0, PRTSRV_0, PRTNAM_0, ENAFLG_0
             FROM ${cfg.pool}.APRINTER
            ORDER BY PRT_0, COD_0`
        )
        if (!res.success) return []
        return res.data.map((r: any) => {
          const kind = Number(String(r.PRT_0 ?? '').trim()) || 0
          return {
            code: String(r.COD_0 ?? '').trim(),
            label: String(r.DES_0 ?? '').trim(),
            kind,
            kindLabel: KIND_LABELS[kind] ?? `Type ${kind}`,
            server: String(r.PRTSRV_0 ?? '').trim(),
            queue: String(r.PRTNAM_0 ?? '').trim(),
            active: String(r.ENAFLG_0 ?? '').trim() === '2',
            // Seul le type 2 met du papier dans un bac. Tout le reste est inoffensif.
            sandbox: kind !== 2,
          }
        })
      },
    })
  }

  /**
   * Réglages d'impression. Ligne unique créée à la volée, défaut `off` : un
   * environnement neuf n'imprime rien tant que personne ne l'a décidé.
   */
  async getSettings(): Promise<{ autoPrintMode: AutoPrintMode; updatedAt: number; updatedBy: string }> {
    const row = await PrintSetting.firstOrCreate(
      { id: 1 },
      { id: 1, autoPrintMode: 'off', updatedAt: 0, updatedBy: '' }
    )
    const mode = AUTO_PRINT_MODES.includes(row.autoPrintMode as AutoPrintMode)
      ? (row.autoPrintMode as AutoPrintMode)
      : 'off'
    return { autoPrintMode: mode, updatedAt: row.updatedAt, updatedBy: row.updatedBy }
  }

  async setAutoPrintMode(mode: AutoPrintMode, by: string): Promise<AutoPrintMode> {
    const row = await PrintSetting.firstOrCreate({ id: 1 }, { id: 1, autoPrintMode: 'off' })
    row.autoPrintMode = mode
    row.updatedAt = Math.floor(Date.now() / 1000)
    row.updatedBy = by
    await row.save()
    return mode
  }

  /**
   * L'affermissement doit-il imprimer ? Décision centralisée : le contrôleur ne
   * doit pas réinterpréter le réglage, sous peine de divergence entre le geste
   * unitaire et le geste groupé.
   */
  async shouldPrintOnFirm(batch: boolean): Promise<{ print: boolean; mode: AutoPrintMode }> {
    const { autoPrintMode } = await this.getSettings()
    if (autoPrintMode === 'off') return { print: false, mode: autoPrintMode }
    if (autoPrintMode === 'single' && batch) return { print: false, mode: autoPrintMode }
    return { print: true, mode: autoPrintMode }
  }

  /** Toutes les règles de routage, atelier puis document. */
  async listRules(): Promise<PrintDestination[]> {
    const rows = await PrintDestination.query().orderBy('stoloc').orderBy('doc_type')
    return rows
  }

  /**
   * Destination applicable à un OF. Règle de l'atelier si elle existe, sinon
   * règle par défaut. `null` = aucune règle : on n'imprime pas, on le dit.
   */
  async resolveDestination(stoloc: string, docType: DocType): Promise<ResolvedDestination | null> {
    const code = (stoloc ?? '').trim()
    if (code) {
      const own = await PrintDestination.query()
        .where('stoloc', code)
        .where('doc_type', docType)
        .first()
      if (own) {
        return {
          destCode: own.destCode,
          destLabel: own.destLabel,
          sandbox: own.sandbox,
          source: 'atelier',
        }
      }
    }
    const fallback = await PrintDestination.query()
      .where('stoloc', '')
      .where('doc_type', docType)
      .first()
    if (!fallback) return null
    return {
      destCode: fallback.destCode,
      destLabel: fallback.destLabel,
      sandbox: fallback.sandbox,
      source: 'defaut',
    }
  }

  /** Tirages déjà journalisés pour un OF, du plus récent au plus ancien. */
  async jobsForOf(ofNum: string): Promise<PrintJob[]> {
    return PrintJob.query().where('of_num', ofNum).orderBy('id', 'desc')
  }

  /**
   * Imprime UN document pour UN OF.
   *
   * Ne relance jamais tout seul : un échec reste un échec journalisé, à charge
   * de l'utilisateur de décider. Un `force` marque explicitement une
   * réimpression (rang incrémenté), jamais un écrasement du tirage initial.
   */
  async printOf(params: {
    ofNum: string
    docType: DocType
    stofcy: string
    stoloc?: string
    force?: boolean
    origin?: 'firm' | 'manual' | 'test'
    requestedBy?: string
    config?: X3EnvConfig
    /**
     * Durée du suivi de tâche côté serveur d'édition. `0` = pas de suivi : le
     * tirage est journalisé avec son numéro de tâche et le verdict reste
     * `pending`, à trancher par `print:reconcile`. Sert à l'affermissement
     * groupé, où attendre l'issue de chaque tirage ferait exploser la durée.
     */
    watchTimeoutMs?: number
  }): Promise<PrintOutcome> {
    const ofNum = params.ofNum.trim()
    const stoloc = (params.stoloc ?? '').trim()
    const docType = params.docType
    const base = {
      ofNum,
      docType,
      sandbox: true,
      attempt: 0,
      jobId: null,
      previous: null,
      serverVerdict: 'pending' as const,
      jobRank: 0,
      jobPhase: '',
      jobDetail: '',
      verdictInferred: false,
    }

    const routed = await this.resolveDestination(stoloc, docType)
    if (!routed) {
      return {
        ...base,
        ok: false,
        status: 'failed',
        destCode: '',
        message: '',
        error: `Aucune destination configurée pour ${DOC_LABELS[docType]}${
          stoloc ? ` (atelier ${stoloc})` : ''
        }.`,
      }
    }

    // --- Verrou d'idempotence ------------------------------------------------
    // Le rang à utiliser se déduit des tirages existants. Le refus porte sur les
    // tirages RÉUSSIS : un échec n'a rien produit, le retenter n'est pas un
    // doublon.
    const existing = await PrintJob.query()
      .where('of_num', ofNum)
      .where('doc_type', docType)
      .orderBy('attempt', 'desc')
    const submitted = existing.filter((j) => j.status === 'submitted')
    if (submitted.length > 0 && !params.force) {
      const last = submitted[0]
      return {
        ...base,
        ok: false,
        status: 'locked',
        destCode: routed.destCode,
        sandbox: routed.sandbox,
        message: `${DOC_LABELS[docType]} déjà imprimé pour ${ofNum} (tirage ${last.attempt}).`,
        error: '',
        previous: {
          attempt: last.attempt,
          at: last.createdAt,
          destCode: last.destCode,
          by: last.requestedBy,
        },
      }
    }
    const attempt = (existing[0]?.attempt ?? 0) + 1

    // --- Relevé AVANT tirage -------------------------------------------------
    // Le rapprochement de la tâche se fait par exclusion : tout rang absent de
    // ce relevé et portant notre état est le nôtre. À prendre avant l'appel,
    // sinon notre propre tâche est déjà dans le relevé et devient invisible.
    const cfg = params.config ?? getX3EnvConfig()
    const printServer = resolvePrintServer(cfg, await this.serverOf(routed.destCode, cfg))
    const before =
      printServer && params.watchTimeoutMs !== 0
        ? await fetchJobs(cfg, printServer)
        : { error: 'relevé non pris (suivi désactivé ou serveur inconnu)' }
    const knownRanks = new Set<number>(
      Array.isArray(before) ? before.map((j) => j.rank) : []
    )

    // --- Appel X3 ------------------------------------------------------------
    const inputXml =
      `<PARAM><GRP ID="GRP1">` +
      `<FLD NAME="WRPTCOD">${escapeXml(docType)}</FLD>` +
      `<FLD NAME="WSTOFCY">${escapeXml(params.stofcy)}</FLD>` +
      `<FLD NAME="WMFGNUM">${escapeXml(ofNum)}</FLD>` +
      `<FLD NAME="WDEST">${escapeXml(routed.destCode)}</FLD>` +
      `</GRP></PARAM>`

    const started = Date.now()
    const res = await callRunSubprog('ZSOAPPRINT', cfg, inputXml)
    const durationMs = Date.now() - started

    const retCod = res.fields.WRETCOD ?? ''
    const retErMsg = res.fields.WRETERMSG ?? ''
    // Message X3 nommant l'état ET la destination : seul signal positif dont on
    // dispose (le 4ᵉ argument d'ETAT à 1 le fait remonter).
    const printMessage =
      res.messages.find((m) => m.text.includes(docType) && m.text.includes(routed.destCode))?.text ??
      ''
    const ok = res.ok && retCod === '0'
    // Numéro de tâche rendu par `ETATJOB` (paramètre NOJOB). Vide tant que le
    // subprogram publié n'expose pas le 7ᵉ paramètre : le suivi retombe alors
    // sur le rapprochement par exclusion.
    const jobNum = Number.parseInt((res.fields.WJOBNUM ?? '').trim(), 10)
    const expectedRank = Number.isFinite(jobNum) && jobNum > 0 ? jobNum : undefined
    /**
     * Le champ est PRÉSENT mais vide : X3 a accepté l'appel sans soumettre la
     * moindre tâche — état sans données pour cet OF, le plus souvent. Rien ne
     * sortira, et il faut le dire. Distinct du champ ABSENT, qui signale
     * seulement un subprogram publié sans le 7ᵉ paramètre.
     */
    const noJobSubmitted = 'WJOBNUM' in res.fields && !expectedRank

    // --- Second verdict : le serveur d'édition -------------------------------
    // X3 peut accepter une édition que le serveur d'édition met ensuite en
    // erreur (file inexistante, moteur Crystal en échec). Sans cette lecture,
    // l'échec est totalement muet côté application.
    let watch = {
      verdict: 'pending' as PrintVerdict | 'pending',
      // Le numéro de tâche vaut d'être journalisé même sans suivi : il rend la
      // réconciliation différée possible.
      rank: expectedRank ?? 0,
      phase: '',
      detail: printServer ? '' : 'Aucun serveur d’édition configuré pour cette destination.',
      inferred: false,
    }
    if (ok && noJobSubmitted) {
      watch = {
        verdict: 'error',
        rank: 0,
        phase: '',
        detail:
          'X3 a accepté l’appel sans soumettre de tâche : l’état n’a produit aucun document pour cet OF.',
        inferred: false,
      }
    } else if (ok && printServer && params.watchTimeoutMs !== 0) {
      const w = await watchJob(cfg, printServer, {
        folder: cfg.pool,
        report: docType,
        knownRanks,
        expectedRank,
        timeoutMs: params.watchTimeoutMs,
      })
      watch = {
        verdict: w.verdict,
        rank: w.rank ?? expectedRank ?? 0,
        phase: w.phase,
        detail: w.detail,
        inferred: w.inferred,
      }
    }

    // --- Journal -------------------------------------------------------------
    // Écrit dans tous les cas. L'insertion peut échouer sur collision de rang
    // (deux appels concurrents) : c'est le verrou structurel qui joue, on ne
    // l'avale pas silencieusement.
    let job: PrintJob | null = null
    try {
      job = await PrintJob.create({
        ofNum,
        docType,
        attempt,
        stoloc,
        destCode: routed.destCode,
        sandbox: routed.sandbox,
        status: ok ? 'submitted' : 'failed',
        retCod,
        message: printMessage || retErMsg,
        error: ok ? '' : retErMsg || res.error || 'Appel X3 sans verdict',
        poolEntryIdx: res.poolEntryIdx ?? '',
        durationMs,
        serverVerdict: watch.verdict,
        jobRank: watch.rank,
        jobPhase: watch.phase,
        jobDetail: watch.detail,
        verdictInferred: watch.inferred,
        origin: params.origin ?? 'manual',
        requestedBy: params.requestedBy ?? '',
        createdAt: Math.floor(Date.now() / 1000),
      })
    } catch (e) {
      return {
        ...base,
        ok: false,
        status: 'failed',
        destCode: routed.destCode,
        sandbox: routed.sandbox,
        attempt,
        message: printMessage,
        error: `Tirage exécuté mais non journalisé (${String(e)}). Vérifier avant de relancer.`,
      }
    }

    return {
      ok,
      status: ok ? 'submitted' : 'failed',
      ofNum,
      docType,
      destCode: routed.destCode,
      sandbox: routed.sandbox,
      attempt,
      message: printMessage || retErMsg,
      error: ok ? '' : retErMsg || res.error || 'Appel X3 sans verdict',
      jobId: job.id,
      previous: null,
      serverVerdict: watch.verdict,
      jobRank: watch.rank,
      jobPhase: watch.phase,
      jobDetail: watch.detail,
      verdictInferred: watch.inferred,
    }
  }

  /**
   * Atelier d'un article = `STOLOC` du poste de sa gamme (dernière opération
   * gagne). Même règle que /charge et /suivi, via le référentiel partagé.
   * Chaîne vide si inconnu : le routage retombe alors sur la règle par défaut,
   * jamais sur une destination inventée.
   */
  async resolveAtelier(itmref: string): Promise<{ code: string; label: string }> {
    const article = (itmref ?? '').trim()
    if (!article) return { code: '', label: '' }
    try {
      const ref = await boardDataset.getReferential()
      const stolocByWst = new Map((ref.workstations ?? []).map((w) => [w.code, w.stockLocation]))
      const g = ref.gamme.find((x) => x.article === article)
      const code = (stolocByWst.get(g?.workstation ?? '') ?? '').trim()
      return { code, label: code ? atelierLabel(code) : '' }
    } catch {
      // Référentiel indisponible : on n'invente pas d'atelier, la règle par
      // défaut s'appliquera.
      return { code: '', label: '' }
    }
  }

  /**
   * Dossier complet d'un OF : bon de travail + bon de sortie matière.
   *
   * Les documents sont indépendants — l'échec de l'un n'annule pas l'autre, et
   * chacun porte son propre verdict. Un dossier « partiel » (bon de travail
   * sorti, bon matière non) doit rester visible comme tel : c'est précisément
   * l'état qui envoie un opérateur chercher des composants sans liste.
   */
  async printFolder(params: {
    ofNum: string
    stofcy: string
    itmref?: string
    stoloc?: string
    docTypes?: DocType[]
    force?: boolean
    origin?: 'firm' | 'manual' | 'test'
    requestedBy?: string
    config?: X3EnvConfig
    watchTimeoutMs?: number
  }): Promise<{
    ok: boolean
    atelier: { code: string; label: string }
    documents: PrintOutcome[]
  }> {
    const atelier = params.stoloc
      ? { code: params.stoloc, label: atelierLabel(params.stoloc) }
      : await this.resolveAtelier(params.itmref ?? '')

    const documents: PrintOutcome[] = []
    for (const docType of params.docTypes ?? DOC_TYPES) {
      try {
        documents.push(
          await this.printOf({
            ofNum: params.ofNum,
            docType,
            stofcy: params.stofcy,
            stoloc: atelier.code,
            force: params.force,
            origin: params.origin,
            requestedBy: params.requestedBy,
            config: params.config,
            watchTimeoutMs: params.watchTimeoutMs,
          })
        )
      } catch (e) {
        // Une exception ne doit jamais faire disparaître un document du bilan :
        // un tirage non rendu compte est un tirage qu'on croira sorti.
        documents.push({
          ok: false,
          status: 'failed',
          ofNum: params.ofNum,
          docType,
          destCode: '',
          sandbox: true,
          attempt: 0,
          message: '',
          error: String(e),
          jobId: null,
          previous: null,
          serverVerdict: 'unknown',
          jobRank: 0,
          jobPhase: '',
          jobDetail: '',
          verdictInferred: false,
        })
      }
    }

    // Le dossier n'est « ok » que si chaque document est parti sans erreur
    // constatée. Un verrou d'idempotence (`locked`) compte comme un succès :
    // le document est déjà sorti.
    const ok = documents.every(
      (d) => (d.status === 'submitted' || d.status === 'locked') && d.serverVerdict !== 'error'
    )
    return { ok, atelier, documents }
  }

  /**
   * Tranche les tirages restés sans verdict, en relisant le serveur d'édition.
   *
   * N'a de prise que sur les tâches encore présentes côté serveur, donc sur les
   * installations où la rétention est activée (« Time before deleting print job
   * status », 0 par défaut). Le cas contraire n'est pas une erreur : c'est une
   * information, et elle est rendue telle quelle plutôt que déguisée en succès.
   */
  async reconcilePending(config?: X3EnvConfig): Promise<{
    pending: number
    resolved: number
    note: string
  }> {
    const cfg = config ?? getX3EnvConfig()
    const rows = await PrintJob.query()
      .where('status', 'submitted')
      .whereIn('server_verdict', ['pending', 'unknown'])
      .where('job_rank', '>', 0)
      .orderBy('id', 'desc')
      .limit(500)

    if (rows.length === 0) return { pending: 0, resolved: 0, note: 'Aucun tirage en attente.' }

    const jobs = await fetchJobs(cfg, cfg.printServer)
    if ('error' in jobs) {
      return { pending: rows.length, resolved: 0, note: `Serveur d’édition : ${jobs.error}` }
    }
    if (jobs.length === 0) {
      return {
        pending: rows.length,
        resolved: 0,
        note:
          'Le serveur d’édition ne conserve aucune tâche. Activer « Time before deleting print job status » côté console pour pouvoir trancher après coup.',
      }
    }

    const byRank = new Map(jobs.map((j) => [j.rank, j]))
    let resolved = 0
    for (const row of rows) {
      const j = byRank.get(row.jobRank)
      if (!j) continue
      row.serverVerdict = j.status === 'OK' ? 'ok' : 'error'
      row.jobPhase = j.phase ?? row.jobPhase
      row.jobDetail = j.status === 'OK' ? '' : j.status
      row.verdictInferred = false
      await row.save()
      resolved++
    }
    return {
      pending: rows.length,
      resolved,
      note: `${resolved} tirage(s) tranché(s) sur ${rows.length} en attente.`,
    }
  }

  /** Serveur d'édition déclaré par une destination (`APRINTER.PRTSRV`). */
  private async serverOf(destCode: string, config: X3EnvConfig): Promise<string> {
    const known = await this.listX3Destinations(config).catch(() => [])
    return known.find((d) => d.code === destCode)?.server ?? ''
  }

  /**
   * Files d'impression connues du serveur d'édition, pour confronter le routage
   * à la réalité : une règle pointant une file absente échouera au tirage, mais
   * se détecte dès la configuration.
   */
  async listPrintServerQueues(config?: X3EnvConfig): Promise<string[] | { error: string }> {
    const cfg = config ?? getX3EnvConfig()
    return fetchPrinters(cfg, cfg.printServer)
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default new PrintService()
