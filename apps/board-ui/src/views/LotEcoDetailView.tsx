import { useState, useEffect, useCallback } from 'react'
import { apiClient, ApiError } from '@/api/client'
import { StockEvolutionChart } from './StockEvolutionChart'
import { StockProjectionTable } from './StockProjectionTable'
import { StatutBadge } from '@/components/ui/StatutBadge'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import { fmtNumber, fmtEuros } from '@/lib/format'
import type { LotEcoArticle, TarifAchat } from '@/types/lot-eco'
import type { StockEvolutionResponse } from '@/types/stock-evolution'
import { lotEcoCache } from '@/api/lotEcoCache'

type Props = { article: LotEcoArticle; onBack: () => void }

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${highlight ? 'bg-emerald-50 px-2 -mx-2' : ''}`}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-semibold font-mono ${highlight ? 'text-emerald-600' : ''}`}>{value}</span>
    </div>
  )
}

export function LotEcoDetailView({ article, onBack }: Props) {
  const [stockData, setStockData] = useState<StockEvolutionResponse | null>(null)
  const [stockLoading, setStockLoading] = useState(true)
  const [stockError, setStockError] = useState<string | null>(null)
  const [tarifs, setTarifs] = useState<TarifAchat[]>([])
  const [tarifsLoading, setTarifsLoading] = useState(true)

  useEffect(() => {
    setTarifsLoading(true)
    apiClient.getTarifs(article.article).then(setTarifs).catch(() => setTarifs([])).finally(() => setTarifsLoading(false))
  }, [article.article])

  const loadStockData = useCallback(() => {
    const cached = lotEcoCache.getStock(article.article)
    if (cached) { setStockData(cached); setStockLoading(false); return }
    setStockLoading(true); setStockError(null)
    apiClient.getStockEvolution(article.article, { horizon_days: 365, include_internal: false })
      .then(data => { setStockData(data); lotEcoCache.setStock(article.article, data, article) })
      .catch(err => setStockError(err instanceof ApiError ? err.message : 'Erreur'))
      .finally(() => setStockLoading(false))
  }, [article])

  useEffect(() => { loadStockData() }, [loadStockData])

  const hasEconomy = article.economie_immobilisation > 0

  const tarifColumns: GridTableColumn<TarifAchat>[] = [
    { key: 'fournisseur', header: 'Fournisseur', width: '100px', cell: (t) => <span className="font-mono">{t.code_fournisseur}</span> },
    { key: 'site', header: 'Site', width: '80px', cell: (t) => t.unite || '—' },
    { key: 'qte_min', header: 'Qté min', align: 'right', width: '90px', cell: (t) => <span className="tabular-nums font-mono">{t.quantite_mini.toLocaleString('fr-FR')}</span> },
    { key: 'prix', header: 'Prix', align: 'right', width: '100px', cell: (t) => <span className="tabular-nums font-mono font-semibold">{t.prix_unitaire.toFixed(4)}</span> },
    { key: 'devise', header: 'Devise', align: 'right', width: '70px', cell: (t) => <span className="font-mono">{t.devise}</span> },
    { key: 'validite', header: 'Valide', width: '1fr', cell: (t) => <span className="text-[10px] text-muted-foreground">{t.date_debut_validite} → {t.date_fin_validite}</span> },
  ]

  return (
    <div className="max-w-[1200px] space-y-3">
      <button onClick={onBack} className="text-[11px] text-muted-foreground hover:text-foreground">← Retour</button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-bold font-mono">{article.article}</h1>
            <StatutBadge statut={article.statut} variant="detail" size="md" />
          </div>
          <p className="text-xs text-muted-foreground">{article.description}</p>
          {article.code_fournisseur > 0 && <p className="text-[10px] text-muted-foreground font-mono">Fournisseur {article.code_fournisseur}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border border-border p-3 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide">Lot Éco</h3>
          <InfoRow label="Lot éco" value={article.lot_eco.toLocaleString('fr-FR')} />
          <InfoRow label="Lot optimal" value={article.lot_optimal.toLocaleString('fr-FR')} highlight={article.lot_optimal < article.lot_eco} />
          <InfoRow label="Conditionnements" value={article.conditionnements.length > 0 ? article.conditionnements.map(([q, t]) => `${q.toLocaleString('fr-FR')}${t ? ' ' + t : ''}`).join(' | ') : '—'} />
          <InfoRow label="Prix lot éco" value={article.prix_au_lot_eco > 0 ? `${article.prix_au_lot_eco.toFixed(4)} €` : '—'} />
          <InfoRow label="Prix lot optimal" value={article.prix_au_lot_optimal > 0 ? `${article.prix_au_lot_optimal.toFixed(4)} €` : '—'} />
          {hasEconomy && <InfoRow label="Économie" value={fmtEuros(article.economie_immobilisation)} highlight />}
        </div>

        <div className="bg-card border border-border p-3 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide">Stock</h3>
          <InfoRow label="Physique" value={article.stock_physique.toLocaleString('fr-FR')} />
          <InfoRow label="Alloué" value={article.stock_alloue.toLocaleString('fr-FR')} />
          <InfoRow label="Disponible" value={article.stock_disponible.toLocaleString('fr-FR')} />
          <InfoRow label="Valeur" value={fmtEuros(article.valeur_stock)} />
          <InfoRow label="Jours" value={article.stock_jours >= 0 ? `${fmtNumber(article.stock_jours, 1)}j` : '∞'} />
        </div>
      </div>

      <div className="bg-card border border-border p-3 space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide">Couverture</h3>
        <div className="grid grid-cols-4 gap-2">
          <div><p className="text-[10px] text-muted-foreground uppercase">Demande/sem</p><p className="text-[14px] font-bold">{fmtNumber(article.demande_hebdo)}</p></div>
          <div><p className="text-[10px] text-muted-foreground uppercase">Couverture</p><p className="text-[14px] font-bold">{article.couverture_lot_semaines >= 0 ? `${fmtNumber(article.couverture_lot_semaines)} sem` : '∞'}</p></div>
          <div><p className="text-[10px] text-muted-foreground uppercase">Délai</p><p className="text-[14px] font-bold">{article.delai_reappro_jours > 0 ? `${article.delai_reappro_jours}j` : '—'}</p></div>
          <div><p className="text-[10px] text-muted-foreground uppercase">Ratio</p><p className="text-[14px] font-bold">{article.ratio_couverture >= 0 ? `${fmtNumber(article.ratio_couverture, 2)}x` : '∞'}</p></div>
        </div>
      </div>

      <div className="bg-card border border-border p-3 space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide">Historique 365j</h3>
        {stockLoading ? <div className="py-8 text-center text-xs text-muted-foreground">Chargement...</div>
          : stockError ? <div className="py-8 text-center text-xs text-muted-foreground">{stockError} <button onClick={loadStockData} className="text-primary underline">Réessayer</button></div>
          : stockData ? (
            <>
              <StockEvolutionChart data={stockData} lotEco={article} />
              {stockData.stock_moyen > 0 && (
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div><p className="text-[10px] text-muted-foreground uppercase">Moyen</p><p className="text-[13px] font-bold">{stockData.stock_moyen.toFixed(0)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground uppercase">Min</p><p className="text-[13px] font-bold text-destructive">{stockData.stock_min.toFixed(0)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground uppercase">Max</p><p className="text-[13px] font-bold">{stockData.stock_max.toFixed(0)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground uppercase">Mouvements</p><p className="text-[13px] font-bold">{stockData.nombre_mouvements}</p></div>
                </div>
              )}
              <StockProjectionTable articleCode={article.article} stockInitial={article.stock_physique} lotEco={article.lot_eco} lotOptimal={article.lot_optimal} delaiReappro={article.delai_reappro_jours} demandeHebdo={article.demande_hebdo} />
            </>
          ) : null}
      </div>

      {/* Tarifs */}
      <div className="bg-card border border-border p-3 space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide">Tarifs d'achat</h3>
        {tarifsLoading ? <p className="text-xs text-muted-foreground">Chargement...</p>
          : tarifs.length === 0 ? <p className="text-xs text-muted-foreground">Aucun tarif</p>
          : <GridTable columns={tarifColumns} data={tarifs} keyExtractor={(_, i) => String(i)} maxHeight="300px" emptyMessage="Aucun tarif" />
        }
      </div>
    </div>
  )
}
