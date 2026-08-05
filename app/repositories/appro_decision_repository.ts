import db from '@adonisjs/lucid/services/db'
import type { ApproDecisionStatut } from '#app/domain/appro_decision'

/**
 * Accès base du ledger de décisions acheteur `/approvisionnements` (#134).
 * Append-only : `record()` insère, rien n'est mis à jour — la plus récente
 * ligne non expirée d'une clé fait foi, l'historique reste lisible.
 */

/** Ligne brute du ledger (`appro_decision_ledger`). */
export interface ApproDecisionRow {
  id: number
  cleLogique: string
  nature: 'suggestion' | 'message'
  statut: ApproDecisionStatut
  article: string
  fournisseur: string | null
  quantite: number
  echeance: string | null
  absentRuns: number
  expiree: boolean
  decidedAt: string
}

type RawRow = Record<string, unknown>

const str = (v: unknown): string => String(v ?? '')
const num = (v: unknown): number => Number(v ?? 0)
const bool = (v: unknown): boolean => v === 1 || v === true
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

const mapRow = (r: RawRow): ApproDecisionRow => ({
  id: num(r.id),
  cleLogique: str(r.cle_logique),
  nature: str(r.nature) === 'message' ? 'message' : 'suggestion',
  statut: str(r.statut) as ApproDecisionStatut,
  article: str(r.article),
  fournisseur: r.fournisseur === null ? null : str(r.fournisseur),
  quantite: num(r.quantite),
  echeance: iso(r.echeance),
  absentRuns: num(r.absent_runs),
  expiree: bool(r.expiree),
  decidedAt: iso(r.decided_at) ?? '',
})

export class ApproDecisionRepository {
  /** Insère une décision (append-only). Rend la ligne écrite. */
  async record(input: {
    cleLogique: string
    nature: 'suggestion' | 'message'
    statut: ApproDecisionStatut
    article: string
    fournisseur: string | null
    quantite: number
    echeance: string | null
  }): Promise<ApproDecisionRow> {
    const decidedAt = new Date().toISOString()
    const [id] = await db.table('appro_decision_ledger').insert({
      cle_logique: input.cleLogique,
      nature: input.nature,
      statut: input.statut,
      article: input.article,
      fournisseur: input.fournisseur,
      quantite: input.quantite,
      echeance: input.echeance,
      absent_runs: 0,
      expiree: false,
      decided_at: decidedAt,
      created_at: decidedAt,
    })
    return {
      id: Number(id),
      cleLogique: input.cleLogique,
      nature: input.nature,
      statut: input.statut,
      article: input.article,
      fournisseur: input.fournisseur,
      quantite: input.quantite,
      echeance: input.echeance,
      absentRuns: 0,
      expiree: false,
      decidedAt: decidedAt.slice(0, 10),
    }
  }

  /** Dernière décision NON EXPIRÉE par clé logique. `undefined` = aucune. */
  async latestParCle(cles: string[]): Promise<Map<string, ApproDecisionRow>> {
    if (cles.length === 0) return new Map()
    const rows = await db
      .connection()
      .from('appro_decision_ledger')
      .where('expiree', false)
      .whereIn('cle_logique', cles)
      .orderBy('decided_at', 'desc')
      .orderBy('id', 'desc')
    const out = new Map<string, ApproDecisionRow>()
    for (const r of rows as RawRow[]) {
      const row = mapRow(r)
      if (!out.has(row.cleLogique)) out.set(row.cleLogique, row)
    }
    return out
  }

  /**
   * Expiration par absence (#112) : toute décision non expirée dont la clé
   * n'apparaît plus dans la file courante voit `absent_runs` +1 ; à `seuilRuns`
   * absences consécutives (3 par défaut) elle passe `expiree`. Une clé de
   * retour réinitialise son compteur. Les clés présentes doivent être les
   * clés logiques de la file ACTUELLE.
   *
   * Ne touche PAS les lignes dont l'état ne change pas (présent avec compteur
   * à 0) : l'expiration tourne à chaque chargement de la file, le cas courant
   * ne doit pas écrire.
   */
  async expireAbsents(clesPresentes: string[], seuilRuns = 3): Promise<number> {
    const set = new Set(clesPresentes)
    const rows = (await db
      .connection()
      .from('appro_decision_ledger')
      .where('expiree', false)) as RawRow[]
    const conn = db.connection()
    let expirees = 0
    for (const r of rows) {
      const row = mapRow(r)
      const present = set.has(row.cleLogique)
      const absentRuns = present ? 0 : row.absentRuns + 1
      const expiree = !present && absentRuns >= seuilRuns
      if (expiree) expirees += 1
      // Skip les no-op : une clé présente au compteur 0 n'a rien à écrire.
      if (absentRuns === row.absentRuns && expiree === row.expiree) continue
      await conn
        .from('appro_decision_ledger')
        .where('id', row.id)
        .update({ absent_runs: absentRuns, expiree })
    }
    return expirees
  }
}
