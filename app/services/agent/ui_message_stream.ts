/**
 * Mapper `AgentSseEvent` → `UIMessageChunk` (AI SDK v6, UI message stream).
 *
 * Le contrôleur SSE émet ces chunks via `createUIMessageStream` +
 * `JsonToSseTransformStream` ; le front les consomme avec `useChat`
 * (`@ai-sdk/react`) + `DefaultChatTransport`.
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
import { mcpAppForTool } from '#services/agent/mcp_apps'

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

/**
 * `output` d'un `tool-output-available`, enveloppé quand le tool porte une app.
 *
 * Le chunk est en `strictObject` côté client : impossible d'ajouter un champ
 * frère pour l'app. `output` devient donc une enveloppe marquée, que le front
 * sait défaire (`readToolOutput`). Sans app, `output` reste le payload nu —
 * l'historique déjà persisté avant #89 continue de s'afficher.
 *
 * **Une seule implémentation, deux appelants** : ce mapper (le stream) et
 * `AgentMessageAssembler` (la persistance). Quand ils divergeaient, l'app
 * s'affichait pendant le tour puis disparaissait au rechargement de la
 * conversation — le message stocké n'ayant plus que le payload nu.
 */
export function toStoredToolOutput(event: {
  result?: unknown
  ui?: { resourceUri: string }
}): unknown {
  return event.ui ? { __mcpUi: event.ui, data: event.result ?? null } : (event.result ?? null)
}

/**
 * Ré-attache le lien vers l'app aux messages relus d'une conversation.
 *
 * Deux populations en ont besoin, pour la même raison — leur `output` a été
 * écrit sans enveloppe : les tours enregistrés avant #89, et ceux enregistrés
 * entre #89 et le correctif de persistance. La donnée, elle, est intacte : seul
 * le `resourceUri` manque, et il se retrouve par le nom du tool.
 *
 * Dérivation volontairement limitée à la lecture : le stream reste la seule
 * source d'enveloppe à l'écriture. Un tool dont l'app a été retirée depuis
 * n'en regagne pas — `mcpAppForTool` fait foi au moment où on relit.
 */
export function rehydrateAppLinks<T extends { parts?: unknown[] }>(messages: T[]): T[] {
  for (const message of messages) {
    if (!Array.isArray(message.parts)) continue
    for (const part of message.parts) {
      if (!part || typeof part !== 'object') continue
      const p = part as { type?: string; state?: string; output?: unknown }
      if (typeof p.type !== 'string' || !p.type.startsWith('tool-')) continue
      if (p.state !== 'output-available') continue
      if (p.output && typeof p.output === 'object' && '__mcpUi' in p.output) continue

      const app = mcpAppForTool(p.type.slice('tool-'.length))
      if (!app) continue
      p.output = toStoredToolOutput({
        result: p.output,
        ui: { resourceUri: app.resourceUri },
      })
    }
  }
  return messages
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
            output: toStoredToolOutput(event),
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
