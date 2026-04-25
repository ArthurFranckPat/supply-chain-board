import { useState, useEffect, useCallback } from 'react'
import { apiClient, ApiError } from '@/api/client'
import { StockEvolutionChart } from './StockEvolutionChart'
import { StockProjectionTable } from './StockProjectionTable'
import type { LotEcoArticle, StatutLot, TarifAchat } from '@/types/lot-eco'
import type { StockEvolutionResponse } from '@/types/stock-evolution'
import { lotEcoCache } from '@/api/lotEcoCache'
import {
  ArrowLeft, Package, TrendingDown, AlertTriangle, CheckCircle2, Minus,
  CalendarDays, Boxes, Scale, Euro, Info
} from 'lucide-react'

type Props = {
  article: LotEcoArticle
  onBack: () => void
}

function fmt(n: number, decimals = 1): string {
  if (n < 0) return '∞'
  return n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtEuros(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k€`
  return `${n.toFixed(0)}€`
}

function StatutBadge({ statut }: { statut: StatutLot }) {
  const map: Record<StatutLot, { icon: React.ReactNode; label: string; bg: string; text: string; dot: string }> = {
    OK: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'OK — Adéquation correcte', bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-500' },
    SURDIMENSIONNE: { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: 'Surdimensionné — Lot supérieur au besoin', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    SOUSDIMENSIONNE: { icon: <TrendingDown className="h-3.5 w-3.5" />, label: 'Sous-dimensionné — Lot inférieur au besoin', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    DEMANDE_NULLE: { icon: <Minus className="h-3.5 w-3.5" />, label: 'Demande nulle — Pas de consommation', bg: 'bg-stone-100', text: 'text-stone-500', dot: 'bg-stone-400' },
  }
  const { icon, label, bg, text, dot } = map[statut]
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11.5px] font-semibold ${bg} ${text}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {icon}
      {label}
    </span>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="p-1.5 rounded-lg bg-stone-200/70">{icon}</div>
      <h3 className="text-sm font-bold text-foreground tracking-tight">{title}</h3>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'bg-green-50/50 px-3 -mx-3 rounded-lg' : ''}`}>
      <span className="text-[11.5px] text-stone-500">{label}</span>
      <span className={`text-[11.5px] font-semibold font-mono ${highlight ? 'text-green-700' : 'text-foreground'}`}>{value}</span>
    </div>
  )
}

