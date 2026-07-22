import { Fragment, type ReactNode } from 'react'

import { cn } from '@r/lib/utils'
import { toolLabel } from '@r/lib/copilote/tool-labels'

/**
 * Citation tool obligatoire côté prompt système : `[toolName: résumé]`
 * (app/services/agent/system_prompt.ts). Le chip masque le résumé (visible
 * via title=) pour rester compact — c'est le clic qui compte, pas le texte.
 */
const SOURCE_TAG_RE = /\[([a-zA-Z][a-zA-Z0-9_]*):\s*([^\]]+)\]/g

export function SourceTag(props: { tool: string; detail?: string; onFlash: (tool: string) => void }) {
  return (
    <button
      type="button"
      title={props.detail ? `[${props.tool}: ${props.detail}]` : undefined}
      onClick={() => props.onFlash(props.tool)}
      className={cn(
        'mx-px inline-flex items-center rounded-[5px] border-b-[1.5px] border-transparent bg-brand/10 px-1.5 py-px font-mono text-[10.5px] font-semibold text-primary transition-colors',
        'hover:border-primary hover:bg-primary/[0.18]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'
      )}
    >
      [{toolLabel(props.tool)}]
    </button>
  )
}

/** Découpe un texte assistant en fragments + chips `[tool: …]` cliquables. */
export function renderMessageText(text: string, onFlash: (tool: string) => void): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  SOURCE_TAG_RE.lastIndex = 0
  let key = 0
  while ((match = SOURCE_TAG_RE.exec(text))) {
    if (match.index > last) parts.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>)
    parts.push(<SourceTag key={key++} tool={match[1]} detail={match[2]} onFlash={onFlash} />)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return parts
}
