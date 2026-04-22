import { useState, useMemo } from 'react'
import { apiClient, ApiError } from '@/api/client'
import type { LotEcoResponse, LotEcoArticle, StatutLot } from '@/types/lot-eco'
import { Pill } from '@/components/ui/pill'
import { LoadingInline, LoadingError, LoadingEmpty } from '@/components/ui/loading'
import { Package, Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type TabKey = 'surdimensionne' | 'sous_dimensionne' | 'ok' | 'demande_nulle' | 'all'
type SortKey = 'ratio_couverture' | 'demande_hebdo' | 'couverture_lot_semaines' | 'valeur_stock' | 'stock_jours' | 'lot_eco' | 'economie_immobilisation' | 'surcout_unitaire'
type SortDir = 'asc' | 'desc'

const TAB_ITEMS: Array<{ key: TabKey; label: string; filter: StatutLot | 'ALL' }> = [
  { key: 'surdimensionne', label: 'Surdimensionnés', filter: 'SURDIMENSIONNE' },
  { key: 'sous_dimensionne', label: 'Sous-dimensionnés', filter: 'SOUSDIMENSIONNE' },
  { key: 'ok', label: 'OK', filter: 'OK' },
  { key: 'demande_nulle', label: 'Demande nulle', filter: 'DEMANDE_NULLE' },
  { key: 'all', label: 'Tous', filter: 'ALL' },
]

function StatutPill({ statut }: { statut: StatutLot }) {
  const map: Record<StatutLot, { tone: 'good' | 'danger' | 'warn' | 'default'; label: string }> = {
    OK: { tone: 'good', label: 'OK' },
    SURDIMENSIONNE: { tone: 'danger', label: 'Surdimensionné' },
    SOUSDIMENSIONNE: { tone: 'warn', label: 'Sous-dim.' },
    DEMANDE_NULLE: { tone: 'default', label: 'Demande nulle' },
  }
  const { tone, label } = map[statut]
  return <Pill tone={tone}>{label}</Pill>
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />
  return dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
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

function exportCSV(data: LotEcoArticle[]) {
  const headers = [
    'Article', 'Description', 'Lot éco', 'Lot optimal', 'Demande/sem', 'Couv. lot (sem)',
    'Délai réappro (j)', 'Ratio couverture', 'Stock physique', 'Stock dispo', 'Stock (jours)',
    'Statut', 'Nb parents', 'Valeur stock', 'Prix lot éco', 'Prix lot optimal',
    'Economie immobilisation', 'Surcoût unitaire', 'Fournisseur',
  ]
  const rows = data.map(a => [
    a.article, a.description, a.lot_eco, a.lot_optimal, a.demande_hebdo,
    a.couverture_lot_semaines, a.delai_reappro_jours, a.ratio_couverture,
    a.stock_physique, a.stock_disponible, a.stock_jours,
    a.statut, a.nb_parents, a.valeur_stock,
    a.prix_au_lot_eco, a.prix_au_lot_optimal,
    a.economie_immobilisation, a.surcout_unitaire, a.code_fournisseur,
  ].join(';'))
  const csv = [headers.join(';'), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `analyse_lot_eco_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function LotEcoView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LotEcoResponse | null>(null)
  const [tab, setTab] = useState<TabKey>('surdimensionne')
  const [sortKey, setSortKey] = useState<SortKey>('ratio_couverture')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.analyseLotEco()
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    if (!result) return []
    const tabDef = TAB_ITEMS.find(t => t.key === tab)!
    const items = tabDef.filter === 'ALL'
      ? result.articles
      : result.articles.filter(a => a.statut === tabDef.filter)
    return [...items].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [result, tab, sortKey, sortDir])

  const HeaderCell = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <th
      className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon active={sortKey === colKey} dir={sortDir} />
      </span>
    </th>
  )

  if (loading) return <LoadingInline label="analyse lot éco" sublabel="Calcul de l'adéquation lots vs besoins..." />

  if (error) return <LoadingError message={error} onRetry={handleAnalyze} />

  if (!result) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-6 text-center space-y-4">
          <Package className="h-10 w-10 mx-auto text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Analyse des lots économiques</p>
            <p className="text-xs text-muted-foreground mt-1">
              Compare les lots économiques de réapprovisionnement avec les besoins réels des composants achetés.
            </p>
          </div>
          <button
            onClick={handleAnalyze}
            className="bg-primary text-white px-5 py-2 rounded-[7px] text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            Lancer l'analyse
          </button>
        </div>
      </div>
    )
  }

  const totalValeurSurdim = result.articles
    .filter(a => a.statut === 'SURDIMENSIONNE')
    .reduce((s, a) => s + a.valeur_stock, 0)

  const totalEcoImmobilisation = result.articles
    .filter(a => a.statut === 'SURDIMENSIONNE')
    .reduce((s, a) => s + a.economie_immobilisation, 0)

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total composants', value: result.nb_total, tone: 'default' },
          { label: 'Surdimensionnés', value: result.nb_surdimensionne, tone: 'danger' },
          { label: 'Sous-dimensionnés', value: result.nb_sousdimensionne, tone: 'warn' },
          { label: 'OK', value: result.nb_ok, tone: 'good' },
          { label: 'Valeur surdimensionnée', value: fmtEuros(totalValeurSurdim), tone: 'danger' },
          { label: 'Éco. immobilisation', value: fmtEuros(totalEcoImmobilisation), tone: 'primary' },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10.5px] text-muted-foreground uppercase tracking-wider font-medium">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${
              card.tone === 'danger' ? 'text-destructive'
              : card.tone === 'warn' ? 'text-orange'
              : card.tone === 'good' ? 'text-green'
              : card.tone === 'primary' ? 'text-primary'
              : 'text-foreground'
            }`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + export */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {TAB_ITEMS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors ${
                tab === t.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.key !== 'all' && (
                <span className="ml-1.5 text-[10px] opacity-60">
                  {t.key === 'surdimensionne' ? result.nb_surdimensionne
                    : t.key === 'sous_dimensionne' ? result.nb_sousdimensionne
                    : t.key === 'ok' ? result.nb_ok
                    : result.nb_demande_nulle}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <LoadingEmpty message="Aucun article dans cette catégorie" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border">
                <tr>
                  <HeaderCell label="Article" colKey="ratio_couverture" />
                  <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5 px-3">Description</th>
                  <HeaderCell label="Lot éco" colKey="lot_eco" />
                  <HeaderCell label="Lot optimal" colKey="economie_immobilisation" />
                  <HeaderCell label="Dem./sem" colKey="demande_hebdo" />
                  <HeaderCell label="Délai" colKey="ratio_couverture" />
                  <HeaderCell label="Ratio" colKey="ratio_couverture" />
                  <HeaderCell label="Prix lot" colKey="economie_immobilisation" />
                  <HeaderCell label="Prix opt." colKey="surcout_unitaire" />
                  <HeaderCell label="Éco. immob." colKey="economie_immobilisation" />
                  <HeaderCell label="Surcoût/u" colKey="surcout_unitaire" />
                  <HeaderCell label="Stock" colKey="stock_jours" />
                  <HeaderCell label="Valeur" colKey="valeur_stock" />
                  <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5 px-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.article} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2 px-3 font-mono font-medium text-foreground">{a.article}</td>
                    <td className="py-2 px-3 text-muted-foreground max-w-[180px] truncate" title={a.description}>{a.description}</td>
                    <td className="py-2 px-3 font-mono">{a.lot_eco.toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3 font-mono text-primary font-medium">{a.lot_optimal.toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3 font-mono">{fmt(a.demande_hebdo)}</td>
                    <td className="py-2 px-3 font-mono">{a.delai_reappro_jours}j</td>
                    <td className="py-2 px-3 font-mono font-semibold text-foreground">{fmt(a.ratio_couverture, 1)}x</td>
                    <td className="py-2 px-3 font-mono">{a.prix_au_lot_eco > 0 ? a.prix_au_lot_eco.toFixed(4) : '—'}</td>
                    <td className="py-2 px-3 font-mono">{a.prix_au_lot_optimal > 0 ? a.prix_au_lot_optimal.toFixed(4) : '—'}</td>
                    <td className={`py-2 px-3 font-mono font-semibold ${a.economie_immobilisation > 0 ? 'text-green' : ''}`}>
                      {a.economie_immobilisation > 0 ? fmtEuros(a.economie_immobilisation) : '—'}
                    </td>
                    <td className={`py-2 px-3 font-mono ${a.surcout_unitaire > 0 ? 'text-orange' : a.surcout_unitaire < 0 ? 'text-green' : ''}`}>
                      {a.prix_au_lot_eco > 0 ? (a.surcout_unitaire > 0 ? '+' : '') + a.surcout_unitaire.toFixed(4) : '—'}
                    </td>
                    <td className="py-2 px-3 font-mono">{a.stock_disponible.toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3 font-mono">{fmtEuros(a.valeur_stock)}</td>
                    <td className="py-2 px-3"><StatutPill statut={a.statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
