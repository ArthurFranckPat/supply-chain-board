import type { LotEcoResponse } from '@/types/lot-eco'
import { fmtEuros } from '@/lib/format'

interface Props { result: LotEcoResponse }

export function LotEcoStats({ result }: Props) {
  const totalValeurSurdim = result.articles.filter(a => a.statut === 'SURDIMENSIONNE').reduce((s, a) => s + a.valeur_stock, 0)
  const totalEcoImmobilisation = result.articles.filter(a => a.statut === 'SURDIMENSIONNE').reduce((s, a) => s + a.economie_immobilisation, 0)

  const items = [
    { label: 'Total', value: result.nb_total, sub: '' },
    { label: 'Surdim.', value: result.nb_surdimensionne, sub: totalValeurSurdim > 0 ? fmtEuros(totalValeurSurdim) : '', color: 'text-destructive' },
    { label: 'Sous-dim.', value: result.nb_sousdimensionne, sub: '', color: 'text-orange' },
    { label: 'OK', value: result.nb_ok, sub: totalEcoImmobilisation > 0 ? fmtEuros(totalEcoImmobilisation) : '', color: 'text-green' },
  ]

  return (
    <div className="grid grid-cols-4 gap-1">
      {items.map(stat => (
        <div key={stat.label} className="bg-card border border-border p-2">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
          <p className={`text-[16px] font-bold ${stat.color || ''}`}>{stat.value}</p>
          {stat.sub && <p className="text-[10px] text-muted-foreground">{stat.sub}</p>}
        </div>
      ))}
    </div>
  )
}
