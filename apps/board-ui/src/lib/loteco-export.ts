import type { LotEcoArticle } from '@/types/lot-eco'
import * as XLSX from 'xlsx'

const CSV_HEADERS = [
  'Article', 'Description', 'Lot éco', 'Lot optimal', 'Cond.', 'Demande/sem', 'Couv. lot (sem)',
  'Délai réappro (j)', 'Ratio couverture', 'Stock physique', 'Stock dispo', 'Stock (jours)',
  'Statut', 'Nb parents', 'Valeur stock', 'Prix lot éco', 'Prix lot optimal',
  'Economie immobilisation', 'Surcoût unitaire', 'Fournisseur',
]

function toCsvRow(a: LotEcoArticle): string {
  const cells = [
    a.article, a.description, a.lot_eco, a.lot_optimal,
    a.conditionnements.map(([q, t]) => `${q}${t ? ' ' + t : ''}`).join(', '),
    a.demande_hebdo,
    a.couverture_lot_semaines, a.delai_reappro_jours, a.ratio_couverture,
    a.stock_physique, a.stock_disponible, a.stock_jours,
    a.statut, a.nb_parents, a.valeur_stock,
    a.prix_au_lot_eco, a.prix_au_lot_optimal,
    a.economie_immobilisation, a.surcout_unitaire, a.code_fournisseur,
  ]
  return cells.join(';')
}

export function exportLotEcoCSV(data: LotEcoArticle[]) {
  const rows = data.map(toCsvRow)
  const csv = [CSV_HEADERS.join(';'), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `analyse_lot_eco_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const XLSX_COLS: XLSX.ColInfo[] = [
  { wch: 14 }, { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 20 },
  { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
  { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
  { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
]

export function exportLotEcoExcel(data: LotEcoArticle[]) {
  const rows = data.map((a) => ({
    'Article': a.article,
    'Description': a.description,
    'Fournisseur': a.code_fournisseur || '',
    'Lot éco': a.lot_eco,
    'Lot optimal': a.lot_optimal,
    'Conditionnements': a.conditionnements.map(([q, t]) => `${q}${t ? ' ' + t : ''}`).join(', '),
    'Demande/sem': a.demande_hebdo,
    'Délai réappro (j)': a.delai_reappro_jours,
    'Couverture lot (sem)': a.couverture_lot_semaines,
    'Ratio couverture': a.ratio_couverture,
    'Stock physique': a.stock_physique,
    'Stock disponible': a.stock_disponible,
    'Stock (jours)': a.stock_jours,
    'Valeur stock': a.valeur_stock,
    'Prix lot éco': a.prix_au_lot_eco,
    'Prix lot optimal': a.prix_au_lot_optimal,
    'Éco. immobilisation': a.economie_immobilisation,
    'Surcoût unitaire': a.surcout_unitaire,
    'Statut': a.statut,
    'Nb parents': a.nb_parents,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lot Eco')
  ws['!cols'] = XLSX_COLS
  XLSX.writeFile(wb, `lot_eco_selection_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
