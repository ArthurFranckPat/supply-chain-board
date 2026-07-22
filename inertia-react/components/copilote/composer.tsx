import { useEffect, useRef } from 'react'
import { ArrowUp, Lock, Square } from 'lucide-react'

import { cn } from '@r/lib/utils'

export interface PromptChip {
  label: string
  prompt: string
}

const PROMPT_CHIPS: PromptChip[] = [
  { label: 'Date engageante', prompt: 'Date engageante pour 200 PP_830_ESH ?' },
  { label: 'Retards clients', prompt: 'Retards clients prévus sur 14 jours' },
  { label: 'OF bloqué', prompt: "Pourquoi l'OF … est bloqué ?" },
]

/** Composer inspiration ChatGPT/Claude : conteneur arrondi, auto-grow,
 * chips de prompts, verrou lecture-seule, envoi circulaire. */
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
    <div className="flex justify-center border-t border-border/60 bg-background px-6 py-3.5">
      <div className="w-full max-w-[720px]">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => applyChip(chip.prompt)}
              disabled={props.busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="rounded-3xl border border-border bg-background shadow-sm transition-[border-color,box-shadow] focus-within:border-foreground focus-within:shadow-[0_0_0_3px_rgba(34,34,34,0.06)]">
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
            <span
              title="Le copilote ne modifie aucune donnée"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground"
            >
              <Lock size={13} />
              Lecture seule
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
              <kbd className="rounded border border-border bg-secondary px-1.5 py-px font-mono text-[10px]">↵</kbd>
            </span>
            {props.busy ? (
              <button
                type="button"
                onClick={props.onStop}
                aria-label="Arrêter"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive text-white transition-transform active:scale-95"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={props.onSend}
                disabled={!canSend}
                aria-label="Envoyer"
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-[background,transform]',
                  'hover:bg-[var(--color-rausch-active,#e00b41)] active:scale-90',
                  'disabled:pointer-events-none disabled:bg-border disabled:text-white'
                )}
              >
                <ArrowUp size={17} strokeWidth={2.4} />
              </button>
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
