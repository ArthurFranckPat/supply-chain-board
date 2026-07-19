/**
 * Onglet « Diagnostic récursif » du détail OF — port React de
 * inertia/components/of/of-diagnostic-tree.tsx (issue #52). Arbre tabulaire
 * aligné, récursif : un composant en rupture peut être couvert par un
 * sous-ensemble (OF) dont on affiche à son tour les composants.
 *
 * Layout tabulaire aligné — colonnes :
 * [statut 6.5rem] [article 6rem] [description 1fr] [besoin 3rem]
 * [dispo 3rem] [manque 4rem] [réception 6.5rem]
 */
import { Badge } from '@r/components/ui/badge'
import { cn } from '@r/lib/utils'
import {
  type DiagResult,
  type DiagShort,
  STATUT_OF,
  STATUS_VARIANT,
  TREE_STATUS_LABEL,
  fmtDateFr,
} from '@/lib/of/diagnostic-types'

/** En-tête de colonnes du tableau diagnostic. */
function DiagColHeader() {
  return (
    <div className="flex items-center gap-3 border-b bg-secondary px-3 py-1 font-mono text-[8px] font-bold tracking-wider text-muted-foreground">
      <span className="w-[6.5rem] flex-none">Statut</span>
      <span className="w-[6rem] flex-none">Article</span>
      <span className="min-w-0 flex-1">Désignation</span>
      <span className="w-9 flex-none text-right">Besoin</span>
      <span className="w-9 flex-none text-right">Dispo</span>
      <span className="w-10 flex-none text-right">Manque</span>
      <span className="w-[13rem] flex-none">Réception prévue</span>
    </div>
  )
}

/** Une ligne composant (achetée ou sous-ensemble) dans le tableau. */
function DiagRow({ short }: { short: DiagShort }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2',
        short.status === 'rupture_matiere' && 'bg-destructive/10',
        short.status === 'qc_a_controler' && 'bg-warning/10'
      )}
    >
      <div className="w-[6.5rem] flex-none">
        <Badge variant={STATUS_VARIANT[short.status]} className="whitespace-nowrap text-[8px]">
          {TREE_STATUS_LABEL[short.status]}
        </Badge>
      </div>
      <span
        className={cn(
          'w-[6rem] flex-none truncate font-mono text-[11px] font-bold',
          short.status === 'rupture_matiere' ? 'text-destructive' : 'text-foreground'
        )}
      >
        {short.article}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {short.description}
      </span>
      <span className="w-9 flex-none text-right font-mono text-[11px] text-muted-foreground">
        {short.quantityNeeded}
      </span>
      <span className="w-9 flex-none text-right font-mono text-[11px] text-muted-foreground">
        {short.stockQc ? (
          <span className="font-semibold text-warning" title={`dont ${short.stockQc} en CQ`}>
            {short.available ?? 0}+{short.stockQc}
          </span>
        ) : (
          <>{short.available ?? '?'}</>
        )}
      </span>
      <span className="w-10 flex-none text-right font-mono text-[11px] font-bold text-destructive">
        −{short.quantityMissing}
      </span>
      <div className="w-[13rem] flex-none font-mono text-[10px]">
        {short.earliestReception && (
          <div className="flex flex-col gap-0.5">
            {short.receptionSupplier && (
              <span className="truncate font-semibold text-foreground">
                {short.receptionSupplier}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {short.receptionOrderId && (
                <>
                  <span className="font-mono text-[9px]">{short.receptionOrderId}</span>
                  <span className="text-border">·</span>
                </>
              )}
              <span className="text-brand">réc. {fmtDateFr(short.earliestReception)}</span>
            </div>
          </div>
        )}
        {short.status === 'qc_a_controler' && !short.earliestReception && (
          <span className="text-warning">lever CQ</span>
        )}
      </div>
    </div>
  )
}

/**
 * Bloc "couvert par" — en-tête OF couvrant + ses composants récursifs.
 * Indenté sous la colonne description (après statut + article = ~12.5rem).
 */
function DiagShortRow({ short }: { short: DiagShort }) {
  return (
    <div className="border-b border-rule-soft last:border-b-0">
      <DiagRow short={short} />

      {short.covering.length > 0 && (
        <div className="mb-1 ml-[12.5rem] border-l-2 border-border/40">
          {short.covering.map((cov) => (
            <div key={cov.numOf} className="pl-3 pt-0.5">
              {/* En-tête OF couvrant */}
              <div className="flex flex-wrap items-center gap-1.5 py-1 font-mono text-[9px] text-muted-foreground">
                <span className="material-symbols-outlined text-[11px]">
                  subdirectory_arrow_right
                </span>
                <span className="font-semibold tracking-wider">COUVERT PAR</span>
                <span className="text-[11px] font-bold text-foreground">{cov.numOf}</span>
                <Badge
                  variant={cov.statut === 1 ? 'success' : cov.statut === 3 ? 'warning' : 'secondary'}
                  className="text-[8px]"
                >
                  {STATUT_OF[cov.statut] ?? `statut ${cov.statut}`}
                </Badge>
                <Badge
                  variant={cov.node.source === 'MFGMAT' ? 'success' : 'secondary'}
                  className="text-[8px]"
                >
                  {cov.node.source === 'MFGMAT' ? 'réel' : 'théorique'}
                </Badge>
                <span>qté {cov.quantity}</span>
                <Badge variant={STATUS_VARIANT[cov.node.status]} className="text-[8px]">
                  {TREE_STATUS_LABEL[cov.node.status]}
                </Badge>
              </div>
              {/* Composants du sous-ensemble */}
              {cov.node.shorts.length > 0 ? (
                <div className="mb-1 overflow-hidden rounded border border-border/60">
                  {cov.node.shorts.map((s, i) => (
                    <DiagShortRow key={`${s.article}-${i}`} short={s} />
                  ))}
                </div>
              ) : (
                <div className="pb-1 font-mono text-[10px] text-ferme">
                  ✓ tous composants disponibles
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Diagnostic récursif complet : bandeau résumé (cause racine + faisabilité) + arbre. */
export function OfDiagnosticTree({ result }: { result: DiagResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-secondary px-3 py-2">
        <Badge variant={STATUS_VARIANT[result.rootCause]}>
          {TREE_STATUS_LABEL[result.rootCause]}
        </Badge>
        <Badge
          variant={
            result.feasible
              ? 'success'
              : result.rootCause === 'qc_a_controler'
                ? 'warning'
                : 'destructive'
          }
        >
          {result.feasible
            ? 'Faisable'
            : result.rootCause === 'qc_a_controler'
              ? 'Faisable sous réserve CQ'
              : 'Bloqué'}
        </Badge>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {result.componentsChecked} composant(s) · profondeur {result.maxDepthReached}
        </span>
      </div>
      {result.tree.shorts.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          <DiagColHeader />
          {result.tree.shorts.map((s, i) => (
            <DiagShortRow key={`${s.article}-${i}`} short={s} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md bg-ferme/10 px-3 py-2 text-[12px] font-medium text-ferme">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          Tous les composants sont disponibles
        </div>
      )}
    </div>
  )
}

export default OfDiagnosticTree
