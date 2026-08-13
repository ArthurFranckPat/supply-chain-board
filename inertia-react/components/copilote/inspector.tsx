import { useEffect, useRef, useState } from 'react'
import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { Boxes } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { toolLabel } from '@r/lib/copilote/tool-labels'
import { readToolOutput } from '@r/lib/copilote/tool-output'
import { Badge } from '@r/components/ui/badge'
import { toolStatus, type AnyToolPart, type ToolStatus } from '@r/components/copilote/tool-tokens'
import { ToolResultView } from '@r/components/copilote/tool-result-view'

export interface ToolCallEntry {
  toolName: string
  status: ToolStatus
  input: unknown
  output: unknown
  errorText?: string
}

/** Champs d'entrée tool qui identifient « de quoi on parle » — sert à
 * peupler l'en-tête contextuel (badge « auto · déduit »). */
const SUBJECT_FIELDS = [
  'article',
  'articles',
  'numOf',
  'numCommande',
  'composant',
  'poste',
] as const

/** Déduit les appels tools à afficher (dernier appel par nom, plus récent
 * en tête) et le « sujet » courant depuis l'historique de la conversation. */
export function deriveInspectorContext(messages: UIMessage[]): {
  entries: ToolCallEntry[]
  subject: { field: string; code: string } | null
} {
  const byName = new Map<string, ToolCallEntry>()
  const order: string[] = []
  let subject: { field: string; code: string } | null = null

  for (const m of messages) {
    for (const part of m.parts) {
      if (!isToolUIPart(part)) continue
      const p = part as AnyToolPart
      const name = getToolName(p)
      const status = toolStatus(p)
      // Ré-insère en fin d'ordre à chaque occurrence : un tool rappelé plus
      // tard remonte en tête (entries est affiché latest-first), sinon le
      // panneau reste figé sur le premier appel et ignore les suivants.
      const existingIdx = order.indexOf(name)
      if (existingIdx !== -1) order.splice(existingIdx, 1)
      order.push(name)
      byName.set(name, {
        toolName: name,
        status,
        input: p.input,
        // L'inspecteur montre la donnée, pas le transport : l'enveloppe d'app
        // (issue #89) est défaite ici, l'app elle-même est rendue dans le fil.
        output: status === 'done' ? readToolOutput(p.output).payload : undefined,
        errorText: status === 'error' ? p.errorText : undefined,
      })

      // Dès que l'input est connu (pas besoin d'attendre la fin de l'appel)
      // pour que le contexte se peuple sans latence perçue.
      if (p.input && typeof p.input === 'object') {
        for (const field of SUBJECT_FIELDS) {
          const value = (p.input as Record<string, unknown>)[field]
          if (typeof value === 'string' && value) {
            subject = { field, code: value }
          } else if (Array.isArray(value) && typeof value[0] === 'string') {
            subject = { field, code: value[0] }
          }
        }
      }
    }
  }

  const entries = order
    .map((name) => byName.get(name))
    .filter((e): e is ToolCallEntry => e !== undefined)
    .reverse()

  return { entries, subject }
}

export function InspectorPanel(props: {
  entries: ToolCallEntry[]
  subject: { field: string; code: string } | null
  flash: { tool: string; nonce: number } | null
}) {
  const [flashingTool, setFlashingTool] = useState<string | null>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!props.flash) return
    setFlashingTool(props.flash.tool)
    cardRefs.current.get(props.flash.tool)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const timer = setTimeout(() => setFlashingTool(null), 1100)
    return () => clearTimeout(timer)
  }, [props.flash])

  return (
    <div className="flex h-full flex-col">
      {props.subject && (
        <div className="flex items-start gap-2.5 border-b border-border px-4 py-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
            <Boxes size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[15px] font-medium tabular-nums tracking-tight">
              {props.subject.code}
            </div>
            <div className="text-[11px] text-muted-foreground">{props.subject.field}</div>
          </div>
          <Badge
            variant="secondary"
            className="mt-0.5 shrink-0"
            title="Déduit automatiquement de la conversation"
          >
            auto
          </Badge>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {props.entries.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            Le contexte supply cité par le copilote apparaît ici.
          </p>
        ) : (
          props.entries.map((entry, idx) => (
            <div
              key={entry.toolName}
              ref={(el) => {
                if (el) cardRefs.current.set(entry.toolName, el)
                else cardRefs.current.delete(entry.toolName)
              }}
              className={cn(
                'rounded-lg border-t border-border py-3.5 transition-shadow duration-150 first:border-none',
                idx === 0 && 'bg-muted',
                flashingTool === entry.toolName && 'shadow-[0_0_0_4px_var(--brand-soft)]'
              )}
            >
              <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                <span
                  className={cn(
                    'size-[7px] rounded-full',
                    entry.status === 'done' && 'bg-ferme',
                    entry.status === 'running' && 'bg-suggere animate-pulse',
                    entry.status === 'error' && 'bg-destructive'
                  )}
                />
                {toolLabel(entry.toolName)}
                <span className="font-mono font-normal text-muted-foreground/70">
                  {entry.toolName}
                </span>
              </div>
              {entry.status === 'error' ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11.5px] text-destructive">
                  {entry.errorText}
                </div>
              ) : (
                <ToolResultView payload={entry.output} fallbackInput={entry.input} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
