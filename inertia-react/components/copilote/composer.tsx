import { useEffect, useRef } from 'react'
import { ArrowUp, Lock, Square } from 'lucide-react'

import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { Pill } from '@r/components/ui/pill'

export interface PromptChip {
  label: string
  prompt: string
}

const PROMPT_CHIPS: PromptChip[] = [
  { label: 'Date engageante', prompt: 'Date engageante pour 200 PP_830_ESH ?' },
  { label: 'Retards clients', prompt: 'Retards clients prévus sur 14 jours' },
  { label: 'OF bloqué', prompt: "Pourquoi l'OF … est bloqué ?" },
]

/** Composer : conteneur élevé, auto-grow, chips de prompts, verrou
 * lecture-seule, envoi via Button du DS. */
export function Composer(props: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [props.value])

  const canSend = props.value.trim().length > 0 && !props.busy

  function applyChip(prompt: string) {
    props.onChange(prompt)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex justify-center border-t border-border bg-[var(--sidebar-canvas)] px-6 py-3.5">
      <div className="w-full max-w-[720px]">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {PROMPT_CHIPS.map((chip) => (
            <Pill
              key={chip.label}
              size="sm"
              onClick={() => applyChip(chip.prompt)}
              disabled={props.busy}
            >
              {chip.label}
            </Pill>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
          <div className="px-4 pb-0.5 pt-3.5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={props.value}
              onChange={(e) => props.onChange(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (canSend) props.onSend()
                }
              }}
              disabled={props.busy}
              placeholder="Poser une question supply…"
              className="block max-h-[200px] min-h-6 w-full resize-none overflow-hidden border-none bg-transparent text-[15px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-2 px-3 pb-2 pt-1.5">
            <Badge variant="outline" title="Le copilote ne modifie aucune donnée">
              <Lock size={13} />
              Lecture seule
            </Badge>
            <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
              <kbd className="rounded-md border border-border bg-secondary px-1.5 py-px font-mono text-[10px] tabular-nums">
                ↵
              </kbd>
            </span>
            {props.busy ? (
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                onClick={props.onStop}
                aria-label="Arrêter"
              >
                <Square size={13} fill="currentColor" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon-xs"
                onClick={props.onSend}
                disabled={!canSend}
                aria-label="Envoyer"
              >
                <ArrowUp size={17} strokeWidth={2.4} />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-2 px-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Le copilote peut se tromper — chaque chiffre porte sa source{' '}
          <code className="rounded bg-secondary px-1 py-px font-mono text-[10.5px]">[tool: …]</code>{' '}
          pour vérification. <kbd className="font-mono">⇧↵</kbd> pour un saut de ligne.
        </p>
      </div>
    </div>
  )
}
