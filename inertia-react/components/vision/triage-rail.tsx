import { useMemo, useState } from 'react'
import { cn } from '@r/lib/utils'
import type { VisionCommande, VisionLink } from '@/lib/vision/types'
import type { ImpactVerdict } from '@/lib/vision/impact'
import { deltaLabel } from '@/lib/vision/impact'
import type { HealthCategory } from './plan-health'
import { ListPlus, X, CircleCheckBig } from 'lucide-react'

/**
 * Programme v2 — rail de triage « À traiter ». Panneau latéral repliable qui
 * liste les problèmes (retards / limites / sans-lien) triés par gravité ×
 * proximité du besoin. Cliquer un item centre le board sur l'OF, allume le
 * lien, ouvre les actions.
 *
 * Le rail transforme la page : on ne scanne plus ~40 cartes, on traite une
 * file. Les problèmes viennent au planificateur.
 */

export interface TriageItem {
  commandeId: string
  numCommande: string
  ligne: string | null
  client: string | null
  verdict: ImpactVerdict | null
  delta: number | null
  besoinIso: string | null
  ofId: string | null
  ofDateFinIso: string | null
}

type Tab = Exclude<HealthCategory, 'ruptures'>

const TAB_LABELS: Record<Tab, string> = {
  retards: 'Retards',
  limites: 'Limites',
  sanslien: 'Sans lien',
}

const SEVERITY: Record<string, number> = { retard: 2, limite: 1 }

const VERDICT_DOT: Record<ImpactVerdict, string> = {
  retard: 'bg-error',
  limite: 'bg-amber-500',
  ok: 'bg-ferme',
}
const VERDICT_DELTA_TONE: Record<ImpactVerdict, string> = {
  retard: 'bg-error/10 text-error',
  limite: 'bg-amber-500/10 text-amber-600',
  ok: 'bg-ferme/10 text-ferme',
}

export function TriageRail(props: {
  commandes: VisionCommande[]
  links: VisionLink[]
  verdictByCmd: Map<string, { verdict: ImpactVerdict | null; delta: number | null }>
  counts: Record<Tab, number>
  onSelect: (item: TriageItem) => void
  onDetailOf: (ofId: string) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<Tab>('retards')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const items = useMemo<TriageItem[]>(() => {
    const verdicts = props.verdictByCmd
    const linksByCmd = new Map<string, VisionLink>()
    for (const l of props.links) {
      if (!linksByCmd.has(l.commandeId)) linksByCmd.set(l.commandeId, l)
    }
    const out: TriageItem[] = []
    for (const cmd of props.commandes) {
      const v = verdicts.get(cmd.id)
      const verdict = v?.verdict ?? null
      const delta = v?.delta ?? null
      // Filtrage par onglet
      if (activeTab === 'retards' && verdict !== 'retard') continue
      if (activeTab === 'limites' && verdict !== 'limite') continue
      if (activeTab === 'sanslien' && verdict !== null) continue
      const link = linksByCmd.get(cmd.id)
      out.push({
        commandeId: cmd.id,
        numCommande: cmd.numCommande,
        ligne: cmd.ligne,
        client: cmd.client,
        verdict,
        delta,
        besoinIso: cmd.dateExpeditionIso,
        ofId: link?.ofId ?? null,
        ofDateFinIso: link?.ofDateFinIso ?? null,
      })
    }
    // Tri : gravité desc, puis delta asc (le plus proche du besoin d'abord)
    out.sort((a, b) => {
      const sa = SEVERITY[a.verdict ?? ''] ?? 0
      const sb = SEVERITY[b.verdict ?? ''] ?? 0
      if (sb !== sa) return sb - sa
      return (a.delta ?? Infinity) - (b.delta ?? Infinity)
    })
    return out
  }, [props.commandes, props.links, props.verdictByCmd, activeTab])

  const tabs: Tab[] = ['retards', 'limites', 'sanslien']

  return (
    <div className="flex h-full w-[300px] flex-none flex-col border-l border-rule bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-rule px-3.5 py-2.5">
        <ListPlus size={14} strokeWidth={1.75} className="text-muted-foreground" />
        <b className="text-xs">À traiter</b>
        <span className="font-mono text-2xs text-muted-foreground">{items.length}</span>
        <div className="flex-1" />
        <span className="font-mono text-2xs text-muted-foreground">Gravité ▾</span>
        <button
          type="button"
          aria-label="Fermer le rail de triage"
          onClick={props.onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-rule-soft px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={cn(
              'rounded-full border px-2.5 py-1 font-mono text-2xs font-bold transition-colors',
              activeTab === t
                ? t === 'retards'
                  ? 'border-error bg-error/10 text-error'
                  : t === 'limites'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-muted-foreground text-muted-foreground'
                : 'border-rule text-muted-foreground hover:text-foreground'
            )}
          >
            {TAB_LABELS[t]} {props.counts[t]}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CircleCheckBig size={24} strokeWidth={1.75} className="text-ferme/60" />
            <span className="font-fraunces text-sm font-bold">Rien à traiter</span>
            <span className="font-fraunces text-2xs italic text-muted-foreground">
              Aucun élément dans cette catégorie.
            </span>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.commandeId}
              type="button"
              onClick={() => {
                setSelectedId(item.commandeId)
                props.onSelect(item)
              }}
              className={cn(
                'block w-full border-b border-rule-soft px-3.5 py-2.5 text-left transition-colors hover:bg-accent',
                selectedId === item.commandeId &&
                  'bg-brand-soft/50 shadow-[inset_3px_0_0_var(--color-brand)]'
              )}
            >
              {/* Ligne 1 : dot + id + delta */}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'size-2 flex-none rounded-full',
                    item.verdict ? VERDICT_DOT[item.verdict] : 'bg-muted-foreground'
                  )}
                />
                <span className="font-mono text-xs font-bold text-foreground">
                  {item.numCommande}
                  {item.ligne && (
                    <span className="text-muted-foreground">·L{item.ligne}</span>
                  )}
                </span>
                <div className="flex-1" />
                {item.verdict && item.delta !== null && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px font-mono text-2xs font-bold tabular-nums',
                      VERDICT_DELTA_TONE[item.verdict]
                    )}
                  >
                    {deltaLabel(item.delta)}
                  </span>
                )}
                {item.verdict === null && (
                  <span className="font-mono text-2xs text-muted-foreground">non évaluée</span>
                )}
              </div>
              {/* Ligne 2 : client + dates */}
              <div className="mt-1 text-2xs text-muted-foreground">
                {item.client && `${item.client} · `}
                {item.besoinIso && `besoin ${fmtDayShort(item.besoinIso)}`}
                {item.ofId && item.ofDateFinIso && (
                  <> · {item.ofId} finit {fmtDayShort(item.ofDateFinIso)}</>
                )}
              </div>
              {/* Ligne 3 : actions */}
              <div className="mt-1.5 flex gap-1.5">
                <span className="text-2xs font-semibold text-brand">Voir sur le board</span>
                {item.ofId && (
                  <>
                    <span className="text-2xs text-muted-foreground">·</span>
                    <span className="text-2xs font-semibold text-muted-foreground">Détail OF</span>
                  </>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-rule-soft px-3.5 py-2 font-fraunces text-2xs italic text-muted-foreground">
        Trié gravité × proximité du besoin.
      </div>
    </div>
  )
}

/** Date ISO → « 8 juil. » (français court). */
function fmtDayShort(iso: string): string {
  const d = parseIsoSafe(iso)
  if (!d) return '?'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
function parseIsoSafe(iso: string): Date | null {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}