export function LotEcoDetailView({ article, onBack }: Props) {
  const [stockData, setStockData] = useState<StockEvolutionResponse | null>(null)
  const [stockLoading, setStockLoading] = useState(true)
  const [stockError, setStockError] = useState<string | null>(null)
  const [tarifs, setTarifs] = useState<TarifAchat[]>([])
  const [tarifsLoading, setTarifsLoading] = useState(true)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setAnimateIn(true), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    setTarifsLoading(true)
    apiClient.getTarifs(article.article)
      .then(setTarifs)
      .catch(() => setTarifs([]))
      .finally(() => setTarifsLoading(false))
  }, [article.article])

  const loadStockData = useCallback(() => {
    // Check cache first
    const cached = lotEcoCache.getStock(article.article)
    if (cached) {
      setStockData(cached)
      setStockLoading(false)
      return
    }

    setStockLoading(true)
    setStockError(null)
    apiClient.getStockEvolution(article.article, {
      horizon_days: 365,
      include_internal: false,
    })
      .then((data) => {
        setStockData(data)
        lotEcoCache.setStock(article.article, data, article)
      })
      .catch((err) => {
        setStockError(err instanceof ApiError ? err.message : 'Erreur de chargement')
      })
      .finally(() => {
        setStockLoading(false)
      })
  }, [article.article])

  useEffect(() => {
    loadStockData()
  }, [loadStockData])

  const hasEconomy = article.economie_immobilisation > 0
  const hasSurcout = article.surcout_unitaire > 0

  return (
    <div className={`max-w-[1200px] mx-auto space-y-8 transition-all duration-500 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[11.5px] text-stone-400 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à la liste
        </button>

        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">{article.article}</h1>
              <StatutBadge statut={article.statut} />
            </div>
            <p className="text-sm text-stone-500">{article.description}</p>
            {article.code_fournisseur > 0 && (
              <p className="text-[11px] text-stone-400 font-mono">Fournisseur {article.code_fournisseur}</p>
            )}
          </div>
        </div>
      </div>

      {/* Lot Eco & Stock — 2 columns */}
      <div className="grid grid-cols-2 gap-6">
        {/* Lot économique */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <SectionHeader icon={<Scale className="h-4 w-4 text-stone-500" />} title="Paramètres Lot Éco" />

          <div className="space-y-1">
            <InfoRow label="Lot économique" value={article.lot_eco.toLocaleString('fr-FR')} />
            <InfoRow label="Lot optimal" value={article.lot_optimal.toLocaleString('fr-FR')} highlight={article.lot_optimal < article.lot_eco} />
            {article.conditionnements.length > 0 ? (
              <InfoRow label="Conditionnements" value={article.conditionnements.map(([q, t]) => `${q.toLocaleString('fr-FR')}${t ? ' ' + t : ''}`).join(' | ')} />
            ) : (
              <InfoRow label="Conditionnements" value="—" />
            )}
          </div>

          <div className="border-t border-border/60 pt-3 space-y-1">
            <InfoRow label="Prix au lot éco" value={article.prix_au_lot_eco > 0 ? `${article.prix_au_lot_eco.toFixed(4)} €` : '—'} />
            <InfoRow label="Prix au lot optimal" value={article.prix_au_lot_optimal > 0 ? `${article.prix_au_lot_optimal.toFixed(4)} €` : '—'} />
            {hasEconomy && (
              <InfoRow
                label="Économie d'immobilisation"
                value={`${fmtEuros(article.economie_immobilisation)}`}
                highlight
              />
            )}
            {hasSurcout && (
              <InfoRow
                label="Surcoût unitaire"
                value={`+${article.surcout_unitaire.toFixed(4)} €`}
              />
            )}
          </div>

          <div className="border-t border-border/60 pt-3 space-y-1">
            <InfoRow label="Nb. parents nomenclature" value={article.nb_parents > 0 ? String(article.nb_parents) : '—'} />
          </div>
        </div>

        {/* Stock actuel */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <SectionHeader icon={<Boxes className="h-4 w-4 text-stone-500" />} title="État du Stock" />

          <div className="space-y-1">
            <InfoRow label="Stock physique" value={article.stock_physique.toLocaleString('fr-FR')} />
            <InfoRow label="Stock alloué" value={article.stock_alloue.toLocaleString('fr-FR')} />
            <InfoRow label="Stock disponible" value={article.stock_disponible.toLocaleString('fr-FR')} />
            <InfoRow label="Valeur du stock" value={fmtEuros(article.valeur_stock)} />
            <InfoRow label="Stock (jours)" value={article.stock_jours >= 0 ? `${fmt(article.stock_jours, 1)} jours` : '∞'} />
          </div>

          <div className="border-t border-border/60 pt-3 space-y-1">
            <InfoRow label="Prix moyen pondéré" value={article.valeur_stock > 0 && article.stock_physique > 0 ? `${(article.valeur_stock / article.stock_physique).toFixed(2)} €` : '—'} />
          </div>
        </div>
      </div>

      {/* Couverture */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <SectionHeader icon={<CalendarDays className="h-4 w-4 text-stone-500" />} title="Analyse de Couverture" />

        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Demande / sem</p>
            <p className="text-xl font-bold text-foreground">{fmt(article.demande_hebdo)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Couverture lot</p>
            <p className="text-xl font-bold text-foreground">{article.couverture_lot_semaines >= 0 ? `${fmt(article.couverture_lot_semaines)} sem` : '∞'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Délai réappro.</p>
            <p className="text-xl font-bold text-foreground">{article.delai_reappro_jours > 0 ? `${article.delai_reappro_jours} jours` : '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Ratio couverture</p>
            <p className={`text-xl font-bold ${
              article.ratio_couverture > 3 ? 'text-red-600'
              : article.ratio_couverture > 1.5 ? 'text-amber-600'
              : article.ratio_couverture < 0.5 && article.demande_hebdo > 0 ? 'text-amber-600'
              : 'text-green-700'
            }`}>
              {article.ratio_couverture >= 0 ? `${fmt(article.ratio_couverture, 2)}x` : '∞'}
            </p>
          </div>
        </div>

        {/* Visual ratio bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-[10.5px] text-stone-400">
            <span>Ratio de couverture</span>
            <span className="font-semibold text-foreground">{article.ratio_couverture >= 0 ? `${fmt(article.ratio_couverture, 2)}x` : '∞'}</span>
          </div>
          <div className="relative h-3 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${
                article.ratio_couverture > 3 ? 'bg-red-400'
                : article.ratio_couverture > 1.5 ? 'bg-amber-400'
                : article.demande_hebdo > 0 ? 'bg-green-500'
                : 'bg-stone-300'
              }`}
              style={{
                width: `${Math.min(article.ratio_couverture > 0 ? (article.ratio_couverture / 5) * 100 : 0, 100)}%`,
              }}
            />
            {/* Optimal zone marker */}
            <div className="absolute left-[20%] top-0 bottom-0 w-px bg-green-400/60" title="Seuil optimal (1x)" />
            <div className="absolute left-[40%] top-0 bottom-0 w-px bg-amber-400/40" title="Seuil bas (0.8x)" />
          </div>
          <div className="flex justify-between text-[10px] text-stone-300">
            <span>0</span>
            <span className="text-green-500">opt.</span>
            <span>5x+</span>
          </div>
        </div>

        <div className="bg-stone-50 border border-border/60 rounded-xl p-3 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-stone-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-stone-500 leading-relaxed">
            Le ratio de couverture compare la durée de consommation du lot éco ({article.couverture_lot_semaines >= 0 ? `${fmt(article.couverture_lot_semaines)} sem` : '∞'}) au délai de réapprovisionnement ({article.delai_reappro_jours > 0 ? `${article.delai_reappro_jours}j` : '—'}).
            {article.statut === 'SURDIMENSIONNE' && ` Un ratio de ${fmt(article.ratio_couverture)}x signifie un capital immobilisé pendant ${fmt(article.couverture_lot_semaines - (article.delai_reappro_jours / 7), 1)} semaines de trop.`}
            {article.statut === 'SOUSDIMENSIONNE' && ` Un ratio de ${fmt(article.ratio_couverture)}x implique des ruptures potentielles avant le prochain réapprovisionnement.`}
            {article.statut === 'OK' && ` Le lot économique est bien calibré au besoin hebdomadaire.`}
          </p>
        </div>
      </div>

      {/* Historique de consommation — 365 jours */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <SectionHeader icon={<Package className="h-4 w-4 text-stone-500" />} title="Historique de Consommation — 365 jours" />

        {stockLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-stone-400">Chargement de l'historique...</p>
            </div>
          </div>
        ) : stockError ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm text-stone-500">{stockError}</p>
              <button
                onClick={loadStockData}
                className="text-xs text-primary hover:underline"
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : stockData ? (
          <>
            <StockEvolutionChart data={stockData} lotEco={article} />
            {stockData.stock_moyen > 0 && (
              <div className="grid grid-cols-4 gap-4 pt-2">
                <div className="space-y-1">
                  <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Stock moyen</p>
                  <p className="text-lg font-bold text-foreground">{stockData.stock_moyen.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Stock min</p>
                  <p className="text-lg font-bold text-red-600">{stockData.stock_min.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Stock max</p>
                  <p className="text-lg font-bold text-green-700">{stockData.stock_max.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Mouvements</p>
                  <p className="text-lg font-bold text-foreground">{stockData.nombre_mouvements.toLocaleString('fr-FR')}</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-sm text-stone-400">Aucune donnée de mouvement disponible</p>
          </div>
        )}
      </div>

      {/* Projection stock semaines S+1 à S+26 */}
      {article.demande_hebdo > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <SectionHeader
            icon={<Package className="h-4 w-4 text-stone-500" />}
            title="Projection Stock — 26 prochaines semaines"
          />
          <StockProjectionTable
            articleCode={article.article}
            stockInitial={article.stock_disponible}
            lotEco={article.lot_eco}
            lotOptimal={article.lot_optimal}
            delaiReappro={article.delai_reappro_jours}
            demandeHebdo={article.demande_hebdo}
          />
        </div>
      )}

      {/* Grille tarifaire */}
      {tarifsLoading ? (
        <div className="bg-card border border-border rounded-2xl p-6">
          <SectionHeader icon={<Euro className="h-4 w-4 text-stone-500" />} title="Grille Tarifaire" />
          <div className="flex items-center justify-center h-24">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        </div>
      ) : tarifs.length > 0 ? (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <SectionHeader icon={<Euro className="h-4 w-4 text-stone-500" />} title={`Grille Tarifaire — Fourn. ${tarifs[0]!.code_fournisseur}`} />

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-2 px-3">Qté min</th>
                  <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-2 px-3">Qté max</th>
                  <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-2 px-3">Prix unit.</th>
                  <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-2 px-3">Unité</th>
                  <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-2 px-3">Validité</th>
                  <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-2 px-3">Prix pour {article.lot_eco.toLocaleString('fr-FR')}</th>
                  <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-2 px-3">Prix pour {article.lot_optimal.toLocaleString('fr-FR')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {tarifs.map((t, i) => {
                  const inLotEco = t.quantite_mini <= article.lot_eco && article.lot_eco <= t.quantite_maxi
                  const inLotOpt = t.quantite_mini <= article.lot_optimal && article.lot_optimal <= t.quantite_maxi
                  return (
                    <tr key={i} className={`hover:bg-stone-50/50 transition-colors ${inLotEco || inLotOpt ? 'bg-primary/[0.03]' : ''}`}>
                      <td className="py-2.5 px-3 font-mono font-semibold text-foreground">{t.quantite_mini.toLocaleString('fr-FR')}</td>
                      <td className="py-2.5 px-3 font-mono text-stone-500">{t.quantite_maxi.toLocaleString('fr-FR')}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-foreground">{t.prix_unitaire.toFixed(4)} €</td>
                      <td className="py-2.5 px-3 text-stone-400">{t.unite}</td>
                      <td className="py-2.5 px-3 text-stone-400 text-[11px]">
                        {t.date_debut_validite
                          ? `${new Date(t.date_debut_validite).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}`
                          : '—'}
                        {t.date_fin_validite ? ` → ${new Date(t.date_fin_validite).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}` : ''}
                      </td>
                      <td className="py-2.5 px-3">
                        {inLotEco
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">{article.lot_eco.toLocaleString('fr-FR')} × {t.prix_unitaire.toFixed(4)} = <span className="font-mono">{(article.lot_eco * t.prix_unitaire).toFixed(2)} €</span></span>
                          : <span className="text-stone-300 text-[11px]">—</span>
                        }
                      </td>
                      <td className="py-2.5 px-3">
                        {inLotOpt
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-lg">{article.lot_optimal.toLocaleString('fr-FR')} × {t.prix_unitaire.toFixed(4)} = <span className="font-mono">{(article.lot_optimal * t.prix_unitaire).toFixed(2)} €</span></span>
                          : <span className="text-stone-300 text-[11px]">—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mini bar chart of price tiers */}
          <div className="space-y-1.5">
            <p className="text-[10.5px] text-stone-400 font-medium uppercase tracking-wider">Volume → Prix</p>
            <div className="flex items-end gap-1 h-16">
              {tarifs.map((t, i) => {
                const maxPrix = Math.max(...tarifs.map(x => x.prix_unitaire))
                const minPrix = Math.min(...tarifs.map(x => x.prix_unitaire))
                const range = maxPrix - minPrix || 1
                const height = maxPrix === minPrix ? 60 : 20 + ((maxPrix - t.prix_unitaire) / range) * 40
                const lotEcoIn = t.quantite_mini <= article.lot_eco && article.lot_eco <= t.quantite_maxi
                const lotOptIn = t.quantite_mini <= article.lot_optimal && article.lot_optimal <= t.quantite_maxi
                const isActive = lotEcoIn || lotOptIn
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-mono font-semibold text-foreground">{t.prix_unitaire.toFixed(2)}€</span>
                    <div
                      className={`w-full rounded-t transition-all ${isActive ? 'bg-primary' : 'bg-stone-200'}`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-[8px] text-stone-400 text-center leading-tight">{t.quantite_mini.toLocaleString('fr-FR')}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Recommandation */}
      {article.statut !== 'OK' && article.statut !== 'DEMANDE_NULLE' && (
        <div className={`border rounded-2xl p-6 ${article.statut === 'SURDIMENSIONNE' ? 'bg-red-50/70 border-red-200' : 'bg-amber-50/70 border-amber-200'}`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${article.statut === 'SURDIMENSIONNE' ? 'bg-red-100' : 'bg-amber-100'}`}>
              {article.statut === 'SURDIMENSIONNE'
                ? <AlertTriangle className={`h-5 w-5 text-red-600`} />
                : <TrendingDown className={`h-5 w-5 text-amber-600`} />
              }
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-foreground">
                {article.statut === 'SURDIMENSIONNE' ? 'Action recommandée : Réduire le lot de commande' : 'Action recommandée : Augmenter le lot de commande'}
              </h4>
              <div className="text-[11.5px] text-stone-600 space-y-1">
                {article.statut === 'SURDIMENSIONNE' ? (
                  <>
                    <p>Passer du lot économique de <strong>{article.lot_eco.toLocaleString('fr-FR')} unités</strong> au lot optimal de <strong>{article.lot_optimal.toLocaleString('fr-FR')} unités</strong>.</p>
                    {hasEconomy && <p>Cela libérerait <strong className="text-green-700">{fmtEuros(article.economie_immobilisation)}</strong> de capital immobilisé.</p>}
                  </>
                ) : (
                  <>
                    <p>Le lot économique actuel de <strong>{article.lot_eco.toLocaleString('fr-FR')} unités</strong> est insuffisant pour couvrir le délai de réapprovisionnement.</p>
                    <p>Le lot optimal serait de <strong>{article.lot_optimal.toLocaleString('fr-FR')} unités</strong>.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
