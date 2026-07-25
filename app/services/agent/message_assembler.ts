/**
 * Reconstruit le `UIMessage` assistant depuis les `AgentSseEvent` d'un tour,
 * pour persistance (historique copilote). Reproduit l'ordre d'ouverture /
 * fermeture des blocs du mapper `ui_message_stream.ts` (un bloc texte se ferme
 * quand démarre un reasoning ou un tool, etc.) afin que le message rechargé
 * re-rend à l'identique (tool tokens + inspecteur inclus).
 *
 * Les tool parts prennent la forme dynamique standard AI SDK
 * (`type: 'tool-<name>'` + `state`/`input`/`output`/`errorText`) — la même que
 * le client construit depuis les chunks `tool-input-available` /
 * `tool-output-available` / `tool-output-error`.
 */

import { randomUUID } from 'node:crypto'

import type { AgentSseEvent } from '#services/agent_service'
import type { StoredChatMessage } from '#services/conversation_store'

type Part = StoredChatMessage['parts'][number]

interface TextPart {
  type: 'text'
  text: string
}
interface ReasoningPart {
  type: 'reasoning'
  text: string
}
interface ToolPart {
  type: `tool-${string}`
  toolCallId: string
  state: 'input-available' | 'output-available' | 'output-error'
  input: unknown
  output?: unknown
  errorText?: string
}

function toErrorText(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result) ?? 'Erreur outil inconnue'
  } catch {
    return 'Erreur outil inconnue'
  }
}

export function makeUserMessage(text: string): StoredChatMessage {
  return {
    id: randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}

/**
 * Accumulateur stateful : `feed(event)` à chaque événement du tour, puis
 * `toMessage()` pour figer le `UIMessage` assistant (à appeler après `done`).
 */
export class AgentMessageAssembler {
  private readonly messageId = randomUUID()
  private readonly parts: Part[] = []
  private readonly toolsByCallId = new Map<string, ToolPart>()
  private currentText: TextPart | null = null
  private currentReasoning: ReasoningPart | null = null
  private metadata: StoredChatMessage['metadata']

  feed(event: AgentSseEvent): void {
    switch (event.type) {
      case 'session':
        this.metadata = {
          sessionId: event.sessionId,
          model: event.model,
          tools: event.tools,
        }
        return

      case 'text_delta': {
        this.closeReasoning()
        if (!this.currentText) {
          this.currentText = { type: 'text', text: '' }
          this.parts.push(this.currentText)
        }
        this.currentText.text += event.text
        return
      }

      case 'thinking_delta': {
        this.closeText()
        if (!this.currentReasoning) {
          this.currentReasoning = { type: 'reasoning', text: '' }
          this.parts.push(this.currentReasoning)
        }
        this.currentReasoning.text += event.text
        return
      }

      case 'tool_start': {
        this.closeAll()
        const part: ToolPart = {
          type: `tool-${event.toolName}`,
          toolCallId: event.toolCallId,
          state: 'input-available',
          input: event.args ?? {},
        }
        this.toolsByCallId.set(event.toolCallId, part)
        this.parts.push(part as Part)
        return
      }

      case 'tool_end': {
        const part = this.toolsByCallId.get(event.toolCallId)
        if (!part) return
        if (event.isError) {
          part.state = 'output-error'
          part.errorText = toErrorText(event.result)
        } else {
          part.state = 'output-available'
          part.output = event.result ?? null
        }
        return
      }

      // `error` / `done` : aucune part à ajouter (le texte d'erreur SSE n'est
      // pas une part du message ; `done` clôture simplement le tour).
      default:
        return
    }
  }

  toMessage(): StoredChatMessage {
    this.closeAll()
    return {
      id: this.messageId,
      role: 'assistant',
      parts: this.parts,
      metadata: this.metadata,
    }
  }

  private closeText(): void {
    this.currentText = null
  }

  private closeReasoning(): void {
    this.currentReasoning = null
  }

  private closeAll(): void {
    this.closeText()
    this.closeReasoning()
  }
}
