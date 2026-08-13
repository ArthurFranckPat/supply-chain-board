import { useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { MessageSquare, Pencil, Search, SquarePen, Trash2 } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { Button } from '@r/components/ui/button'

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
 * titre, renommage inline (crayon / double-clic), suppression au survol.
 * Le rechargement d'une conversation passe par `onSelect` (la page relit les
 * messages côté serveur).
 */
export function CopiloteSidebar(props: {
  conversations: ConversationSummary[]
  currentId: string | null
  busy: boolean
  onNewChat: () => void
  onSelect: (conversationId: string) => void
  onRename: (conversationId: string, title: string) => void
  onDelete: (conversationId: string) => void
  username: string
  env: 'test' | 'prod'
}) {
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const skipCommitRef = useRef(false)

  useEffect(() => {
    if (!renamingId) return
    const el = renameRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renamingId])

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

  function startRename(conv: ConversationSummary) {
    setRenamingId(conv.conversationId)
    setDraft(conv.title ?? '')
  }

  function cancelRename() {
    skipCommitRef.current = true
    setRenamingId(null)
  }

  function commitRename() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false
      setRenamingId(null)
      return
    }
    const id = renamingId
    if (!id) return
    const title = draft.trim()
    const current = props.conversations.find((c) => c.conversationId === id)
    setRenamingId(null)
    if (!title || title === (current?.title ?? '')) return
    props.onRename(id, title)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3.5 pb-2.5 pt-3.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={props.onNewChat}
          disabled={props.busy}
          className="w-full"
        >
          <SquarePen size={15} />
          Nouvelle conversation
        </Button>
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
            className="h-8 w-full rounded-md border border-border bg-card py-0 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-70"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3.5">
        {!hasAny && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted-foreground">
            <MessageSquare size={18} className="opacity-60" />
            Aucune conversation pour l'instant.
          </div>
        )}

        {hasAny && !hasResults && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Aucun résultat pour « {query.trim()} ».
          </div>
        )}

        {GROUP_ORDER.map((group) => {
          const items = groups[group]
          if (items.length === 0) return null
          return (
            <div key={group} className="mt-2 first:mt-0">
              <div className="px-2.5 pb-1.5 text-[11px] font-medium text-muted-foreground">
                {GROUP_LABELS[group]}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((conv) => {
                  const active = conv.conversationId === props.currentId
                  const renaming = conv.conversationId === renamingId
                  return (
                    <div
                      key={conv.conversationId}
                      className={cn(
                        'group/item relative flex w-full items-center gap-1 rounded-md px-2.5 py-2 transition-colors',
                        active ? 'bg-[var(--sidebar-selected)]' : 'hover:bg-card/60'
                      )}
                    >
                      {renaming ? (
                        <input
                          ref={renameRef}
                          type="text"
                          value={draft}
                          maxLength={120}
                          aria-label="Titre de la conversation"
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitRename()
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelRename()
                            }
                          }}
                          onBlur={commitRename}
                          className="h-7 min-w-0 flex-1 rounded-md border border-ring bg-card px-1.5 text-[13px] text-foreground outline-none"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => props.onSelect(conv.conversationId)}
                            onDoubleClick={(e) => {
                              e.preventDefault()
                              startRename(conv)
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-[13px]',
                                active ? 'font-medium text-foreground' : 'text-foreground/85'
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => startRename(conv)}
                            title="Renommer la conversation"
                            aria-label="Renommer la conversation"
                            className="shrink-0 text-muted-foreground opacity-0 group-hover/item:opacity-100"
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => props.onDelete(conv.conversationId)}
                            title="Supprimer la conversation"
                            aria-label="Supprimer la conversation"
                            className="shrink-0 text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-3.5 py-2.5">
        <span
          className={cn(
            'flex size-[30px] shrink-0 items-center justify-center rounded-full font-mono text-[11.5px] font-medium uppercase text-white',
            props.env === 'test' ? 'bg-suggere' : 'bg-foreground'
          )}
        >
          {props.username.slice(0, 2)}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-xs font-medium text-foreground">{props.username}</div>
          <div className="text-[10.5px] font-medium text-muted-foreground">
            Sage X3 · {props.env}
          </div>
        </div>
      </div>
    </div>
  )
}
