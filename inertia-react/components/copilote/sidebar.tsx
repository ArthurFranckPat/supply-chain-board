import { useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { MessageSquare, Search, SquarePen, Trash2 } from 'lucide-react'

import { cx } from '@r/lib/cx'

/** En-tête d'une conversation persistée (liste de la sidebar). */
export interface ConversationSummary {
  conversationId: string
  title: string | null
  updatedAt: string
}

type DateGroup = 'today' | 'yesterday' | 'older'

const GROUP_LABELS: Record<DateGroup, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  older: 'Plus ancien',
}

const GROUP_ORDER: DateGroup[] = ['today', 'yesterday', 'older']

function groupOf(iso: string): DateGroup {
  const dt = DateTime.fromISO(iso)
  const now = DateTime.now()
  if (dt.hasSame(now, 'day')) return 'today'
  if (dt.hasSame(now.minus({ days: 1 }), 'day')) return 'yesterday'
  return 'older'
}

/**
 * Nav gauche (DNA ChatGPT/Claude) — historique persisté des conversations.
 * Liste groupée par date (Aujourd'hui / Hier / Plus ancien), recherche par
 * titre, suppression au survol. Le rechargement d'une conversation passe par
 * `onSelect` (la page relit les messages côté serveur).
 */
export function CopiloteSidebar(props: {
  conversations: ConversationSummary[]
  currentId: string | null
  busy: boolean
  onNewChat: () => void
  onSelect: (conversationId: string) => void
  onDelete: (conversationId: string) => void
  username: string
  env: 'test' | 'prod'
}) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? props.conversations.filter((c) => (c.title ?? '').toLowerCase().includes(q))
      : props.conversations

    const byGroup: Record<DateGroup, ConversationSummary[]> = {
      today: [],
      yesterday: [],
      older: [],
    }
    for (const conv of filtered) byGroup[groupOf(conv.updatedAt)].push(conv)
    return byGroup
  }, [props.conversations, query])

  const hasAny = props.conversations.length > 0
  const hasResults = GROUP_ORDER.some((g) => groups[g].length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="px-3.5 pb-2.5 pt-3.5">
        <button
          type="button"
          onClick={props.onNewChat}
          disabled={props.busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-foreground transition-[border-color,box-shadow] hover:border-foreground hover:shadow-sm disabled:pointer-events-none disabled:opacity-40"
        >
          <SquarePen size={15} className="text-primary" />
          Nouvelle conversation
        </button>
      </div>

      <div className="px-3.5 pb-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            disabled={!hasAny}
            className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-[12.5px] text-foreground placeholder:text-muted-foreground disabled:cursor-default disabled:opacity-70"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3.5">
        {!hasAny && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-[12px] text-muted-foreground">
            <MessageSquare size={18} className="opacity-60" />
            Aucune conversation pour l'instant.
          </div>
        )}

        {hasAny && !hasResults && (
          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            Aucun résultat pour « {query.trim()} ».
          </div>
        )}

        {GROUP_ORDER.map((group) => {
          const items = groups[group]
          if (items.length === 0) return null
          return (
            <div key={group} className="mt-2 first:mt-0">
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-muted-foreground">
                {GROUP_LABELS[group]}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((conv) => {
                  const active = conv.conversationId === props.currentId
                  return (
                    <div
                      key={conv.conversationId}
                      className={cx(
                        'group/item relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 transition-colors',
                        active ? 'bg-card' : 'hover:bg-card/60'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => props.onSelect(conv.conversationId)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {active && (
                          <span className="before:absolute before:left-0 before:top-[7px] before:bottom-[7px] before:w-[3px] before:rounded-full before:bg-primary" />
                        )}
                        <span
                          className={cx(
                            'min-w-0 flex-1 truncate text-[13px]',
                            active ? 'font-semibold text-foreground' : 'text-foreground/85'
                          )}
                        >
                          {conv.title ?? 'Sans titre'}
                        </span>
                        {active && props.busy && (
                          <span
                            className="size-[7px] shrink-0 animate-pulse rounded-full bg-suggere"
                            title="en cours"
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onDelete(conv.conversationId)}
                        title="Supprimer la conversation"
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-destructive group-hover/item:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2.5 border-t border-border/60 px-3.5 py-2.5">
        <span
          className={cx(
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
