/**
 * Couche agentique v1 — runtime Pi headless (étape 1).
 *
 * Spec : `.planning/agentic-layer-plan.md`
 *
 * - Runtime = `@earendil-works/pi-coding-agent` (SDK)
 * - Modèle  = GLM 5.2 via provider `zai` (`ZAI_API_KEY`)
 * - Sécu   = **aucun** builtin (bash/read/write/edit) : allowlist explicite
 *            des custom tools. (Note Pi 0.80 : `noTools: "all"` vide aussi
 *            les custom tools — d'où l'allowlist `tools: customNames`.)
 * - Session = in-memory, éphémère par requête (pas de cross-session v1)
 * - Data    = caches board (ultérieur) — zéro SOAP ici.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import env from '#start/env'
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all'
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent'

import { buildAgentSystemPrompt } from '#services/agent/system_prompt'
import { agentToolNames, buildAgentTools } from '#services/agent/tools'
import {
  getStoredSession,
  storeSession,
  tryLock,
  unlock,
  type StoredAgentSession,
} from '#services/agent/session_store'

/** Provider / model verrouillés (Q12). */
export const AGENT_PROVIDER = 'zai' as const
export const AGENT_MODEL_ID = 'glm-5.2' as const

const BUILTIN_TOOL_NAMES = new Set(['bash', 'read', 'write', 'edit', 'grep', 'find', 'ls'])

/**
 * Événement SSE normalisé (front chat + smoke).
 *
 * `args` / `result` sont additifs (stream UI AI SDK — cf.
 * `agent/ui_message_stream.ts`) : les consommateurs historiques (smoke,
 * golden eval) les ignorent.
 */
export type AgentSseEvent =
  | { type: 'session'; sessionId: string; model: string; tools: string[] }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolCallId: string; args?: unknown }
  | {
      type: 'tool_end'
      toolName: string
      toolCallId: string
      isError: boolean
      result?: unknown
    }
  | { type: 'error'; message: string }
  | { type: 'done'; sessionId: string }

export interface RunAgentOptions {
  /** Message user. */
  message: string
  /**
   * Id de conversation (front). Fourni → la session Pi est réutilisée entre
   * les tours (mémoire multi-tour, TTL 30 min). Absent → session jetable.
   */
  conversationId?: string
  /**
   * Id de l'user authentifié (K5 IDOR). Requis dès que `conversationId` est
   * fourni : la Map est namespacée `${userId}:${conversationId}` pour qu'un
   * attaquant ne puisse pas deviner un id de conversation et lire la session
   * Pi d'autrui (historique + résultats d'outils = données ERP).
   */
  userId?: string | number
  /** Contexte écran injecté (IDs seulement) — préfixé au message. */
  screenContext?: {
    page?: string
    selection?: Record<string, string | number | null | undefined>
    filters?: Record<string, string | number | null | undefined>
  }
  /** Override tools (tests). Défaut = buildAgentTools(). */
  tools?: ToolDefinition[]
  /** Abort HTTP client disconnect. */
  signal?: AbortSignal
}

type PiEvent = Parameters<Parameters<AgentSession['subscribe']>[0]>[0]

/** Emplacement isolé auth/settings Pi — hors du repo user (`~/.pi`). */
function ensureAgentRuntimeDir(): string {
  const base = join(tmpdir(), 'supply-chain-board-agent')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, 'sess-'))
}

function formatScreenContext(ctx: RunAgentOptions['screenContext']): string {
  if (!ctx) return ''
  const lines: string[] = ['[contexte écran]']
  if (ctx.page) lines.push(`page=${ctx.page}`)
  if (ctx.selection) {
    for (const [k, v] of Object.entries(ctx.selection)) {
      if (v === undefined || v === null || v === '') continue
      lines.push(`selection.${k}=${v}`)
    }
  }
  if (ctx.filters) {
    for (const [k, v] of Object.entries(ctx.filters)) {
      if (v === undefined || v === null || v === '') continue
      lines.push(`filter.${k}=${v}`)
    }
  }
  if (lines.length === 1) return ''
  return `${lines.join('\n')}\n\n`
}

function mapPiEvent(event: PiEvent): AgentSseEvent[] {
  switch (event.type) {
    case 'message_update': {
      const inner = event.assistantMessageEvent
      if (inner.type === 'text_delta' && inner.delta) {
        return [{ type: 'text_delta', text: inner.delta }]
      }
      if (inner.type === 'thinking_delta' && 'delta' in inner && inner.delta) {
        return [{ type: 'thinking_delta', text: String(inner.delta) }]
      }
      return []
    }
    case 'tool_execution_start':
      return [
        {
          type: 'tool_start',
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          args: event.args,
        },
      ]
    case 'tool_execution_end':
      return [
        {
          type: 'tool_end',
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          isError: Boolean(event.isError),
          result: event.result,
        },
      ]
    default:
      return []
  }
}

