export type AbcClass = 'A' | 'B' | 'C' | null
export type LogisticsProfile =
  'strategique' | 'lancement' | 'fin_de_vie' | 'standard' | 'sans_activite'

export interface LogisticsBase {
  article: string
  designation: string
  categorie: string
  famille: string | null
  fournisseurCode: string | null
  fournisseurNom: string | null
  delaiReapproJours: number | null
  lotTechnique: number | null
  lotEconomique: number | null
  stockSecurite: number | null
  stockA: number
  stockQ: number
  stockAlloue: number
  pmp: number
}

export interface LogisticsHistory {
  consommation: number
  joursMouvement: number
  operations: number
}

export interface LogisticsFuture {
  besoin: number
  enRetard: number
}

export interface LogisticsRow extends LogisticsBase {
  stockActuel: number
  stockDisponible: number
  stockMoyen: number
  besoin12m: number
  besoinEnRetard: number
  besoinMoyenMensuel: number
  consommation12m: number
  joursMouvement: number
  operations: number
  cmjCalendaire: number | null
  moyenneParOperation: number | null
  valorisationStock: number
  valorisationConsommation: number
  valorisationBesoin: number
  rotation: number | null
  couvertureJours: number | null
  abcHistoriqueValeur: AbcClass
  abcHistoriqueFrequence: AbcClass
  abcPrevisionValeur: AbcClass
  profil: LogisticsProfile
}

const round = (value: number, digits = 2) => {
  const power = 10 ** digits
  return Math.round(value * power) / power
}

/** La classe porte sur la part AVANT l'article : le premier reste A même s'il
 * représente à lui seul plus de 80 % du total. Zéro n'a pas de classe ABC. */
export function abcClasses<T>(
  rows: T[],
  value: (row: T) => number,
  key: (row: T) => string
): Map<string, AbcClass> {
  const ordered = [...rows].sort((a, b) => value(b) - value(a) || key(a).localeCompare(key(b)))
  const total = ordered.reduce((sum, row) => sum + Math.max(0, value(row)), 0)
  const result = new Map<string, AbcClass>()
  let accumulated = 0
  for (const row of ordered) {
    const amount = Math.max(0, value(row))
    const before = total > 0 ? (100 * accumulated) / total : 100
    result.set(key(row), amount <= 0 ? null : before < 80 ? 'A' : before < 95 ? 'B' : 'C')
    accumulated += amount
  }
  return result
}

export function assembleLogisticsRows(
  bases: LogisticsBase[],
  histories: Map<string, LogisticsHistory>,
  futures: Map<string, LogisticsFuture>,
  stockMeans: Map<string, number>,
  calendarDays: number
): LogisticsRow[] {
  const days = Math.max(1, calendarDays)
  const rows: LogisticsRow[] = []

  for (const base of bases) {
    const history = histories.get(base.article)
    const future = futures.get(base.article)
    const stockActuel = base.stockA + base.stockQ
    const stockDisponible = Math.max(0, base.stockA - base.stockAlloue)
    const consommation12m = history?.consommation ?? 0
    const besoin12m = future?.besoin ?? 0
    if (stockActuel === 0 && consommation12m === 0 && besoin12m === 0) continue

    const cmj = consommation12m > 0 ? consommation12m / days : null
    const stockMoyen = stockMeans.get(base.article) ?? stockActuel
    const operations = history?.operations ?? 0
    rows.push({
      ...base,
      stockActuel,
      stockDisponible,
      stockMoyen: round(stockMoyen),
      besoin12m,
      besoinEnRetard: future?.enRetard ?? 0,
      besoinMoyenMensuel: round(besoin12m / 12),
      consommation12m,
      joursMouvement: history?.joursMouvement ?? 0,
      operations,
      cmjCalendaire: cmj === null ? null : round(cmj),
      moyenneParOperation: operations > 0 ? round(consommation12m / operations) : null,
      valorisationStock: round(stockActuel * base.pmp),
      valorisationConsommation: round(consommation12m * base.pmp),
      valorisationBesoin: round(besoin12m * base.pmp),
      rotation: stockMoyen > 0 ? round(consommation12m / stockMoyen) : null,
      couvertureJours: cmj === null ? null : round(stockDisponible / cmj, 1),
      abcHistoriqueValeur: null,
      abcHistoriqueFrequence: null,
      abcPrevisionValeur: null,
      profil: 'sans_activite',
    })
  }

  const historicalValue = abcClasses(
    rows,
    (row) => row.valorisationConsommation,
    (row) => row.article
  )
  const historicalFrequency = abcClasses(
    rows,
    (row) => row.operations,
    (row) => row.article
  )
  const futureValue = abcClasses(
    rows,
    (row) => row.valorisationBesoin,
    (row) => row.article
  )
  for (const row of rows) {
    row.abcHistoriqueValeur = historicalValue.get(row.article) ?? null
    row.abcHistoriqueFrequence = historicalFrequency.get(row.article) ?? null
    row.abcPrevisionValeur = futureValue.get(row.article) ?? null
    if (row.abcHistoriqueValeur === 'A' && row.abcPrevisionValeur === 'A') {
      row.profil = 'strategique'
    } else if (row.abcHistoriqueValeur === 'A' && row.abcPrevisionValeur === 'C') {
      row.profil = 'fin_de_vie'
    } else if (row.abcHistoriqueValeur === 'C' && row.abcPrevisionValeur === 'A') {
      row.profil = 'lancement'
    } else if (row.consommation12m > 0 || row.besoin12m > 0) {
      row.profil = 'standard'
    }
  }

  return rows.sort(
    (a, b) => a.categorie.localeCompare(b.categorie) || a.article.localeCompare(b.article)
  )
}
