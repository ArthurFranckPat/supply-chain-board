import { getToolName, type DynamicToolUIPart, type ToolUIPart } from 'ai'
import { ChevronRight, Wrench } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { toolLabel } from '@r/lib/copilote/tool-labels'

export type AnyToolPart = ToolUIPart | DynamicToolUIPart
export type ToolStatus = 'running' | 'done' | 'error'

export function toolStatus(part: AnyToolPart): ToolStatus {
  if (part.state === 'output-available') return 'done'
  if (part.state === 'output-error') return 'error'
  return 'running'
}

/** Tokens plats (glyphe + nom mono) — pas de pills bordées, hiérarchie
 * portée par le glyphe de statut plutôt que par la couleur seule. */
export function ToolTokens(props: { parts: AnyToolPart[] }) {
  if (props.parts.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Wrench size={13} className="text-muted-foreground" />
          Outils
        </span>
        {props.parts.map((part, idx) => {
          const status = toolStatus(part)
          const name = getToolName(part)
          return (
            <span
              key={`${name}-${idx}`}
              data-status={status}
              className={cn(
                'inline-flex items-center gap-1.5 font-mono text-[11.5px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                status === 'done' && 'text-ferme',
                status === 'running' && 'text-suggere',
                status === 'error' && 'text-destructive'
              )}
            >
              {status === 'running' ? (
                <span className="size-2 animate-pulse rounded-full bg-current" />
              ) : status === 'error' ? (
                <span aria-hidden="true">✗</span>
              ) : (
                <span aria-hidden="true">✓</span>
              )}
              <span className="tracking-tight text-foreground/80">{name}</span>
            </span>
          )
        })}
      </div>

      <details className="mt-0.5 group">
        <summary className="flex list-none items-center gap-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground marker:content-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight size={11} className="transition-transform group-open:rotate-90" />
          détail des appels
        </summary>
        <div className="mt-2 flex flex-col gap-2.5">
          {props.parts.map((part, idx) => {
            const status = toolStatus(part)
            const name = getToolName(part)
            return (
              <div key={`${name}-detail-${idx}`}>
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span
                    className={cn(
                      'size-[7px] rounded-full',
                      status === 'done' && 'bg-ferme',
                      status === 'error' && 'bg-destructive',
                      status === 'running' && 'bg-suggere'
                    )}
                  />
                  <span className="font-semibold text-foreground">{name}</span>
                  <span className="text-muted-foreground">— {toolLabel(name)}</span>
                </div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-secondary p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">args</span>{' '}
                  {JSON.stringify(part.input, null, 2)}
                  {status !== 'running' && (
                    <>
                      {'\n'}
                      <span className="font-semibold text-foreground">résultat</span>{' '}
                      {status === 'error'
                        ? part.errorText
                        : JSON.stringify(part.output, null, 2)}
                    </>
                  )}
                </pre>
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}
