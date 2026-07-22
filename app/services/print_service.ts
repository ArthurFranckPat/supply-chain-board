import cache from '@adonisjs/cache/services/main'
import { getX3EnvConfig, type X3EnvConfig } from '#config/x3'
import { callRunSubprog } from '#app/x3/run-client'
import { X3Connection } from '#app/x3/connection'
import PrintDestination from '#models/print_destination'
import PrintJob from '#models/print_job'

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

    // --- Appel X3 ------------------------------------------------------------
    const cfg = params.config ?? getX3EnvConfig()
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
    }
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
