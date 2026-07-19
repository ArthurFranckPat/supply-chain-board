/**
 * Mapper `AgentSseEvent` → `UIMessageChunk` (AI SDK v6, UI message stream).
 *
 * Le contrôleur SSE émet ces chunks via `createUIMessageStream` +
 * `JsonToSseTransformStream` ; le front les consomme avec `useChat`
 * (`@kodehort/ai-sdk-solid`) + `DefaultChatTransport`.
 *
 * Stateful : le mapper suit les blocs texte / reasoning ouverts pour émettre
 * les `text-end` / `reasoning-end` au bon moment (un bloc se ferme quand
 * démarre un tool, une erreur ou la fin du tour).
 *
 * Règles du mapping :
 * - `session`        → `start` (messageId + metadata {sessionId, model, tools})
 * - `text_delta`     → `text-start` (1er delta) puis `text-delta`
 * - `thinking_delta` → `reasoning-start` (1er delta) puis `reasoning-delta`
 * - `tool_start`     → `tool-input-available` (args propagés)
 * - `tool_end`       → `tool-output-available` | `tool-output-error` (résultat propagé)
 * - `error`          → `error`
 * - `done`           → `finish`
 *
 * Attention : le schéma côté client (`uiMessageChunkSchema`) est en
 * `strictObject` — n'ajouter AUCUN champ hors spec aux chunks.
 */

import { randomUUID } from 'node:crypto'

import type { UIMessageChunk } from 'ai'

import type { AgentSseEvent } from '#services/agent_service'

/** Metadata transportée sur le chunk `start` (remplace l'event `session`). */
export interface AgentMessageMetadata {
  sessionId?: string
  model?: string
  tools?: string[]
}

function toErrorText(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result) ?? 'Erreur outil inconnue'
  } catch {
    return 'Erreur outil inconnue'
  }
}

export class AgentUIMessageMapper {
  private readonly messageId = randomUUID()
  private textBlockId: string | null = null
  private reasoningBlockId: string | null = null
  private counter = 0

  map(event: AgentSseEvent): UIMessageChunk[] {
    switch (event.type) {
      case 'session':
        return [
          {
            type: 'start',
            messageId: this.messageId,
            messageMetadata: {
              sessionId: event.sessionId,
              model: event.model,
              tools: event.tools,
            } satisfies AgentMessageMetadata,
          },
        ]

      case 'text_delta': {
        const chunks = this.closeReasoning()
        if (!this.textBlockId) {
          this.textBlockId = `text-${++this.counter}`
          chunks.push({ type: 'text-start', id: this.textBlockId })
        }
        chunks.push({ type: 'text-delta', id: this.textBlockId, delta: event.text })
        return chunks
      }

      case 'thinking_delta': {
        const chunks = this.closeText()
        if (!this.reasoningBlockId) {
          this.reasoningBlockId = `reasoning-${++this.counter}`
          chunks.push({ type: 'reasoning-start', id: this.reasoningBlockId })
        }
        chunks.push({ type: 'reasoning-delta', id: this.reasoningBlockId, delta: event.text })
        return chunks
      }

      case 'tool_start': {
        const chunks = this.closeAll()
        chunks.push({
          type: 'tool-input-available',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.args ?? {},
        })
        return chunks
      }

      case 'tool_end': {
        if (event.isError) {
          return [
            {
              type: 'tool-output-error',
              toolCallId: event.toolCallId,
              errorText: toErrorText(event.result),
            },
          ]
        }
        return [
          {
            type: 'tool-output-available',
            toolCallId: event.toolCallId,
            output: event.result ?? null,
          },
        ]
      }

      case 'error': {
        const chunks = this.closeAll()
        chunks.push({ type: 'error', errorText: event.message })
        return chunks
      }

      case 'done': {
        const chunks = this.closeAll()
        chunks.push({ type: 'finish', finishReason: 'stop' })
        return chunks
      }
    }
  }

  private closeText(): UIMessageChunk[] {
    if (!this.textBlockId) return []
    const chunks: UIMessageChunk[] = [{ type: 'text-end', id: this.textBlockId }]
    this.textBlockId = null
    return chunks
  }

  private closeReasoning(): UIMessageChunk[] {
    if (!this.reasoningBlockId) return []
    const chunks: UIMessageChunk[] = [{ type: 'reasoning-end', id: this.reasoningBlockId }]
    this.reasoningBlockId = null
    return chunks
  }

  private closeAll(): UIMessageChunk[] {
    return [...this.closeText(), ...this.closeReasoning()]
  }
}
