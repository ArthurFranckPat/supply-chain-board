/**
 * Sessions Pi persistées par conversation (mémoire multi-tour).
 *
 * La session Pi accumule l'historique des messages : la réutiliser entre deux
 * requêtes HTTP = mémoire conversationnelle. In-memory, TTL glissant, cap dur.
 * Éviction = dispose session + suppression du runtime dir temporaire.
 *
 * K5 (sécu) : la Map est namespacée par userId — un attaquant qui devine un
 * `conversationId` ne peut plus lire la session Pi d'un autre user. La clé
 * composite `${userId}:${conversationId}` isole chaque utilisateur.
 *
 * M1 (concurrence) : un verrou atomique par conversation (`tryLock`/`unlock`)
 * permet au appelant de réserver la session avant tout await/yield, fermant
 * le TOCTOU sur `isStreaming` (deux POST concurrents passaient le guard
 * avant que `session.prompt()` n'ait positionné le flag).
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
/** Verrous atomiques par conversation (M1 — TOCTOU isStreaming). */
const conversationLocks = new Set<string>()

/**
 * Clé composite namespacée par user (K5). Le `userId` vient de
 * `ctx.auth.user.id` côté contrôleur ; on stringify pour tolérer
 * number (Lucid) et string.
 */
function sessionKey(userId: string | number, conversationId: string): string {
  return `${String(userId)}:${conversationId}`
}

function evict(k: string) {
  const entry = sessions.get(k)
  if (!entry) return
  sessions.delete(k)
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

export function getStoredSession(
  userId: string | number,
  conversationId: string
): StoredAgentSession | undefined {
  sweep()
  const k = sessionKey(userId, conversationId)
  const entry = sessions.get(k)
  if (entry) entry.lastUsedAt = Date.now()
  return entry
}

export function storeSession(
  userId: string | number,
  conversationId: string,
  entry: Omit<StoredAgentSession, 'lastUsedAt'>
): StoredAgentSession {
  sweep()
  const k = sessionKey(userId, conversationId)
  const stored: StoredAgentSession = { ...entry, lastUsedAt: Date.now() }
  const previous = sessions.get(k)
  if (previous) previous.dispose()
  sessions.set(k, stored)
  return stored
}

export function dropSession(userId: string | number, conversationId: string) {
  evict(sessionKey(userId, conversationId))
}

export function activeSessionCount(): number {
  sweep()
  return sessions.size
}

/**
 * Tente d'acquérir un verrou atomique sur la conversation (M1).
 * Retourne `true` si le verrou a été acquis, `false` s'il était déjà pris
 * (un autre tour est en cours). Opération synchrone = pas de fenêtre TOCTOU.
 *
 * Le verrou est indépendant du `StoredAgentSession` (qui peut être évicté
 * pendant qu'un tour stream). À relâcher impérativement par `unlock` dans
 * un `finally` — sinon la conversation reste bloquée jusqu'au redémarrage.
 */
export function tryLock(userId: string | number, conversationId: string): boolean {
  const k = sessionKey(userId, conversationId)
  if (conversationLocks.has(k)) return false
  conversationLocks.add(k)
  return true
}

/** Relâche le verrou atomique d'une conversation (M1). Idempotent. */
export function unlock(userId: string | number, conversationId: string): void {
  conversationLocks.delete(sessionKey(userId, conversationId))
}
