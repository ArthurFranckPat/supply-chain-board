import { type CamionDtl } from '@r/components/expeditions/camion-detail-sheet'
import { chargeBgClass, chargeText, chargeTier } from '@/components/expeditions/palette-charge'
import { Clock, TriangleAlert, Truck } from 'lucide-react'
import { cn } from '@r/lib/utils'

/**
 * Vue « Manifestes camion » — port React iso du Solid
 * inertia/components/expeditions/manifeste-view.tsx. Chaque camion est une carte
 * compacte avec une barre de remplissage (le lit du camion).
 */

export type ManifesteSort = 'time' | 'load' | 'client'

export function ManifesteView({
  rows,
  maxPalettesCamion: _maxPalettesCamion,
  camionCapacitePalettes,
  selectedCamion,
  onSelect,
}: {
  rows: CamionDtl[]
  maxPalettesCamion: number
  camionCapacitePalettes: number
  selectedCamion: CamionDtl | null
  onSelect: (row: CamionDtl) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-5 pb-8 pt-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-3.5">
          <div className="col-span-full flex flex-col items-center gap-2 p-10 text-center">
            <Truck size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
            <span className="font-fraunces text-[14px] italic text-muted-foreground">
              Aucun camion ne correspond au filtre.
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 pb-8 pt-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-3.5">
        {rows.map((c) => {
          // Taux de remplissage effectif : palTheo (éq. standard pondéré ESH) quand
          // disponible, sinon fallback nbPalettes / capacité (cas sans coef article).
          const taux = c.palTheo >= 0 ? c.tauxRemplissage : c.nbPalettes / camionCapacitePalettes
          const tier = chargeTier(taux)
          // Débord = volume au-delà de 100 % de la capacité.
          const over = Math.max(taux - 1, 0)
          const fillPct = Math.min(taux * 100, 100)
          const isSel = selectedCamion === c
          // Chiffre principal adaptatif : nbPalettes si scanné (>0), sinon palTheo si
          // calculable (PALNUM absent mais coef article dispo), sinon '—'.
          const hasScan = c.nbPalettes > 0
          const hasTheo = c.palTheo >= 0
          const mainValue = hasScan ? String(c.nbPalettes) : hasTheo ? c.palTheo.toFixed(1) : '—'
          const mainSuffix = hasScan ? '' : hasTheo ? ' théo.' : ''
          return (
            <button
              key={`${c.bprnum}-${c.debut}-${c.client}`}
              type="button"
              className={cn(
                'relative flex flex-col gap-3 overflow-hidden rounded-lg border bg-card p-4 text-left transition-[border-color,box-shadow] duration-150',
                'border-rule hover:border-brand',
                isSel && 'border-brand ring-2 ring-brand/20',
                c.anomalie && 'border-destructive/45',
                c.anomalie &&
                  'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-destructive'
              )}
              onClick={() => onSelect(c)}
            >
              {/* En-tête : client + créneau */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-bold text-foreground">
                      {c.client || '—'}
                    </span>
                    {c.source === 'navette' && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-brand/10 px-1 font-mono text-[8px] font-bold uppercase tracking-wider text-brand"
                        title={`Navette ${c.navetteNum}`}
                      >
                        {c.navetteNum}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{c.bprnum}</span>
                </div>
                <span
                  className={cn(
                    'flex flex-none items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10px] font-bold',
                    c.anomalie
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-secondary text-secondary-foreground'
                  )}
                >
                  <Clock size={12} strokeWidth={1.75} />
                  {c.debut}
                  {c.fin !== c.debut ? `–${c.fin}` : ''}
                </span>
              </div>

              {/* Barre de charge — le « lit » du camion (pilotée par le taux de remplissage) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      'flex items-baseline gap-1 font-fraunces text-[26px] font-black leading-none tracking-tight tabular-nums',
                      chargeText(tier)
                    )}
                  >
                    {mainValue}
                    <span className="font-mono text-[10px] font-semibold tracking-normal text-muted-foreground">
                      {mainSuffix}
                    </span>
                    {over > 0 && (
                      <span
                        className="font-mono text-[12px] font-bold text-destructive"
                        title={`${Math.round(over * 100)}% au-delà de la capacité`}
                      >
                        +{Math.round(over * 100)}%
                      </span>
                    )}
                    <span className="font-mono text-[10px] font-semibold tracking-normal text-muted-foreground">
                      / {camionCapacitePalettes} pal.
                    </span>
                  </span>
                  {/* palTheo en sous-texte seulement quand le scan existe (sinon déjà en principal) */}
                  {hasScan && hasTheo && (
                    <span
                      className="font-mono text-[9px] text-muted-foreground/70"
                      title="Équivalent-palettes théorique (calcul UC, pondéré ESH)"
                    >
                      ≈ {c.palTheo.toFixed(1)} théo.
                    </span>
                  )}
                </div>
                <div className="relative h-3.5 overflow-hidden rounded-full bg-secondary">
                  {over > 0 && (
                    // Débord hachuré : portion de barre au-delà de 100% (plafonnée visuellement).
                    <div
                      className="absolute inset-y-0 right-0"
                      style={{
                        width: `${Math.min((over / Math.max(taux, 1)) * 100, 100)}%`,
                        background:
                          /* hachures retard — deux tons dérivés du token destructive */
                          'repeating-linear-gradient(45deg, var(--color-destructive) 0 3px, color-mix(in srgb, var(--color-destructive) 70%, #ffffff) 3px 6px)',
                      }}
                    />
                  )}
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      chargeBgClass(tier)
                    )}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>

              {/* Pied : décomposition contenants (pal/cart) + lignes + flag anomalie */}
              <div className="flex items-center gap-4 border-t border-rule-soft pt-2.5">
                <Stat label="Palettes" value={String(c.contenants.pal)} />
                <Stat label="Cartons" value={String(c.contenants.cart)} />
                <Stat label="Volantes" value={String(c.contenants.unites)} />
                <Stat label="Lignes" value={String(c.nbLignes)} />
                {c.anomalie && (
                  <span className="ml-auto flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-destructive">
                    <TriangleAlert size={13} strokeWidth={1.75} />
                    Suspecte
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-px">
      <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">{value}</span>
      <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
    </span>
  )
}

export default ManifesteView
