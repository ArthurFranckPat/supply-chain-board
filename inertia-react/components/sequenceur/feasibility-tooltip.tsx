import type { ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@r/components/ui/tooltip'
import type { FeasStatus } from '@r/lib/board/types'

/**
 * Tooltip du badge de faisabilité — dit CE QUI bloque, et de combien.
 *
 * Remplace l'attribut `title` natif, qui listait des codes article sans quantité, après
 * une seconde d'attente et sans mise en forme possible. Depuis que le board calcule une
 * file (mode projeté), l'écart compte autant que la liste : « il manque 3 » et « il
 * manque 1 400 » n'appellent pas la même décision.
 *
 * Le détail de l'OF, lui, répond toujours sur l'OF SEUL (photo) : un OF bloqué dans la
 * file peut donc s'y afficher complet. Le tooltip le dit, sinon la contradiction passe
 * pour une incohérence.
 *
 * Monté sur `components/ui/tooltip` (shadcn / Base UI), comme le reste de la page —
 * PAS sur `components/base/tooltip`, qui est BoardUI et porte ses propres tokens.
 */

/** Qté : entier si rond, sinon 2 décimales, virgule française. */
const fmtQty = (n: number): string =>
  Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',') : '—'

/** Au-delà, la liste déborde du tooltip : on tronque et on annonce le reste. */
const MAX_LINES = 8

function ComponentLines(props: { entries: [string, number][]; tone: 'manque' | 'cq' }) {
  const shown = props.entries.slice(0, MAX_LINES)
  const rest = props.entries.length - shown.length
  return (
    <>
      {shown.map(([ref, qty]) => (
        <div key={ref} className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
          <span className="text-foreground">{ref}</span>
          <span
            className={
              props.tone === 'manque'
                ? 'font-bold tabular-nums text-destructive'
                : 'font-bold tabular-nums text-suggere'
            }
          >
            {props.tone === 'manque' ? '−' : ''}
            {fmtQty(qty)}
          </span>
        </div>
      ))}
      {rest > 0 && (
        <div className="font-mono text-[10px] text-muted-foreground">+ {rest} autre(s)</div>
      )}
    </>
  )
}

interface FeasibilityTooltipProps {
  feas: FeasStatus | undefined
  /**
   * Le badge lui-même. Passé en `render` au déclencheur : Base UI fusionne ses handlers
   * dans cet élément au lieu d'injecter un bouton, donc le badge reste le badge.
   */
  children: ReactElement
}

export function FeasibilityTooltip(props: FeasibilityTooltipProps) {
  const feas = props.feas
  // Rien à expliquer sur un OF lançable ou non calculé : pas de déclencheur, pas de
  // focus supplémentaire dans la tabulation du board.
  if (!feas || feas.st === 'ok') return props.children

  const missing = Object.entries(feas.missingQty ?? {}).sort((a, b) => b[1] - a[1])
  const qc = Object.entries(feas.qcComponents ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipContent side="top" align="start">
        <div className="flex flex-col gap-1.5">
          {feas.st === 'blocked' && (
            <>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Manque pour lancer cet OF
              </div>
              {missing.length > 0 ? (
                <ComponentLines entries={missing} tone="manque" />
              ) : (
                // `missing` vide sur un OF bloqué = le manque est plus bas dans la BOM.
                <div className="text-[11px] text-muted-foreground">
                  Composant bloquant non direct — ouvrir le diagnostic de l’OF.
                </div>
              )}
              <div className="border-t border-border pt-1.5 text-[10px] leading-snug text-muted-foreground">
                Calcul <strong className="text-foreground">en file</strong> : les OF servis avant
                celui-ci ont déjà pris leur part du stock. Le détail de l’OF le juge{' '}
                <strong className="text-foreground">seul</strong> — il peut donc s’y afficher
                complet.
              </div>
            </>
          )}
          {feas.st === 'qc' && (
            <>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Dépend du stock sous contrôle qualité
              </div>
              {qc.length > 0 && <ComponentLines entries={qc} tone="cq" />}
              <div className="border-t border-border pt-1.5 text-[10px] leading-snug text-muted-foreground">
                Ces quantités sont comptées disponibles, mais restent en statut Q : relancer le
                contrôle réception pour sécuriser le lancement.
              </div>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
