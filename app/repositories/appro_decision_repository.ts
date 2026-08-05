import db from '@adonisjs/lucid/services/db'
import { EXPIRATION_JOURS_ABSENCE, type ApproDecisionStatut } from '#app/domain/appro_decision'

/**
 * Accès base du ledger de décisions acheteur `/approvisionnements` (#134).
 * Append-only : `record()` insère, rien n'est mis à jour — la plus récente
 * ligne non expirée d'une clé fait foi, l'historique reste lisible.
 *
 * Deux écritures d'entretien seulement, toutes deux ensemblistes (`marqueVues`,
 * `expireNonVues`) : le chemin de lecture n'écrit rien.
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
  /** Dernier jour où la clé a été vue dans la file complète, ISO. */
  lastSeenAt: string | null
  expiree: boolean
  decidedAt: string
}

type RawRow = Record<string, unknown>

/** SQLite plafonne le nombre de paramètres liés d'une requête (999 par défaut). */
const CHUNK_PARAMS = 400

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
  lastSeenAt: iso(r.last_seen_at),
  expiree: bool(r.expiree),
  decidedAt: iso(r.decided_at) ?? '',
})

/** Jour ISO à ±`days` jours. */
const addDays = (iso_: string, days: number): string => {
  const t = Date.parse(`${iso_}T00:00:00Z`)
  if (!Number.isFinite(t)) return iso_
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

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
    const jour = decidedAt.slice(0, 10)
    const [id] = await db.table('appro_decision_ledger').insert({
      cle_logique: input.cleLogique,
      nature: input.nature,
      statut: input.statut,
      article: input.article,
      fournisseur: input.fournisseur,
      quantite: input.quantite,
      echeance: input.echeance,
      // La ligne vient d'être décidée depuis la file : elle y est, par définition.
      last_seen_at: jour,
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
      lastSeenAt: jour,
      expiree: false,
      decidedAt: jour,
    }
  }

  /** Dernière décision NON EXPIRÉE par clé logique. `undefined` = aucune. */
  async latestParCle(cles: string[]): Promise<Map<string, ApproDecisionRow>> {
    if (cles.length === 0) return new Map()
    const out = new Map<string, ApproDecisionRow>()
    for (let i = 0; i < cles.length; i += CHUNK_PARAMS) {
      const rows = await db
        .connection()
        .from('appro_decision_ledger')
        .where('expiree', false)
        .whereIn('cle_logique', cles.slice(i, i + CHUNK_PARAMS))
        .orderBy('decided_at', 'desc')
        .orderBy('id', 'desc')
      for (const r of rows as RawRow[]) {
        const row = mapRow(r)
        if (!out.has(row.cleLogique)) out.set(row.cleLogique, row)
      }
    }
    return out
  }

  /**
   * Marque les clés vues aujourd'hui dans la file COMPLÈTE (#112).
   *
   * Idempotent et ensembliste : un UPDATE par paquet de clés, jamais un par
   * ligne. Deux chargements concurrents écrivent la même valeur — il n'y a plus
   * de compteur à incrémenter, donc plus de course.
   *
   * `clesVues` doit venir de la population complète chargée depuis X3, PAS de
   * la file affichée : une décision hors fenêtre d'affichage n'est pas une
   * décision disparue.
   */
  async marqueVues(clesVues: string[], jourIso: string): Promise<void> {
    for (let i = 0; i < clesVues.length; i += CHUNK_PARAMS) {
      await db
        .connection()
        .from('appro_decision_ledger')
        .where('expiree', false)
        .whereIn('cle_logique', clesVues.slice(i, i + CHUNK_PARAMS))
        .update({ last_seen_at: jourIso })
    }
  }

  /**
   * Expire les décisions dont la clé n'a plus été vue depuis `seuilJours` (#112) :
   * la suggestion a disparu du CBN, ou elle a trop bougé pour rester la ligne
   * décidée. Une seule requête, et l'unité est le JOUR — pas le nombre de fois
   * où quelqu'un a ouvert la page.
   *
   * Rend le nombre de lignes expirées.
   */
  async expireNonVues(jourIso: string, seuilJours = EXPIRATION_JOURS_ABSENCE): Promise<number> {
    const limite = addDays(jourIso, -seuilJours)
    // Lucid rend le résultat brut du driver : un nombre de lignes sous SQLite,
    // un tableau ailleurs. Normalisé ici plutôt qu'au point d'appel.
    const affected: unknown = await db
      .connection()
      .from('appro_decision_ledger')
      .where('expiree', false)
      .where('last_seen_at', '<', limite)
      .update({ expiree: true })
    return Array.isArray(affected) ? affected.length : Number(affected ?? 0)
  }
}