/**
 * Résout modèle + posture d'auth. Lance une erreur explicite si la clé ou le
 * modèle manquent (gate Q12 — prouver le provider dès le boot du chat).
 */
export async function createAgentRuntime(tools: ToolDefinition[] = buildAgentTools()): Promise<{
  session: AgentSession
  dispose: () => void
  modelLabel: string
  toolNames: string[]
  sessionId: string
}> {
  const apiKey = env.get('ZAI_API_KEY')
  if (!apiKey) {
    throw new Error(
      'ZAI_API_KEY manquante. Renseigner la clé Z.AI (provider `zai`, modèle glm-5.2).'
    )
  }

  const model = getBuiltinModel(AGENT_PROVIDER, AGENT_MODEL_ID)
  if (!model) {
    throw new Error(
      `Modèle introuvable dans pi-ai : ${AGENT_PROVIDER}/${AGENT_MODEL_ID}. Vérifier @earendil-works/pi-ai.`
    )
  }

  const runtimeDir = ensureAgentRuntimeDir()
  const modelRuntime = await ModelRuntime.create({
    authPath: join(runtimeDir, 'auth.json'),
    modelsPath: join(runtimeDir, 'models.json'),
  })
  // Override runtime (non persisté) — la clé ne touche jamais ~/.pi/agent.
  modelRuntime.setRuntimeApiKey(AGENT_PROVIDER, apiKey)

  const toolNames = agentToolNames(tools)
  // Allowlist stricte = barrière sécu #1. Les builtins ne sont jamais listés.
  // (Équivalent intentionnel de noTools:"all" + customTools, corrigé pour Pi 0.80.)
  const loader = new DefaultResourceLoader({
    cwd: runtimeDir,
    agentDir: runtimeDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => buildAgentSystemPrompt(new Date()),
    appendSystemPromptOverride: () => [],
  })
  await loader.reload()

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: runtimeDir,
    agentDir: runtimeDir,
    model,
    modelRuntime,
    // Q12 : raisonnement causal — thinking actif (clampé aux capacités modèle).
    thinkingLevel: 'medium',
    tools: toolNames,
    customTools: tools,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(runtimeDir),
  })

  const cleanupDir = () => {
    try {
      rmSync(runtimeDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  }

  if (modelFallbackMessage) {
    // Le fallback silencieux vers un autre modèle casserait Q12.
    session.dispose()
    cleanupDir()
    throw new Error(`Modèle non appliqué : ${modelFallbackMessage}`)
  }

  const active = session.agent.state.tools.map((t) => t.name)
  const leaked = active.filter((n) => BUILTIN_TOOL_NAMES.has(n))
  if (leaked.length > 0) {
    session.dispose()
    cleanupDir()
    throw new Error(`Barrière sécu rompue — builtins exposés : ${leaked.join(', ')}`)
  }

  return {
    session,
    dispose: () => {
      try {
        session.dispose()
      } catch {
        /* ignore double-dispose */
      }
      cleanupDir()
    },
    modelLabel: `${AGENT_PROVIDER}/${AGENT_MODEL_ID}`,
    toolNames: active,
    sessionId: session.sessionId,
  }
}

/**
 * Résout la session du tour : réutilisée (conversationId, mémoire multi-tour)
 * ou jetable (pas d'id — smoke/tests).
 */
async function resolveTurnSession(options: RunAgentOptions): Promise<{
  runtime: Pick<StoredAgentSession, 'session' | 'dispose' | 'modelLabel' | 'toolNames' | 'sessionId'>
  persistent: boolean
}> {
  const tools = options.tools ?? buildAgentTools()
  const convId = options.conversationId?.trim()
  if (!convId) {
    return { runtime: await createAgentRuntime(tools), persistent: false }
  }

  // K5 — userId obligatoire pour les sessions persistantes : la Map est
  // namespacée `${userId}:${conversationId}`, sinon un attaquant qui devine
  // un conversationId récupère la session Pi d'autrui.
  const userId = options.userId
  if (userId === undefined) {
    throw new Error(
      'userId requis avec conversationId (K5 : namespace anti-IDOR obligatoire).'
    )
  }

  const existing = getStoredSession(userId, convId)
  if (existing) {
    // Defense-in-depth : le verrou atomique (runAgentTurn) est la barrière
    // primaire contre le TOCTOU. Ce check reste en seconde ligne.
    if (existing.session.isStreaming) {
      throw new Error('Une réponse est déjà en cours pour cette conversation.')
    }
    return { runtime: existing, persistent: true }
  }

  const created = await createAgentRuntime(tools)
  storeSession(userId, convId, created)
  return { runtime: created, persistent: true }
}

/**
 * Exécute un tour agent et yield les événements SSE normalisés.
 * Session : persistée par conversation (TTL 30 min) si `conversationId`,
 * sinon jetable (dispose en fin de stream).
 *
 * M1 (concurrence) : pour les sessions conversationnelles, on acquiert un
 * verrou atomique `tryLock(userId, conversationId)` AVANT tout await/yield.
 * Sans cela, deux POST quasi-simultanés sur la même conversation passent
 * tous les deux le guard `isStreaming=false` (le générateur suspend au yield
 * `{ type: 'session' }` avant que `session.prompt()` n'ait retourné), puis
 * déclenchent deux streams en parallèle sur la même session Pi. Le verrou
 * est relâché dans le `finally` extérieur quoi qu'il arrive.
 */
export async function* runAgentTurn(
  options: RunAgentOptions
): AsyncGenerator<AgentSseEvent, void, void> {
  const convId = options.conversationId?.trim()
  const userId = options.userId
  const needsLock = Boolean(convId && userId !== undefined)

  // M1 — Verrou atomique sync pré-yield : aucun await entre ce check et la
  // prise effective du verrou → pas de fenêtre TOCTOU.
  if (needsLock) {
    if (!tryLock(userId as string | number, convId as string)) {
      throw new Error('Une réponse est déjà en cours pour cette conversation.')
    }
  }

  try {
    const { runtime, persistent } = await resolveTurnSession(options)
    const { session, dispose, modelLabel, toolNames, sessionId } = runtime

    yield { type: 'session', sessionId, model: modelLabel, tools: toolNames }

    const queue: PiEvent[] = []
    let wake: (() => void) | null = null
    let finished = false
    let fatalMessage: string | null = null

    const waitEvent = (): Promise<void> =>
      new Promise((resolve) => {
        if (queue.length > 0 || finished) {
          resolve()
          return
        }
        wake = () => {
          wake = null
          resolve()
        }
      })

    const unsub = session.subscribe((event) => {
      queue.push(event)
      wake?.()
    })

    const onAbort = () => {
      session.abort().catch(() => {})
    }
    if (options.signal) {
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, { once: true })
    }

    const userText = `${formatScreenContext(options.screenContext)}${options.message}`

    const promptPromise = session
      .prompt(userText)
      .catch((err: unknown) => {
        fatalMessage = err instanceof Error ? err.message : String(err)
      })
      .finally(() => {
        finished = true
        wake?.()
      })

    try {
      while (!finished || queue.length > 0) {
        if (queue.length === 0) {
          await waitEvent()
          continue
        }
        const event = queue.shift()!
        for (const e of mapPiEvent(event)) yield e
      }
      await promptPromise
      if (fatalMessage) {
        yield { type: 'error', message: fatalMessage }
      }
      yield { type: 'done', sessionId }
    } finally {
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort)
      }
      unsub()
      // Session conversationnelle : on la garde vivante (mémoire multi-tour).
      // L'éviction TTL/cap du session_store s'occupe du dispose.
      if (!persistent) dispose()
    }
  } finally {
    // M1 — Relâche le verrou atomique dans tous les chemins (throw, return,
    // fin normale). Sans cela, la conversation resterait bloquée jusqu'au
    // redémarrage processus.
    if (needsLock) {
      unlock(userId as string | number, convId as string)
    }
  }
}

/**
 * Vérifie purement provider + modèle + clé sans appeler le LLM
 * (healthcheck léger).
 */
export function assertAgentProviderConfigured(): {
  provider: string
  model: string
  hasKey: boolean
} {
  const model = getBuiltinModel(AGENT_PROVIDER, AGENT_MODEL_ID)
  const hasKey = Boolean(env.get('ZAI_API_KEY'))
  if (!model) {
    throw new Error(`Modèle ${AGENT_PROVIDER}/${AGENT_MODEL_ID} absent de pi-ai`)
  }
  return {
    provider: AGENT_PROVIDER,
    model: AGENT_MODEL_ID,
    hasKey,
  }
}
