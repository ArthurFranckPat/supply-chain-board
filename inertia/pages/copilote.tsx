/**
 * Chat copilote supply — Solid + SSE (couche agentique v1).
 * Jeté à la migration React/Carbon #77. Trace outils repliable.
 */

import { createSignal, For, Show, type Component } from 'solid-js'
import { Masthead } from '@/components/masthead'
import { route } from '@/lib/routes'

type Role = 'user' | 'assistant'

interface ToolTrace {
  name: string
  status: 'running' | 'done' | 'error'
}

interface ChatMessage {
  id: number
  role: Role
  text: string
  tools: ToolTrace[]
  error?: string
}

let _id = 0
const nextId = () => ++_id

const CopilotePage: Component = () => {
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [input, setInput] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [model, setModel] = createSignal<string | null>(null)

  async function send() {
    const text = input().trim()
    if (!text || busy()) return
    setInput('')
    setBusy(true)

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text, tools: [] }
    const assistantId = nextId()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      tools: [],
    }
    setMessages((m) => [...m, userMsg, assistantMsg])

    try {
      const res = await fetch(route('agent.chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          message: text,
          page: 'copilote',
        }),
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => res.statusText)
        setMessages((ms) =>
          ms.map((m) =>
            m.id === assistantId
              ? { ...m, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` }
              : m
          )
        )
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          const line = chunk
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.startsWith('data:'))
          if (!line) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          let ev: {
            type: string
            text?: string
            toolName?: string
            isError?: boolean
            message?: string
            model?: string
            tools?: string[]
          }
          try {
            ev = JSON.parse(raw)
          } catch {
            continue
          }
          if (ev.type === 'session' && ev.model) setModel(ev.model)
          if (ev.type === 'text_delta' && ev.text) {
            setMessages((ms) =>
              ms.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + ev.text } : m
              )
            )
          }
          if (ev.type === 'tool_start' && ev.toolName) {
            setMessages((ms) =>
              ms.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      tools: [...m.tools, { name: ev.toolName!, status: 'running' }],
                    }
                  : m
              )
            )
          }
          if (ev.type === 'tool_end' && ev.toolName) {
            setMessages((ms) =>
              ms.map((m) => {
                if (m.id !== assistantId) return m
                const tools = [...m.tools]
                for (let i = tools.length - 1; i >= 0; i--) {
                  if (tools[i].name === ev.toolName && tools[i].status === 'running') {
                    tools[i] = {
                      name: ev.toolName!,
                      status: ev.isError ? 'error' : 'done',
                    }
                    break
                  }
                }
                return { ...m, tools }
              })
            )
          }
          if (ev.type === 'error' && ev.message) {
            setMessages((ms) =>
              ms.map((m) =>
                m.id === assistantId ? { ...m, error: ev.message } : m
              )
            )
          }
        }
      }
    } catch (err) {
      setMessages((ms) =>
        ms.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                error: err instanceof Error ? err.message : String(err),
              }
            : m
        )
      )
    } finally {
      setBusy(false)
    }
  }

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
        <p class="text-[12px] text-secondary-foreground">
          Copilote lecture-seule. Orchestre les algos board (verdict, BOM, CTP, retards,
          scénarios). Tout chiffre porte sa source tool{' '}
          <code class="rounded bg-muted px-1">[tool: …]</code>.
        </p>

        <div class="flex flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-rule bg-card p-4">
          <Show when={messages().length === 0}>
            <div class="text-[13px] text-secondary-foreground">
              Exemples :
              <ul class="mt-2 list-disc space-y-1 pl-5">
                <li>Pourquoi l'OF … est bloqué ?</li>
                <li>Date engageante pour 200 PP_830_ESH ?</li>
                <li>Retards clients prévus sur 14 jours</li>
              </ul>
            </div>
          </Show>
          <For each={messages()}>
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
                <Show when={m.tools.length > 0}>
                  <details class="mb-2 rounded border border-rule/60 bg-muted/40 px-2 py-1">
                    <summary class="cursor-pointer text-[11px] text-secondary-foreground">
                      Trace outils ({m.tools.length})
                    </summary>
                    <ul class="mt-1 space-y-0.5 text-[11px]">
                      <For each={m.tools}>
                        {(t) => (
                          <li>
                            <span
                              class={
                                t.status === 'running'
                                  ? 'text-suggere'
                                  : t.status === 'error'
                                    ? 'text-destructive'
                                    : 'text-foreground'
                              }
                            >
                              {t.status === 'running'
                                ? '…'
                                : t.status === 'error'
                                  ? '✗'
                                  : '✓'}{' '}
                              {t.name}
                            </span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </details>
                </Show>
                <div class="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                <Show when={m.error}>
                  <div class="mt-2 text-[12px] text-destructive">{m.error}</div>
                </Show>
              </div>
            )}
          </For>
        </div>

        <form
          class="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <input
            class="flex-1 rounded-md border border-rule bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
            placeholder="Poser une question supply…"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            disabled={busy()}
          />
          <button
            type="submit"
            disabled={busy() || !input().trim()}
            class="rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy() ? '…' : 'Envoyer'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default CopilotePage
