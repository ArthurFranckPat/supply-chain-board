import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Tirage journalisé (issue #85, lot 2).
 *
 * Sert deux buts à la fois : audit (qui a imprimé quoi, où, quand, avec quel
 * verdict) et verrou d'idempotence via `(of_num, doc_type, attempt)` unique.
 */
export default class PrintJob extends BaseModel {
  static table = 'print_jobs'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'of_num' })
  declare ofNum: string

  /** 'BONTRV' | 'BSM'. */
  @column({ columnName: 'doc_type' })
  declare docType: string

  /** 1 = tirage initial, 2+ = réimpression explicite. */
  @column()
  declare attempt: number

  @column()
  declare stoloc: string

  @column({ columnName: 'dest_code' })
  declare destCode: string

  @column()
  declare sandbox: boolean

  /** 'submitted' | 'failed'. */
  @column()
  declare status: string

  /** WRETCOD de ZSOAPPRINT. */
  @column({ columnName: 'ret_cod' })
  declare retCod: string

  @column()
  declare message: string

  @column()
  declare error: string

  @column({ columnName: 'pool_entry_idx' })
  declare poolEntryIdx: string

  @column({ columnName: 'duration_ms' })
  declare durationMs: number

  /**
   * Verdict du serveur d'édition : 'pending' | 'ok' | 'error' | 'unknown'.
   * Second verdict, distinct de `status` — X3 peut accepter une édition que le
   * serveur d'édition met ensuite en erreur.
   */
  @column({ columnName: 'server_verdict' })
  declare serverVerdict: string

  /** Numéro de tâche du serveur d'édition (celui de PSIMP). 0 = inconnu. */
  @column({ columnName: 'job_rank' })
  declare jobRank: number

  @column({ columnName: 'job_phase' })
  declare jobPhase: string

  @column({ columnName: 'job_detail' })
  declare jobDetail: string

  /** true = succès déduit d'une disparition, pas lu sur un statut terminal. */
  @column({ columnName: 'verdict_inferred' })
  declare verdictInferred: boolean

  /**
   * Trace X3 (`adxwss.trace.on`) du tirage, ou à défaut la réponse SOAP brute.
   * Renseignée sur les seuls échecs : c'est là qu'il n'y a rien d'autre à lire.
   */
  @column({ columnName: 'x3_trace' })
  declare x3Trace: string

  /** 'firm' | 'manual' | 'test'. */
  @column()
  declare origin: string

  @column({ columnName: 'requested_by' })
  declare requestedBy: string

  @column({ columnName: 'created_at' })
  declare createdAt: number
}
