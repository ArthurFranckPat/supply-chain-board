/**
 * Chat copilote supply — Solid + `useChat` (AI SDK v6, couche agentique v1).
 *
 * Le backend émet le UI Message Stream Protocol standard
 * (`x-vercel-ai-ui-message-stream: v1`) — consommé ici via
 * `DefaultChatTransport` + `@kodehort/ai-sdk-solid`. Le même endpoint sera
 * réutilisé tel quel par `@ai-sdk/react` à la migration #77.
 *
 * Historique LLM : porté par la session Pi côté serveur (clé
 * `conversationId`, TTL 30 min) — le front n'envoie que le dernier message.
 * Trace outils + payloads repliables, raisonnement affiché (repliable).
 */

import { useChat } from '@kodehort/ai-sdk-solid'
import {
  DefaultChatTransport,
  getToolOrDynamicToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai'
import { createSignal, For, Show, type Component } from 'solid-js'

import { Masthead } from '@/components/masthead'
import { route } from '@/lib/routes'

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

const CopilotePage: Component = () => {
  const [input, setInput] = createSignal('')
  const [conversationId, setConversationId] = createSignal(newConversationId())

  const chat = useChat<AgentUIMessage>({
    transport: new DefaultChatTransport<AgentUIMessage>({
      api: route('agent.chat'),
      // Le serveur garde la mémoire (session Pi) : on n'envoie que le
      // dernier message + la clé de conversation.
      prepareSendMessagesRequest: ({ messages }) => {
        const last = messages[messages.length - 1]
        const text =
          last?.parts
            .filter(isTextUIPart)
            .map((p) => p.text)
            .join('\n') ?? ''
        return {
          body: {
            message: text,
            conversationId: conversationId(),
            page: 'copilote',
          },
        }
      },
    }),
  })

  const busy = () => chat.status === 'submitted' || chat.status === 'streaming'

  function resetConversation() {
    if (busy()) return
    chat.setMessages([])
    chat.clearError()
    setConversationId(newConversationId())
  }

  function send() {
    const text = input().trim()
    if (!text || busy()) return
    setInput('')
    void chat.sendMessage({ text })
  }

  /** Modèle lu depuis la metadata du dernier message assistant. */
  const model = (): string | null => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i]
      if (m.role === 'assistant' && m.metadata?.model) return m.metadata.model
    }
    return null
  }

  const toolParts = (m: AgentUIMessage) => m.parts.filter(isToolUIPart)

  return (
    <div class="flex h-screen flex-col bg-background text-foreground">
      <Masthead
        subtitle="Copilote supply — lecture seule"
        active="copilote"
        meta={
          <div class="text-right text-[11px] leading-tight text-secondary-foreground">
            <div class="font-semibold text-foreground">Agentique v1</div>
            <div>{model() ?? 'zai / glm-5.2'}</div>
          </div>
        }
      />

      <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
        <div class="flex items-start justify-between gap-3">
          <p class="text-[12px] text-secondary-foreground">
            Copilote lecture-seule. Orchestre les algos board (verdict, BOM, CTP, retards,
            scénarios). Tout chiffre porte sa source tool{' '}
            <code class="rounded bg-muted px-1">[tool: …]</code>.
          </p>
          <button
            type="button"
            onClick={resetConversation}
            disabled={busy() || chat.messages.length === 0}
            class="shrink-0 rounded-md border border-rule px-2 py-1 text-[11px] text-secondary-foreground hover:border-brand hover:text-foreground disabled:opacity-40"
          >
            Nouvelle conversation
          </button>
        </div>

        <div class="flex flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-rule bg-card p-4">
          <Show when={chat.messages.length === 0}>
            <div class="text-[13px] text-secondary-foreground">
              Exemples :
              <ul class="mt-2 list-disc space-y-1 pl-5">
                <li>Pourquoi l'OF … est bloqué ?</li>
                <li>Date engageante pour 200 PP_830_ESH ?</li>
                <li>Retards clients prévus sur 14 jours</li>
              </ul>
            </div>
          </Show>
          <For each={chat.messages}>
            {(m) => (
              <div
                class={
                  m.role === 'user'
                    ? 'ml-8 rounded-lg bg-brand/10 px-3 py-2 text-[13px]'
                    : 'mr-4 rounded-lg border border-rule bg-background px-3 py-2 text-[13px]'
                }
              >
                <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
                  {m.role === 'user' ? 'Vous' : 'Copilote'}
                </div>
                <Show when={toolParts(m).length > 0}>
                  <details class="mb-2 rounded border border-rule/60 bg-muted/40 px-2 py-1">
                    <summary class="cursor-pointer text-[11px] text-secondary-foreground">
                      Trace outils ({toolParts(m).length})
                    </summary>
                    <ul class="mt-1 space-y-0.5 text-[11px]">
                      <For each={toolParts(m)}>
                        {(t) => {
                          const status = () => toolStatus(t)
                          return (
                            <li>
                              <details>
                                <summary class="cursor-pointer">
                                  <span
                                    class={
                                      status() === 'running'
                                        ? 'text-suggere'
                                        : status() === 'error'
                                          ? 'text-destructive'
                                          : 'text-foreground'
                                    }
                                  >
                                    {status() === 'running'
                                      ? '…'
                                      : status() === 'error'
                                        ? '✗'
                                        : '✓'}{' '}
                                    {getToolOrDynamicToolName(t)}
                                  </span>
                                </summary>
                                <div class="mt-1 space-y-1 pl-4">
                                  <div>
                                    <span class="font-semibold text-secondary-foreground">
                                      args
                                    </span>
                                    <pre class="overflow-x-auto rounded bg-background/60 p-1 text-[10px]">
                                      {JSON.stringify(t.input, null, 2)}
                                    </pre>
                                  </div>
                                  <Show when={status() !== 'running'}>
                                    <div>
                                      <span class="font-semibold text-secondary-foreground">
                                        résultat
                                      </span>
                                      <pre class="max-h-48 overflow-auto rounded bg-background/60 p-1 text-[10px]">
                                        {status() === 'error'
                                          ? t.errorText
                                          : JSON.stringify(t.output, null, 2)}
                                      </pre>
                                    </div>
                                  </Show>
                                </div>
                              </details>
                            </li>
                          )
                        }}
                      </For>
                    </ul>
                  </details>
                </Show>
                <For each={m.parts}>
                  {(part) => (
                    <Show
                      when={isTextUIPart(part) || isReasoningUIPart(part) ? part : undefined}
                    >
                      {(p) => (
                        <Show
                          when={isTextUIPart(p())}
                          fallback={
                            <details class="mb-2 rounded border border-rule/40 bg-muted/20 px-2 py-1">
                              <summary class="cursor-pointer text-[11px] italic text-secondary-foreground">
                                Réflexion
                              </summary>
                              <div class="mt-1 whitespace-pre-wrap text-[12px] italic leading-relaxed text-secondary-foreground">
                                {(p() as { text: string }).text}
                              </div>
                            </details>
                          }
                        >
                          <div class="whitespace-pre-wrap leading-relaxed">
                            {(p() as { text: string }).text}
                          </div>
                        </Show>
                      )}
                    </Show>
                  )}
                </For>
              </div>
            )}
          </For>
          <Show when={chat.error}>
            <div class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {chat.error?.message}
            </div>
          </Show>
        </div>

        <form
          class="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            class="flex-1 rounded-md border border-rule bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
            placeholder="Poser une question supply…"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            disabled={busy()}
          />
          <Show
            when={!busy()}
            fallback={
              <button
                type="button"
                onClick={() => void chat.stop()}
                class="rounded-md bg-destructive px-4 py-2 text-[13px] font-semibold text-white"
              >
                Stop
              </button>
            }
          >
            <button
              type="submit"
              disabled={!input().trim()}
              class="rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Envoyer
            </button>
          </Show>
        </form>
      </main>
    </div>
  )
}

export default CopilotePage
