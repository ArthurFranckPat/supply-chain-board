/**
 * Chat copilote supply — React + `useChat` (AI SDK v6, couche agentique v1).
 *
 * Le backend émet le UI Message Stream Protocol standard
 * (`x-vercel-ai-ui-message-stream: v1`) — consommé ici via
 * `DefaultChatTransport` + `@ai-sdk/react`. Le même endpoint que le Solid
 * (backend inchangé).
 *
 * Historique LLM : porté par la session Pi côté serveur (clé
 * `conversationId`, TTL 30 min) — le front n'envoie que le dernier message.
 *
 * Redesign issue #84 : app shell 3 zones (nav / chat / inspecteur contexte)
 * — voir design/mockups/copilote-redesign/04-focus-rail.html pour la
 * référence visuelle. Backend inchangé.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `AppLayout theme="cursor" dense scrollable={false}` — TopBar + sidebar
 *   app ; plus de `Masthead` ni de wrapper `theme-airbnb h-screen` ;
 * • pas de `meta` TopBar ni de `ToolbarMetric` ; les boutons replier
 *   nav / contexte restent dans le chrome du chat (ils gouvernent AppShell) ;
 * • AppShell 3 colonnes vit dans les children, en `h-full` — la sidebar
 *   conversations coexiste avec la sidebar app, elles ne fusionnent pas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePage } from '@inertiajs/react'
import {
  DefaultChatTransport,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from 'ai'
import { useChat } from '@ai-sdk/react'
import { Bot, Check, Copy, PanelLeft, PanelRight } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'

import { route } from '@r/lib/routes'
import { cn } from '@r/lib/utils'

import AppLayout from '@r/layouts/app'
import { Badge } from '@r/components/ui/badge'
import { Bubble, BubbleContent } from '@r/components/ui/bubble'
import { Button } from '@r/components/ui/button'
import { AppShell } from '@r/components/copilote/app-shell'
import { CopiloteSidebar, type ConversationSummary } from '@r/components/copilote/sidebar'
import { InspectorPanel, deriveInspectorContext } from '@r/components/copilote/inspector'
import { Composer } from '@r/components/copilote/composer'
import { ToolTokens, toolStatus } from '@r/components/copilote/tool-tokens'
import { McpAppParts } from '@r/components/copilote/mcp-app-frame'
import { CopiloteMarkdown } from '@r/components/copilote/markdown'
import type { LoadingOrbState } from '@r/components/ui/loading-state'

/** Metadata émise par le backend sur le chunk `start` (ex-event `session`). */
interface AgentMessageMetadata {
  sessionId?: string
  model?: string
  tools?: string[]
}

type AgentUIMessage = UIMessage<AgentMessageMetadata>

const BUSY_LABELS: Record<LoadingOrbState, string> = {
  listening: 'En écoute…',
  searching: 'Interroge les données…',
  solving: 'Analyse…',
  composing: 'Rédige…',
  working: 'Réfléchit…',
  shaping: 'Prépare…',
}

function deriveBusyOrb(
  messages: AgentUIMessage[],
  status: string
): {
  state: LoadingOrbState
  label: string
} {
  if (status === 'submitted') {
    return { state: 'listening', label: BUSY_LABELS.listening }
  }
  const last = [...messages].reverse().find((m) => m.role === 'assistant')
  if (last) {
    const tools = last.parts.filter(isToolUIPart)
    if (tools.some((p) => toolStatus(p) === 'running')) {
      return { state: 'searching', label: BUSY_LABELS.searching }
    }
    if (last.parts.some(isReasoningUIPart)) {
      return { state: 'solving', label: BUSY_LABELS.solving }
    }
    if (last.parts.some((p) => isTextUIPart(p) && p.text)) {
      return { state: 'composing', label: BUSY_LABELS.composing }
    }
  }
  return { state: 'working', label: BUSY_LABELS.working }
}

function newConversationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type AuthUser = { username: string; env: 'test' | 'prod' } | null

