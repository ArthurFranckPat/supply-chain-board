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
 * Trace outils + payloads repliables, raisonnement affiché (repliable).
 *
 * Port depuis inertia/pages/copilote.tsx (Solid).
 */

import { useState, useMemo, useRef, useCallback } from 'react'
import { Head } from '@inertiajs/react'
import {
  DefaultChatTransport,
  getToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai'
import { useChat } from '@ai-sdk/react'

import { route } from '@/lib/routes'
import { cn } from '@r/lib/utils'

/** Masthead import — React component from inertia-react/components */
import { Masthead } from '@r/components/masthead'

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

type AnyToolPart = ToolUIPart | DynamicToolUIPart
type ToolStatus = 'running' | 'done' | 'error'

function toolStatus(part: AnyToolPart): ToolStatus {
  if (part.state === 'output-available') return 'done'
  if (part.state === 'output-error') return 'error'
  return 'running'
}

export default function Copilote() {
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState(newConversationId())
  const conversationIdRef = useRef(conversationId)

  // Keep ref in sync when conversationId changes
  conversationIdRef.current = conversationId

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
  }, [busy, chat])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    void chat.sendMessage({ text })
  }, [input, busy, chat])

  /** Modèle lu depuis la metadata du dernier message assistant. */
  const model = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i]
      if (m.role === 'assistant' && m.metadata?.model) return m.metadata.model
    }
    return null
  }, [chat.messages])

  const toolParts = useCallback((m: AgentUIMessage) => m.parts.filter(isToolUIPart), [])

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

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[12px] text-secondary-foreground">
              Copilote lecture-seule. Orchestre les algos board (verdict, BOM, CTP,
              retards, scénarios). Tout chiffre porte sa source tool{' '}
              <code className="rounded bg-muted px-1">[tool: …]</code>.
            </p>
            <button
              type="button"
              onClick={resetConversation}
              disabled={busy || chat.messages.length === 0}
              className="shrink-0 rounded-md border border-rule px-2 py-1 text-[11px] text-secondary-foreground hover:border-brand hover:text-foreground disabled:opacity-40"
            >
              Nouvelle conversation
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-rule bg-card p-4">
            {chat.messages.length === 0 && (
              <div className="text-[13px] text-secondary-foreground">
                Exemples :
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Pourquoi l'OF … est bloqué ?</li>
                  <li>Date engageante pour 200 PP_830_ESH ?</li>
                  <li>Retards clients prévus sur 14 jours</li>
                </ul>
              </div>
            )}
            {chat.messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-8 rounded-lg bg-brand/10 px-3 py-2 text-[13px]'
                    : 'mr-4 rounded-lg border border-rule bg-background px-3 py-2 text-[13px]'
                }
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
                  {m.role === 'user' ? 'Vous' : 'Copilote'}
                </div>
                {toolParts(m).length > 0 && (
                  <details className="mb-2 rounded border border-rule/60 bg-muted/40 px-2 py-1">
                    <summary className="cursor-pointer text-[11px] text-secondary-foreground">
                      Trace outils ({toolParts(m).length})
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-[11px]">
                      {toolParts(m).map((t, idx) => {
                        const status = toolStatus(t)
                        const toolName = getToolName(t)
                        return (
                          <li key={`${toolName}-${idx}`}>
                            <details>
                              <summary className="cursor-pointer">
                                <span
                                  className={
                                    status === 'running'
                                      ? 'text-suggere'
                                      : status === 'error'
                                        ? 'text-destructive'
                                        : 'text-foreground'
                                  }
                                >
                                  {status === 'running'
                                    ? '…'
                                    : status === 'error'
                                      ? '✗'
                                      : '✓'}{' '}
                                  {toolName}
                                </span>
                              </summary>
                              <div className="mt-1 space-y-1 pl-4">
                                <div>
                                  <span className="font-semibold text-secondary-foreground">
                                    args
                                  </span>
                                  <pre className="overflow-x-auto rounded bg-background/60 p-1 text-[10px]">
                                    {JSON.stringify(t.input, null, 2)}
                                  </pre>
                                </div>
                                {status !== 'running' && (
                                  <div>
                                    <span className="font-semibold text-secondary-foreground">
                                      résultat
                                    </span>
                                    <pre className="max-h-48 overflow-auto rounded bg-background/60 p-1 text-[10px]">
                                      {status === 'error'
                                        ? t.errorText
                                        : JSON.stringify(t.output, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </details>
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                )}
                {m.parts.map((part, idx) => {
                  const textOrReasoning = isTextUIPart(part) || isReasoningUIPart(part) ? part : null
                  if (!textOrReasoning) return null

                  return (
                    <div key={idx}>
                      {isTextUIPart(textOrReasoning) ? (
                        <div className="whitespace-pre-wrap leading-relaxed">
                          {textOrReasoning.text}
                        </div>
                      ) : (
                        <details className="mb-2 rounded border border-rule/40 bg-muted/20 px-2 py-1">
                          <summary className="cursor-pointer text-[11px] italic text-secondary-foreground">
                            Réflexion
                          </summary>
                          <div className="mt-1 whitespace-pre-wrap text-[12px] italic leading-relaxed text-secondary-foreground">
                            {textOrReasoning.text}
                          </div>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            {chat.error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {chat.error?.message}
              </div>
            )}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <input
              className="flex-1 rounded-md border border-rule bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
              placeholder="Poser une question supply…"
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              disabled={busy}
            />
            {!busy ? (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Envoyer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void chat.stop()}
                className="rounded-md bg-destructive px-4 py-2 text-[13px] font-semibold text-white"
              >
                Stop
              </button>
            )}
          </form>
        </main>
      </div>
    </>
  )
}
