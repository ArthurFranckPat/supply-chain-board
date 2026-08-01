/**
 * Télémétrie d'un tour du copilote — en mémoire, sans dépendance Adonis.
 *
 * Pourquoi : le copilote était le seul chemin du produit sans aucune mesure.
 * Ni durée, ni tokens, ni nombre d'étapes. Conséquence pratique : impossible
 * de trancher une décision d'architecture qui repose sur le coût réel des
 * tours (Code Mode, issue #93, dont la Phase 0 pose comme gate « métriques :
 * tokens, latence » — métriques qui n'existaient pas).
 *
 * Le chiffre qui décide #93 est `toolCallsHistogram` : la part des tours à 2
 * appels de tool ou plus. Code Mode n'économise que sur ceux-là ; si l'usage
 * réel est majoritairement mono-appel, le sandbox ne remboursera jamais son
 * risque.
 *
 * Même posture que `perf_metrics` (issue #33) : ring buffer borné, pas de
 * persistance, reset au redémarrage. Aucun import Adonis — le module est chargé
 * par le runtime agent, que le smoke et le golden eval démarrent hors HTTP.
 *
 * Aucune donnée métier n'est conservée : ni le message, ni la réponse, ni les
 * arguments des tools. Seulement des compteurs et des noms de tools.
 */

/** Échantillons conservés (fenêtre glissante). Chat interne = volume faible. */
const MAX_SAMPLES = 500

/** Tokens facturés sur le tour (delta des cumuls de session Pi). */
export interface AgentTurnTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export type AgentTurnOutcome = 'ok' | 'error' | 'aborted' | 'rejected'

export interface AgentTurnSample {
  /** Epoch ms de fin de tour. */
  at: number
  model: string
  /** Session conversationnelle réutilisée (vs jetable : smoke, eval). */
  persistent: boolean
  durationMs: number
  /** Time to first token — premier delta texte ou thinking. Null si aucun. */
  ttftMs: number | null
  toolCalls: number
  toolErrors: number
  /** Noms des tools appelés, dans l'ordre. Pas les arguments. */
  tools: string[]
  /** Null quand la session Pi ne rapporte pas d'usage (provider muet). */
  tokens: AgentTurnTokens | null
  costUsd: number | null
  contextTokens: number | null
  contextPercent: number | null
  outcome: AgentTurnOutcome
  /** Message d'erreur du tour, tronqué. Absent si `outcome === 'ok'`. */
  error?: string
}

export interface AgentTurnStats {
  count: number
  /** Tours ayant enchaîné ≥ 2 appels de tools — la population que Code Mode viserait. */
  multiStepCount: number
  /** Part des tours multi-étapes, 0–1. LE chiffre du gate #93. */
  multiStepShare: number
  /** Nombre de tours par nombre d'appels de tools : { "0": 3, "1": 12, … }. */
  toolCallsHistogram: Record<string, number>
  durationMs: { p50: number; p95: number; max: number }
  ttftMs: { p50: number; p95: number }
  toolCalls: { avg: number; p50: number; p95: number; max: number }
  tokens: { inputAvg: number; outputAvg: number; totalAvg: number; totalSum: number }
  costUsdSum: number
  outcomes: Record<AgentTurnOutcome, number>
  /** Par tool : nombre d'appels et nombre de tours distincts qui l'ont utilisé. */
  toolUsage: Array<{ tool: string; calls: number; turns: number }>
}

