/**
 * Compaction déterministe de l'historique d'une conversation (pas d'appel LLM).
 *
 * Produit un transcript condensé — questions utilisateur + réponses du
 * copilote tronquées — destiné à être réinjecté dans le system prompt d'une
 * session Pi fraîchement recréée (après éviction TTL / redémarrage), pour que
 * le modèle retrouve le fil sans re-payer tout l'historique token par token.
 *
 * Les blocs reasoning et le détail des appels d'outils sont ignorés (bruit
 * pour la mémoire long terme) ; seul le texte final compte.
 */

import { isTextUIPart } from 'ai'

import type { StoredChatMessage } from '#services/conversation_store'

/** Réponse assistant tronquée au-delà de cette longueur. */
const ANSWER_CHAR_CAP = 400
/** Nombre max de messages conservés (les plus récents). */
const MAX_MESSAGES = 40
/** Garde-fou global sur la taille du bloc injecté. */
const MAX_BLOCK_CHARS = 6000

function textOf(message: StoredChatMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join('\n')
    .trim()
}

function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text
  return `${text.slice(0, cap)}…`
}

export function compactHistory(messages: StoredChatMessage[]): string {
  const recent = messages.slice(-MAX_MESSAGES)
  const lines: string[] = []

  for (const message of recent) {
    const text = textOf(message)
    if (!text) continue
    if (message.role === 'user') {
      lines.push(`Utilisateur : ${truncate(text, ANSWER_CHAR_CAP)}`)
    } else if (message.role === 'assistant') {
      lines.push(`Copilote : ${truncate(text, ANSWER_CHAR_CAP)}`)
    }
  }

  if (lines.length === 0) return ''

  let block = [
    '[historique de la conversation — résumé des échanges avant ce tour]',
    ...lines,
  ].join('\n')

  if (block.length > MAX_BLOCK_CHARS) {
    block = `${block.slice(0, MAX_BLOCK_CHARS)}…`
  }
  return block
}
