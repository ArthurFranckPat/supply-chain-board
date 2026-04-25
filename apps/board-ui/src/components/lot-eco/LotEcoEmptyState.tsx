interface Props { onAnalyze: () => void }

export function LotEcoEmptyState({ onAnalyze }: Props) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center max-w-md space-y-3">
        <h2 className="text-[14px] font-bold">Analyse des lots économiques</h2>
        <p className="text-xs text-muted-foreground">Compare les lots économiques de réapprovisionnement avec les besoins réels.</p>
        <button onClick={onAnalyze} className="h-7 px-3 bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90">Lancer l'analyse</button>
      </div>
    </div>
  )
}
