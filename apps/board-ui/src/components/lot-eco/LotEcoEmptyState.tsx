import { Package, TrendingDown } from 'lucide-react'

interface Props {
  onAnalyze: () => void
}

export function LotEcoEmptyState({ onAnalyze }: Props) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md space-y-6">
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping" />
          <div className="relative bg-card border border-border rounded-2xl w-20 h-20 flex items-center justify-center shadow-sm">
            <Package className="h-9 w-9 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-foreground tracking-tight">Analyse des lots économiques</h2>
          <p className="text-sm text-stone-500 leading-relaxed">
            Compare les lots économiques de réapprovisionnement avec les besoins réels des composants achetés.
          </p>
        </div>
        <button
          onClick={onAnalyze}
          className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all hover:shadow-md active:scale-[0.98]"
        >
          <TrendingDown className="h-4 w-4" />
          Lancer l'analyse
        </button>
      </div>
    </div>
  )
}
