import { useEffect, useRef, useState } from 'react'
import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { Boxes } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { toolLabel } from '@r/lib/copilote/tool-labels'
import { toolStatus, type AnyToolPart, type ToolStatus } from '@r/components/copilote/tool-tokens'

export interface ToolCallEntry {
  toolName: string
  status: ToolStatus
  input: unknown
  output: unknown
  errorText?: string
}

/** Champs d'entrée tool qui identifient « de quoi on parle » — sert à
 * peupler l'en-tête contextuel (badge « auto · déduit »). */
const SUBJECT_FIELDS = ['article', 'articles', 'numOf', 'numCommande', 'composant', 'poste'] as const

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
      if (!byName.has(name)) order.push(name)
      byName.set(name, {
        toolName: name,
        status,
        input: p.input,
        output: status === 'done' ? p.output : undefined,
        errorText: status === 'error' ? p.errorText : undefined,
      })

      if (status === 'done' && p.input && typeof p.input === 'object') {
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
        <div className="flex items-start gap-2.5 border-b border-border/60 px-4 py-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand/10 text-primary">
            <Boxes size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[15px] font-extrabold tracking-tight">
              {props.subject.code}
            </div>
            <div className="text-[11px] text-muted-foreground">{props.subject.field}</div>
          </div>
          <span
            className="mt-0.5 shrink-0 rounded-full bg-planifie/15 px-2 py-0.5 text-[10.5px] font-semibold text-planifie"
            title="Déduit automatiquement de la conversation"
          >
            auto
          </span>
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
                'rounded-xl border-t border-border/60 py-3.5 transition-shadow duration-150 first:border-none',
                idx === 0 && 'bg-planifie/[0.06]',
                flashingTool === entry.toolName && 'shadow-[0_0_0_4px_var(--brand-soft,rgba(255,56,92,0.22))]'
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
              <pre className="max-h-56 overflow-auto rounded-lg bg-secondary p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {entry.status === 'error'
                  ? entry.errorText
                  : JSON.stringify(entry.output ?? entry.input, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