/** Percentile nearest-rank — même calcul que `perf_metrics`, pour comparer sans surprise. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]
}

function round(n: number): number {
  return Math.round(n)
}

class AgentTurnMetrics {
  private samples: AgentTurnSample[] = []
  /** Compteur cumulé non borné — distingue le trafic réel de la fenêtre. */
  private total = 0

  record(sample: AgentTurnSample): void {
    this.samples.push(sample)
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
    this.total += 1
  }

  /** Derniers tours, du plus récent au plus ancien. */
  recent(limit = 20): AgentTurnSample[] {
    return this.samples.slice(-limit).reverse()
  }

  snapshot(): AgentTurnStats {
    const list = this.samples
    const outcomes: Record<AgentTurnOutcome, number> = {
      ok: 0,
      error: 0,
      aborted: 0,
      rejected: 0,
    }
    const histogram: Record<string, number> = {}
    const toolCalls: number[] = []
    const durations: number[] = []
    const ttfts: number[] = []
    const calls = new Map<string, number>()
    const turnsWithTool = new Map<string, number>()

    let multiStep = 0
    let inputSum = 0
    let outputSum = 0
    let totalSum = 0
    let tokenSamples = 0
    let costSum = 0

    for (const s of list) {
      outcomes[s.outcome] += 1
      durations.push(s.durationMs)
      if (s.ttftMs !== null) ttfts.push(s.ttftMs)
      toolCalls.push(s.toolCalls)
      histogram[String(s.toolCalls)] = (histogram[String(s.toolCalls)] ?? 0) + 1
      if (s.toolCalls >= 2) multiStep += 1

      for (const t of s.tools) calls.set(t, (calls.get(t) ?? 0) + 1)
      for (const t of new Set(s.tools)) turnsWithTool.set(t, (turnsWithTool.get(t) ?? 0) + 1)

      if (s.tokens) {
        inputSum += s.tokens.input
        outputSum += s.tokens.output
        totalSum += s.tokens.total
        tokenSamples += 1
      }
      if (s.costUsd !== null) costSum += s.costUsd
    }

    const sortedDur = [...durations].sort((a, b) => a - b)
    const sortedTtft = [...ttfts].sort((a, b) => a - b)
    const sortedCalls = [...toolCalls].sort((a, b) => a - b)
    const n = list.length || 1

    return {
      count: this.total,
      multiStepCount: multiStep,
      multiStepShare: list.length === 0 ? 0 : multiStep / list.length,
      toolCallsHistogram: histogram,
      durationMs: {
        p50: round(percentile(sortedDur, 50)),
        p95: round(percentile(sortedDur, 95)),
        max: round(sortedDur[sortedDur.length - 1] ?? 0),
      },
      ttftMs: {
        p50: round(percentile(sortedTtft, 50)),
        p95: round(percentile(sortedTtft, 95)),
      },
      toolCalls: {
        avg: Math.round((toolCalls.reduce((a, b) => a + b, 0) / n) * 100) / 100,
        p50: percentile(sortedCalls, 50),
        p95: percentile(sortedCalls, 95),
        max: sortedCalls[sortedCalls.length - 1] ?? 0,
      },
      tokens: {
        inputAvg: tokenSamples === 0 ? 0 : round(inputSum / tokenSamples),
        outputAvg: tokenSamples === 0 ? 0 : round(outputSum / tokenSamples),
        totalAvg: tokenSamples === 0 ? 0 : round(totalSum / tokenSamples),
        totalSum,
      },
      costUsdSum: Math.round(costSum * 10_000) / 10_000,
      outcomes,
      toolUsage: [...calls.entries()]
        .map(([tool, c]) => ({ tool, calls: c, turns: turnsWithTool.get(tool) ?? 0 }))
        .sort((a, b) => b.calls - a.calls),
    }
  }

  reset(): void {
    this.samples = []
    this.total = 0
  }
}

/** Singleton partagé par le runtime agent et le contrôleur. */
const agentTurnMetrics = new AgentTurnMetrics()
export default agentTurnMetrics

/**
 * Enregistre le tour et en émet une ligne de log structurée.
 *
 * Le log passe par un import dynamique : `agent_service` est chargé hors HTTP
 * par le smoke et le golden eval, où le conteneur Adonis n'est pas démarré et
 * où l'import statique du logger échouerait. Best-effort de bout en bout — une
 * télémétrie ne doit jamais casser un tour déjà rendu à l'utilisateur.
 */
export function recordAgentTurn(sample: AgentTurnSample): void {
  agentTurnMetrics.record(sample)
  void emitTurnLog(sample)
}

async function emitTurnLog(sample: AgentTurnSample): Promise<void> {
  try {
    const { default: logger } = await import('@adonisjs/core/services/logger')
    logger.info({
      agentTurn: true,
      model: sample.model,
      outcome: sample.outcome,
      ms: sample.durationMs,
      ttftMs: sample.ttftMs,
      toolCalls: sample.toolCalls,
      toolErrors: sample.toolErrors,
      tools: sample.tools,
      tokens: sample.tokens?.total ?? null,
      tokensIn: sample.tokens?.input ?? null,
      tokensOut: sample.tokens?.output ?? null,
      costUsd: sample.costUsd,
      contextPercent: sample.contextPercent,
      ...(sample.error ? { error: sample.error } : {}),
    })
  } catch {
    /* hors conteneur Adonis (smoke, eval) — la mesure reste dans le ring buffer */
  }
}
