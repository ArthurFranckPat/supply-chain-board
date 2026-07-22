import { Search, SquarePen } from 'lucide-react'

import { cn } from '@r/lib/utils'

/**
 * Nav gauche (DNA ChatGPT/Claude). Le backend ne persiste pas d'historique
 * de conversations (session Pi = TTL 30 min, pas de liste) — la V1 du port
 * affiche donc la conversation courante comme unique entrée active plutôt
 * que d'inventer un historique. Le composant reste prêt à recevoir une
 * vraie liste le jour où la persistance existera côté serveur.
 */
export function CopiloteSidebar(props: {
  currentTitle: string | null
  busy: boolean
  onNewChat: () => void
  disabled: boolean
  username: string
  env: 'test' | 'prod'
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3.5 pb-2.5 pt-3.5">
        <button
          type="button"
          onClick={props.onNewChat}
          disabled={props.disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-foreground transition-[border-color,box-shadow] hover:border-foreground hover:shadow-sm disabled:pointer-events-none disabled:opacity-40"
        >
          <SquarePen size={15} className="text-primary" />
          Nouvelle conversation
        </button>
      </div>

      <div className="px-3.5 pb-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher…"
            disabled
            className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-[12.5px] text-foreground placeholder:text-muted-foreground disabled:cursor-default disabled:opacity-70"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3.5">
        {props.currentTitle && (
          <div className="mt-2">
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-muted-foreground">
              Aujourd'hui
            </div>
            <div className="relative flex w-full items-center gap-2 rounded-lg bg-card px-2.5 py-2">
              <span className="before:absolute before:left-0 before:top-[7px] before:bottom-[7px] before:w-[3px] before:rounded-full before:bg-primary" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                {props.currentTitle}
              </span>
              {props.busy && (
                <span
                  className="size-[7px] shrink-0 animate-pulse rounded-full bg-suggere"
                  title="en cours"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-border/60 px-3.5 py-2.5">
        <span
          className={cn(
            'flex size-[30px] shrink-0 items-center justify-center rounded-full font-mono text-[11.5px] font-bold uppercase text-white',
            props.env === 'test' ? 'bg-suggere' : 'bg-foreground'
          )}
        >
          {props.username.slice(0, 2)}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[12.5px] font-semibold text-foreground">
            {props.username}
          </div>
          <div className="text-[10.5px] font-medium text-muted-foreground">
            Sage X3 · {props.env}
          </div>
        </div>
      </div>
    </div>
  )
}
