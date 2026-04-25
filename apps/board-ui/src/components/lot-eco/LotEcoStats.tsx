import { Package, AlertTriangle, TrendingDown, CheckCircle2 } from 'lucide-react'
import type { LotEcoResponse } from '@/types/lot-eco'
import { fmtEuros } from '@/lib/format'

interface Props {
  result: LotEcoResponse
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden w-16">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const STAT_ITEMS = [
  { key: 'total', label: 'Total', icon: Package, color: 'text-stone-600', bg: 'bg-stone-100' },
  { key: 'surdimensionne', label: 'Surdimensionnés', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'sousdimensionne', label: 'Sous-dimensionnés', icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'ok', label: 'OK', icon: CheckCircle2, color: 'text-green-700', bg: 'bg-green-50' },
] as const

export function LotEcoStats({ result }: Props) {
  const totalValeurSurdim = result.articles
    .filter((a) => a.statut === 'SURDIMENSIONNE')
    .reduce((s, a) => s + a.valeur_stock, 0)

  const totalEcoImmobilisation = result.articles
    .filter((a) => a.statut === 'SURDIMENSIONNE')
    .reduce((s, a) => s + a.economie_immobilisation, 0)

  const maxValeur = Math.max(...result.articles.map((a) => a.valeur_stock), 1)
  const maxEco = Math.max(...result.articles.map((a) => Math.abs(a.economie_immobilisation)), 1)

  const counts: Record<string, number> = {
    total: result.nb_total,
    surdimensionne: result.nb_surdimensionne,
    sousdimensionne: result.nb_sousdimensionne,
    ok: result.nb_ok,
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {STAT_ITEMS.map((stat) => {
        const Icon = stat.icon
        return (
          <div key={stat.key} className="relative overflow-hidden bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wide">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.color}`}>{counts[stat.key]}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
            {stat.key === 'surdimensionne' && result.nb_surdimensionne > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-[10.5px] text-stone-500">
                  <span>Valeur bloquée</span>
                  <span className="font-semibold text-red-600">{fmtEuros(totalValeurSurdim)}</span>
                </div>
                <MiniBar value={totalValeurSurdim} max={maxValeur * 3} color="bg-red-400" />
              </div>
            )}
            {stat.key === 'ok' && result.nb_ok > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-[10.5px] text-stone-500">
                  <span>Éco. potentielle</span>
                  <span className="font-semibold text-primary">{fmtEuros(totalEcoImmobilisation)}</span>
                </div>
                <MiniBar value={totalEcoImmobilisation} max={maxEco * 3} color="bg-primary" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