export default function Copilote() {
  const authUser = usePage<{ authUser: AuthUser }>().props.authUser

  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState(newConversationId())
  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId

  const [navCollapsed, setNavCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [flash, setFlash] = useState<{ tool: string; nonce: number } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])

  const chat = useChat<AgentUIMessage>({
    transport: useMemo(
      () =>
        new DefaultChatTransport<AgentUIMessage>({
          api: route('copilote.chat'),
          prepareSendMessagesRequest: ({ messages }) => {
            const last = messages[messages.length - 1]
            const text =
              last?.parts
                .filter(isTextUIPart)
                .map((p: { text: string }) => p.text)
                .join('\n') ?? ''
            return {
              body: {
                message: text,
                conversationId: conversationIdRef.current,
                page: 'copilote',
              },
            }
          },
        }),
      [] // Empty deps - transport is created once, conversationIdRef stays in sync
    ),
  })

  const busy = chat.status === 'submitted' || chat.status === 'streaming'

  const resetConversation = useCallback(() => {
    if (busy) return
    chat.setMessages([])
    chat.clearError()
    setConversationId(newConversationId())
    setInput('')
  }, [busy, chat])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    void chat.sendMessage({ text })
  }, [input, busy, chat])

  /** Recharge la liste des conversations (sidebar) depuis le serveur. */
  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch(route('copilote.conversations'))
      if (!res.ok) return
      const data = (await res.json()) as { conversations?: ConversationSummary[] }
      setConversations(Array.isArray(data.conversations) ? data.conversations : [])
    } catch {
      /* best-effort */
    }
  }, [])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  // Refetch la liste à la fin d'un tour : la conversation courante (nouvelle ou
  // mise à jour) apparaît / remonte dans l'historique de la sidebar.
  const wasBusyRef = useRef(false)
  useEffect(() => {
    if (wasBusyRef.current && !busy) void refreshConversations()
    wasBusyRef.current = busy
  }, [busy, refreshConversations])

  /** Ouvre une conversation persistée : relit ses messages côté serveur. */
  const openConversation = useCallback(
    async (id: string) => {
      if (busy || id === conversationIdRef.current) return
      try {
        const res = await fetch(route('copilote.conversation', { id }))
        if (!res.ok) return
        const data = (await res.json()) as { messages?: AgentUIMessage[] }
        chat.setMessages(Array.isArray(data.messages) ? data.messages : [])
        chat.clearError()
        setConversationId(id)
        setInput('')
      } catch {
        /* best-effort */
      }
    },
    [busy, chat]
  )

  const deleteConversation = useCallback(
    async (id: string) => {
      if (busy && id === conversationIdRef.current) return
      try {
        await fetch(route('copilote.conversationsDestroy', { id }), { method: 'DELETE' })
      } catch {
        /* best-effort */
      }
      if (id === conversationIdRef.current) {
        chat.setMessages([])
        chat.clearError()
        setConversationId(newConversationId())
        setInput('')
      }
      void refreshConversations()
    },
    [busy, chat, refreshConversations]
  )

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      setConversations((prev) => prev.map((c) => (c.conversationId === id ? { ...c, title } : c)))
      try {
        const res = await fetch(route('copilote.conversationsUpdate', { id }), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
        if (!res.ok) void refreshConversations()
      } catch {
        void refreshConversations()
      }
    },
    [refreshConversations]
  )

  const flashTool = useCallback((tool: string) => {
    setInspectorCollapsed(false)
    setFlash({ tool, nonce: Date.now() })
  }, [])

  function copyAnswer(messageId: string, text: string) {
    if (navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(messageId)
    setTimeout(() => setCopiedId((cur) => (cur === messageId ? null : cur)), 1400)
  }

  const { entries: inspectorEntries, subject } = useMemo(
    () => deriveInspectorContext(chat.messages),
    [chat.messages]
  )

  const busyOrb = useMemo(
    () => (busy ? deriveBusyOrb(chat.messages, chat.status) : null),
    [busy, chat.messages, chat.status]
  )

  return (
    <AppLayout
      title="Copilote"
      active="copilote"
      subtitle="Copilote supply — lecture seule"
      theme="cursor"
      dense
      scrollable={false}
    >
      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal : sans ce wrapper, AppShell ne prend pas la hauteur sous le
          TopBar. La sidebar app (nav) et la sidebar conversations coexistent. */}
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <AppShell
          navCollapsed={navCollapsed}
          inspectorCollapsed={inspectorCollapsed}
          sidebar={
            <CopiloteSidebar
              conversations={conversations}
              currentId={conversationId}
              busy={busy}
              onNewChat={resetConversation}
              onSelect={(id) => void openConversation(id)}
              onRename={(id, title) => void renameConversation(id, title)}
              onDelete={(id) => void deleteConversation(id)}
              username={authUser?.username ?? '—'}
              env={authUser?.env ?? 'prod'}
            />
          }
          inspector={<InspectorPanel entries={inspectorEntries} subject={subject} flash={flash} />}
        >
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-2">
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              onClick={() => setNavCollapsed((v) => !v)}
              title="Replier / déplier la navigation"
              aria-pressed={!navCollapsed}
              aria-label="Replier / déplier la navigation"
            >
              <PanelLeft size={14} />
            </Button>
            <div className="flex-1 text-center text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Copilote</span>
              {' · '}
              lecture seule
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setInspectorCollapsed((v) => !v)}
              title="Replier / déplier le contexte"
              aria-pressed={!inspectorCollapsed}
              aria-label="Replier / déplier le contexte"
            >
              Contexte
              <PanelRight size={14} />
            </Button>
          </div>

          <div className="flex flex-1 justify-center overflow-hidden">
            <div className="w-full max-w-[720px] overflow-y-auto px-6 py-6">
              {chat.messages.length === 0 && (
                <div className="text-[13px] text-secondary-foreground">
                  Exemples :
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Pourquoi l'OF … est bloqué ?</li>
                    <li>Date engageante pour 200 PP_830_ESH ?</li>
                    <li>Retards clients prévus sur 14 jours</li>
                  </ul>
                  <p className="mt-3 text-[11.5px] text-muted-foreground">
                    Astuce : clique un{' '}
                    <code className="rounded bg-muted px-1 font-mono">[tool: …]</code> dans une
                    réponse pour flasher la donnée citée à droite.
                  </p>
                </div>
              )}

              {chat.messages.map((m) => (
                <div key={m.id} className="mt-6 flex flex-col gap-5 first:mt-0">
                  {m.role === 'user' ? (
                    <Bubble variant="tinted" align="end">
                      <BubbleContent>
                        {m.parts
                          .filter(isTextUIPart)
                          .map((p) => p.text)
                          .join('\n')}
                      </BubbleContent>
                    </Bubble>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                        <Bot size={15} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">Copilote</span>
                          {m.metadata?.model && (
                            <Badge
                              variant="secondary"
                              className="font-mono text-[10px] tabular-nums"
                            >
                              {m.metadata.model}
                            </Badge>
                          )}
                        </div>

                        <ToolTokens parts={m.parts.filter(isToolUIPart)} />

                        {/* Apps MCP (issue #89) : graphes rendus par le protocole,
                            au-dessus de la réponse rédigée. */}
                        <McpAppParts parts={m.parts.filter(isToolUIPart)} />

                        <div className="group/answer">
                          {m.parts.map((part, idx) => {
                            if (isReasoningUIPart(part)) {
                              return (
                                <details
                                  key={idx}
                                  className="mb-2.5 rounded-md border border-border bg-muted/20 px-2.5 py-1.5"
                                >
                                  <summary className="cursor-pointer text-[11px] italic text-muted-foreground">
                                    Réflexion
                                  </summary>
                                  <div className="mt-1 whitespace-pre-wrap text-[12px] italic leading-relaxed text-muted-foreground">
                                    {part.text}
                                  </div>
                                </details>
                              )
                            }
                            if (isTextUIPart(part) && part.text) {
                              return (
                                <CopiloteMarkdown key={idx} text={part.text} onFlash={flashTool} />
                              )
                            }
                            return null
                          })}

                          {m.parts.some((p) => isTextUIPart(p) && p.text) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                copyAnswer(
                                  m.id,
                                  m.parts
                                    .filter(isTextUIPart)
                                    .map((p) => p.text)
                                    .join('\n')
                                )
                              }
                              title="Copier la réponse"
                              aria-label="Copier la réponse"
                              className={cn(
                                'mt-2.5 text-muted-foreground opacity-0 group-hover/answer:opacity-100',
                                copiedId === m.id && 'text-ferme opacity-100'
                              )}
                            >
                              {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {busyOrb && (
                <div className="mt-6 flex items-center gap-2.5 text-[13.5px] italic text-muted-foreground">
                  <ThinkingOrb
                    state={busyOrb.state}
                    size={20}
                    aria-label={busyOrb.label}
                    className="shrink-0"
                  />
                  {busyOrb.label}
                </div>
              )}

              {chat.error && (
                <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {chat.error?.message}
                </div>
              )}
            </div>
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSend={send}
            onStop={() => void chat.stop()}
            busy={busy}
          />
        </AppShell>
      </div>
    </AppLayout>
  )
}
