/**
 * Assignation de statut suivi-commandes.
 *
 * Pour chaque ligne de commande, determine le statut en fonction
 * du stock disponible (strict + sous controle qualite) et de la date d'expedition.
 *
 * Regles:
 * - besoin_net <= 0                           → A_EXPEDIER
 * - MTS fabrique, date passee, pas zone expo  → RETARD_PROD
 * - MTS fabrique, date future                 → RAS
 * - couvert par stock virtuel                 → ALLOCATION_A_FAIRE
 * - non couvert + date passee + pas zone expo  → RETARD_PROD
 * - non couvert + date future                  → RAS
 */

export type SuiviStatus = 'A_EXPEDIER' | 'ALLOCATION_A_FAIRE' | 'RETARD_PROD' | 'RAS'
export type TypeCommande = 'MTS' | 'MTO' | 'NOR'

export interface OrderLine {
  numCommande: string
  article: string
  designation: string
  nomClient: string
  typeCommande: TypeCommande
  dateExpedition: Date | null
  dateLivPrevu: Date | null
  qteCommandee: number
  qteAllouee: number
  qteRestante: number
  isFabrique: boolean
  isHardPegged: boolean
}

export interface StatusAssignment {
  line: OrderLine
  status: SuiviStatus
  besoinNet: number
  qteAlloueeVirtuelle: number
  qteAlloueeVirtuelleStricte: number
  qteAlloueeVirtuelleCq: number
  utiliseStockSousCq: boolean
}

export interface StockBreakdown {
  strict: number
  qc: number
  total: number
}

export function assignStatuses(
  lines: OrderLine[],
  stock: Map<string, StockBreakdown>,
  referenceDate: Date,
): StatusAssignment[] {
  // Trie par date expedition, puis date liv prevue, puis num commande
  const sorted = [...lines].sort((a, b) => {
    const da = a.dateExpedition?.getTime() ?? Infinity
    const db = b.dateExpedition?.getTime() ?? Infinity
    if (da !== db) return da - db
    const la = a.dateLivPrevu?.getTime() ?? Infinity
    const lb = b.dateLivPrevu?.getTime() ?? Infinity
    if (la !== lb) return la - lb
    return a.numCommande.localeCompare(b.numCommande)
  })

  // Initialise stock virtuel
  const virtualStrict = new Map<string, number>()
  const virtualQc = new Map<string, number>()
  for (const line of sorted) {
    if (virtualStrict.has(line.article)) continue
    const bd = stock.get(line.article) ?? { strict: 0, qc: 0, total: 0 }
    virtualStrict.set(line.article, bd.strict)
    virtualQc.set(line.article, bd.qc)
  }

  // Garde l'ordre original pour le resultat final
  const orderIndex = new Map(lines.map((l, i) => [l.numCommande + '|' + l.article, i]))
  const assignments: StatusAssignment[] = []

  for (const line of sorted) {
    const besoin = Math.max(0, line.qteRestante - line.qteAllouee)

    if (besoin <= 0) {
      assignments.push({ line, status: 'A_EXPEDIER', besoinNet: besoin, qteAlloueeVirtuelle: 0, qteAlloueeVirtuelleStricte: 0, qteAlloueeVirtuelleCq: 0, utiliseStockSousCq: false })
      continue
    }

    // MTS fabrique: pas d'allocation virtuelle
    if (line.typeCommande === 'MTS' && line.isFabrique) {
      const status = isRetard(line, referenceDate) ? 'RETARD_PROD' : 'RAS'
      assignments.push({ line, status, besoinNet: besoin, qteAlloueeVirtuelle: 0, qteAlloueeVirtuelleStricte: 0, qteAlloueeVirtuelleCq: 0, utiliseStockSousCq: false })
      continue
    }

    // Allocation virtuelle
    const strict = virtualStrict.get(line.article) ?? 0
    const qc = virtualQc.get(line.article) ?? 0

    const allocStrict = Math.min(besoin, strict)
    virtualStrict.set(line.article, strict - allocStrict)

    const manqueApresStrict = besoin - allocStrict
    const allocQc = Math.min(manqueApresStrict, qc)
    virtualQc.set(line.article, qc - allocQc)

    const allocTotal = allocStrict + allocQc
    const couvert = allocTotal >= besoin

    let status: SuiviStatus
    if (couvert) {
      status = 'ALLOCATION_A_FAIRE'
    } else if (isRetard(line, referenceDate)) {
      status = 'RETARD_PROD'
    } else {
      status = 'RAS'
    }

    assignments.push({
      line, status, besoinNet: besoin,
      qteAlloueeVirtuelle: allocTotal,
      qteAlloueeVirtuelleStricte: allocStrict,
      qteAlloueeVirtuelleCq: allocQc,
      utiliseStockSousCq: allocQc > 0,
    })
  }

  // Restitue l'ordre original
  assignments.sort((a, b) => {
    const ia = orderIndex.get(a.line.numCommande + '|' + a.line.article) ?? 0
    const ib = orderIndex.get(b.line.numCommande + '|' + b.line.article) ?? 0
    return ia - ib
  })

  return assignments
}

function isRetard(line: OrderLine, refDate: Date): boolean {
  if (!line.dateExpedition) return false
  return line.dateExpedition < refDate
}
