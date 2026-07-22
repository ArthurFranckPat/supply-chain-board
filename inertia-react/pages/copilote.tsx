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
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { Head, usePage } from '@inertiajs/react'
import {
  DefaultChatTransport,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from 'ai'
import { useChat } from '@ai-sdk/react'
import { Bot, Check, Copy, PanelLeft, PanelRight } from 'lucide-react'

import { route } from '@/lib/routes'
import { cn } from '@r/lib/utils'

import { Masthead } from '@r/components/masthead'
import { Bubble, BubbleContent } from '@r/components/ui/bubble'
import { AppShell } from '@r/components/copilote/app-shell'
import { CopiloteSidebar } from '@r/components/copilote/sidebar'
import { InspectorPanel, deriveInspectorContext } from '@r/components/copilote/inspector'
import { Composer } from '@r/components/copilote/composer'
import { ToolTokens } from '@r/components/copilote/tool-tokens'
import { CopiloteMarkdown } from '@r/components/copilote/markdown'

/** Metadata émise par le backend sur le chunk `start` (ex-event `session`). */
interface AgentMessageMetadata {
  sessionId?: string
  model?: string
  tools?: string[]
}

type AgentUIMessage = UIMessage<AgentMessageMetadata>

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

  const chat = useChat<AgentUIMessage>({
    transport: useMemo(
      () =>
        new DefaultChatTransport<AgentUIMessage>({
          api: route('agent.chat'),
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

  const flashTool = useCallback((tool: string) => {
    setInspectorCollapsed(false)
    setFlash({ tool, nonce: Date.now() })
  }, [])

  function copyAnswer(messageId: string, text: string) {
    if (navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(messageId)
    setTimeout(() => setCopiedId((cur) => (cur === messageId ? null : cur)), 1400)
  }

  /** Modèle lu depuis la metadata du dernier message assistant. */
  const model = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i]
      if (m.role === 'assistant' && m.metadata?.model) return m.metadata.model
    }
    return null
  }, [chat.messages])

  const { entries: inspectorEntries, subject } = useMemo(
    () => deriveInspectorContext(chat.messages),
    [chat.messages]
  )

  const firstUserText = useMemo(() => {
    for (const m of chat.messages) {
      if (m.role !== 'user') continue
      const text = m.parts.filter(isTextUIPart).map((p) => p.text).join(' ')
      if (text) return text.length > 42 ? `${text.slice(0, 42)}…` : text
    }
    return null
  }, [chat.messages])

  return (
    <>
      <Head title="Copilote" />
      <div className="theme-airbnb flex h-screen flex-col bg-background text-foreground">
        <Masthead
          subtitle="Copilote supply — lecture seule"
          active="copilote"
          variant="airbnb"
          meta={
            <div className="text-right text-[11px] leading-tight text-secondary-foreground">
              <div className="font-semibold text-foreground">Agentique v1</div>
              <div>{model ?? 'zai / glm-5.2'}</div>
            </div>
          }
        />

        <AppShell
          navCollapsed={navCollapsed}
          inspectorCollapsed={inspectorCollapsed}
          sidebar={
            <CopiloteSidebar
              currentTitle={firstUserText}
              busy={busy}
              onNewChat={resetConversation}
              disabled={busy || chat.messages.length === 0}
              username={authUser?.username ?? '—'}
              env={authUser?.env ?? 'prod'}
            />
          }
          inspector={<InspectorPanel entries={inspectorEntries} subject={subject} flash={flash} />}
        >
          <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-2.5">
            <button
              type="button"
              onClick={() => setNavCollapsed((v) => !v)}
              title="Replier / déplier la navigation"
              aria-pressed={!navCollapsed}
              className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              <PanelLeft size={14} />
            </button>
            <div className="flex-1 text-center text-[12.5px] text-muted-foreground">
              <strong className="font-semibold text-foreground">Copilote</strong> · lecture seule
            </div>
            <button
              type="button"
              onClick={() => setInspectorCollapsed((v) => !v)}
              title="Replier / déplier le contexte"
              aria-pressed={!inspectorCollapsed}
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-foreground hover:text-foreground',
                inspectorCollapsed ? 'text-muted-foreground' : 'text-foreground'
              )}
            >
              Contexte
              <PanelRight size={14} />
            </button>
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
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-primary">
                        <Bot size={15} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold tracking-tight text-foreground">
                            Copilote
                          </span>
                          {m.metadata?.model && (
                            <span className="rounded-full bg-planifie/15 px-1.5 py-px font-mono text-[10px] font-semibold text-planifie">
                              {m.metadata.model}
                            </span>
                          )}
                        </div>

                        <ToolTokens parts={m.parts.filter(isToolUIPart)} />

                        <div className="group/answer">
                          {m.parts.map((part, idx) => {
                            if (isReasoningUIPart(part)) {
                              return (
                                <details
                                  key={idx}
                                  className="mb-2.5 rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5"
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
                            <button
                              type="button"
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
                              className={cn(
                                'mt-2.5 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover/answer:opacity-100',
                                copiedId === m.id && 'text-ferme opacity-100'
                              )}
                            >
                              {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="mt-6 flex items-center gap-3 text-[13.5px] italic text-muted-foreground">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-primary">
                    <Bot size={15} />
                  </span>
                  <span className="inline-flex gap-1">
                    <span className="size-[5px] animate-pulse rounded-full bg-current [animation-delay:0ms]" />
                    <span className="size-[5px] animate-pulse rounded-full bg-current [animation-delay:180ms]" />
                    <span className="size-[5px] animate-pulse rounded-full bg-current [animation-delay:360ms]" />
                  </span>
                  Le copilote réfléchit…
                </div>
              )}

              {chat.error && (
                <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
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
    </>
  )
}
