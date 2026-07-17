/**
 * Sessions Pi persistées par conversation (mémoire multi-tour).
 *
 * La session Pi accumule l'historique des messages : la réutiliser entre deux
 * requêtes HTTP = mémoire conversationnelle. In-memory, TTL glissant, cap dur.
 * Éviction = dispose session + suppression du runtime dir temporaire.
 */

import type { AgentSession } from '@earendil-works/pi-coding-agent'

export interface StoredAgentSession {
  session: AgentSession
  dispose: () => void
  modelLabel: string
  toolNames: string[]
  sessionId: string
  lastUsedAt: number
}

/** TTL d'inactivité avant éviction (30 min). */
const SESSION_TTL_MS = 30 * 60 * 1000
/** Cap dur de sessions vivantes (volume interne faible — Q coût v1). */
const MAX_SESSIONS = 30

const sessions = new Map<string, StoredAgentSession>()

function evict(conversationId: string) {
  const entry = sessions.get(conversationId)
  if (!entry) return
  sessions.delete(conversationId)
  entry.dispose()
}

function sweep(now = Date.now()) {
  for (const [id, entry] of sessions) {
    if (now - entry.lastUsedAt > SESSION_TTL_MS) evict(id)
  }
  // Cap dur : évince les plus anciennes au-delà de MAX_SESSIONS.
  if (sessions.size > MAX_SESSIONS) {
    const byAge = [...sessions.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)
    for (const [id] of byAge.slice(0, sessions.size - MAX_SESSIONS)) evict(id)
  }
}

export function getStoredSession(conversationId: string): StoredAgentSession | undefined {
  sweep()
  const entry = sessions.get(conversationId)
  if (entry) entry.lastUsedAt = Date.now()
  return entry
}

export function storeSession(
  conversationId: string,
  entry: Omit<StoredAgentSession, 'lastUsedAt'>
): StoredAgentSession {
  sweep()
  const stored: StoredAgentSession = { ...entry, lastUsedAt: Date.now() }
  const previous = sessions.get(conversationId)
  if (previous) previous.dispose()
  sessions.set(conversationId, stored)
  return stored
}

export function dropSession(conversationId: string) {
  evict(conversationId)
}

export function activeSessionCount(): number {
  sweep()
  return sessions.size
}
