/**
 * Vue Couverture du détail OF. Arbre tabulaire, récursif : un composant
 * en rupture peut être couvert par un sous-ensemble (OF) dont on affiche
 * à son tour les composants.
 *
 * Colonnes : statut · article · désignation · besoin · dispo · manque · réception.
 */
import { Badge } from '@r/components/ui/badge'
import { CornerDownRight, CircleCheck } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { X3Link } from '@r/components/x3-link'
import {
  type DiagResult,
  type DiagShort,
  type NodeStatus,
  STATUT_OF,
  STATUS_VARIANT,
  TREE_STATUS_LABEL,
  fmtDateFr,
} from '@r/lib/of/diagnostic-types'

/** Rupture = danger ; CQ / sous-ensemble = warn. `--planifie` = `--ferme` ici : pas d'info teal. */
function shortChroma(status: NodeStatus) {
  if (status === 'rupture_matiere') {
    return {
      text: 'text-destructive',
      hover: 'hover:text-destructive',
      bar: '[box-shadow:inset_3px_0_var(--destructive)]',
    }
  }
  if (status === 'qc_a_controler' || status === 'sous_ensemble_a_lancer') {
    return {
      text: 'text-suggere',
      hover: 'hover:text-suggere',
      bar: '[box-shadow:inset_3px_0_var(--suggere)]',
    }
  }
  return { text: 'text-foreground', hover: '', bar: '' }
}

function DiagColHeader() {
  return (
    <div className="flex items-center gap-3 border-b border-rule-soft bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
      <span className="w-[6.5rem] flex-none">Statut</span>
      <span className="w-[6rem] flex-none">Article</span>
      <span className="min-w-0 flex-1">Désignation</span>
      <span className="w-10 flex-none text-right">Besoin</span>
      <span className="w-10 flex-none text-right">Dispo</span>
      <span className="w-12 flex-none text-right">Manque</span>
      <span className="w-[11rem] flex-none">Réception prévue</span>
    </div>
  )
}

function DiagRow({ short }: { short: DiagShort }) {
  const chroma = shortChroma(short.status)
  return (
    <div className={cn('flex items-center gap-3 px-3 py-2 text-xs', chroma.bar)}>
      <div className="w-[6.5rem] flex-none">
        <Badge variant={STATUS_VARIANT[short.status]} className="whitespace-nowrap">
          {TREE_STATUS_LABEL[short.status]}
        </Badge>
      </div>
      <X3Link
        fonction="GESITM"
        cle={short.article}
        title={`Ouvrir l'article ${short.article} dans Sage X3`}
        className={cn(
          'w-[6rem] flex-none truncate font-mono font-medium',
          chroma.text,
          chroma.hover
        )}
      >
        {short.article}
      </X3Link>
      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={short.description}>
        {short.description}
      </span>
      <span className="w-10 flex-none text-right font-mono tabular-nums text-foreground">
        {short.quantityNeeded}
      </span>
      <span
        className={cn(
          'w-10 flex-none text-right font-mono tabular-nums',
          short.stockQc || short.status === 'qc_a_controler' ? 'text-suggere' : chroma.text
        )}
        title={short.stockQc ? `dont ${short.stockQc} en CQ` : undefined}
      >
        {short.stockQc ? (
          <>
            {short.available}+{short.stockQc}
          </>
        ) : (
          <>{short.available}</>
        )}
      </span>
      <span className={cn('w-12 flex-none text-right font-mono tabular-nums', chroma.text)}>
        −{short.quantityMissing}
      </span>
      <div className="w-[11rem] flex-none">
        {short.earliestReception && (
          <div className="flex min-w-0 flex-col gap-px">
            {short.receptionSupplier && (
              <span className="truncate text-foreground" title={short.receptionSupplier}>
                {short.receptionSupplier}
              </span>
            )}
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              {short.receptionOrderId && (
                <>
                  <span className="truncate font-mono">{short.receptionOrderId}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="font-medium text-suggere">
                réc. {fmtDateFr(short.earliestReception)}
              </span>
            </div>
          </div>
        )}
        {short.status === 'qc_a_controler' && !short.earliestReception && (
          <span className="text-suggere">lever CQ</span>
        )}
      </div>
    </div>
  )
}

function DiagShortRow({ short }: { short: DiagShort }) {
  return (
    <div className="border-b border-rule-soft last:border-b-0">
      <DiagRow short={short} />

      {short.covering.length > 0 && (
        <div className="mb-1 ml-[12.5rem] border-l border-rule-soft">
          {short.covering.map((cov) => (
            <div key={cov.numOf} className="pl-3 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5 py-1 text-xs text-muted-foreground">
                <CornerDownRight size={14} strokeWidth={1.75} />
                <span>Couvert par</span>
                <X3Link
                  fonction="GESMFG"
                  cle={cov.numOf}
                  title={`Ouvrir l'OF ${cov.numOf} dans Sage X3`}
                  className="font-mono font-medium text-foreground"
                >
                  {cov.numOf}
                </X3Link>
                <Badge
                  variant={
                    cov.statut === 1 ? 'success' : cov.statut === 3 ? 'warning' : 'secondary'
                  }
                >
                  {STATUT_OF[cov.statut] ?? `statut ${cov.statut}`}
                </Badge>
                <Badge variant={cov.node.source === 'MFGMAT' ? 'success' : 'secondary'}>
                  {cov.node.source === 'MFGMAT' ? 'réel' : 'théorique'}
                </Badge>
                <span>qté {cov.quantity}</span>
                <Badge variant={STATUS_VARIANT[cov.node.status]}>
                  {TREE_STATUS_LABEL[cov.node.status]}
                </Badge>
              </div>
              {cov.node.shorts.length > 0 ? (
                <div className="mb-1 overflow-hidden rounded-md border border-rule-soft">
                  {cov.node.shorts.map((s, i) => (
                    <DiagShortRow key={`${s.article}-${i}`} short={s} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1 pb-1 text-xs text-ferme">
                  <CircleCheck size={14} strokeWidth={1.75} />
                  Tous les composants sont disponibles
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OfDiagnosticTree({ result }: { result: DiagResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-rule-soft px-3 py-2">
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
        <span className="ml-auto text-xs text-muted-foreground">
          {result.componentsChecked} composant{result.componentsChecked > 1 ? 's' : ''}
        </span>
      </div>
      {result.tree.shorts.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-rule-soft">
          <div className="min-w-[40rem]">
            <DiagColHeader />
            {result.tree.shorts.map((s, i) => (
              <DiagShortRow key={`${s.article}-${i}`} short={s} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-ferme">
          <CircleCheck size={14} strokeWidth={1.75} />
          Tous les composants sont disponibles
        </div>
      )}
    </div>
  )
}

export default OfDiagnosticTree
