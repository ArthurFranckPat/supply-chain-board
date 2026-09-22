/**
 * État de suivi des OF fermes (MFGHEAD.MFGTRKFLG_0, menu local 339).
 *
 * ORDERS ne porte que le statut de l'ordre (ferme / planifié / suggéré). Savoir
 * si un OF ferme est LANCÉ — dossier édité, puis en cours atelier — demande
 * l'en-tête MFGHEAD. Un planifié peut y figurer (« En attente ») mais n'est
 * jamais lancé : on ne lit l'état que des OF fermes.
 *
 * Même pool Lucid partagé que MFGOPE (cf. operation_repository) : jamais de
 * `new X3Database()` éphémère.
 */
import MfgHead from '#models/x3/mfghead'

/** Codes du menu local 339 (APLSTD, FRA), relevés en PROD le 22/09/2026. */
export const OF_SUIVI_LABELS: Record<number, string> = {
  1: 'En attente',
  2: 'À l’étude',
  3: 'Édité',
  4: 'En cours',
  5: 'Soldé',
  6: 'Prix de revient calculé',
}

export interface OfSuiviRecord {
  numOf: string
  /** MFGTRKFLG_0 — cf. `OF_SUIVI_LABELS`. */
  code: number
}

export class X3OfSuiviRepository {
  /** Chunké à 1000 (limite IN d'Oracle), chunks séquentiels (pool max:4). */
  async getSuivi(numOfs: string[]): Promise<OfSuiviRecord[]> {
    const unique = [...new Set(numOfs.map((n) => n.trim()).filter(Boolean))]
    const out: OfSuiviRecord[] = []
    for (let i = 0; i < unique.length; i += 1000) {
      const rows = await MfgHead.query()
        .select('MFGNUM_0', 'MFGTRKFLG_0')
        .whereIn('MFGNUM_0', unique.slice(i, i + 1000))
      for (const row of rows) {
        const numOf = (row.numeroOrdreDeFabrication ?? '').trim()
        const code = Number.parseInt(row.flagSuivi ?? '', 10)
        if (numOf && Number.isFinite(code)) out.push({ numOf, code })
      }
    }
    return out
  }
}
