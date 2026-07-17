/**
 * Exécute le jeu de cas d'or contre GLM avec tools mockés.
 *
 * Les mocks remplacent l'I/O métier : on mesure UNIQUEMENT le raisonnement
 * d'orchestration + citation de racine (gate Q12/Q13).
 */

import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'
import { createAgentRuntime } from '#services/agent_service'
import { GOLDEN_CASES, type GoldenCase, type GoldenToolName } from '#services/agent/eval/golden_cases'
import { scoreCase, type ScoreResult } from '#services/agent/eval/scorer'

function resolveMock(
  gc: GoldenCase,
  tool: GoldenToolName,
  params: Record<string, unknown>
): unknown {
  const entry = gc.mocks[tool]
  if (entry === undefined) {
    return {
      error: `Tool ${tool} non mocké pour ${gc.id}`,
      _source: tool,
    }
  }
  if (entry && typeof entry === 'object' && 'byArgs' in (entry as object)) {
    const bag = entry as {
      byArgs: Array<{ match: Record<string, unknown>; result: unknown }>
    }
    for (const row of bag.byArgs) {
      const ok = Object.entries(row.match).every(([k, v]) => {
        const got = params[k]
        if (typeof v === 'string' && typeof got === 'string') {
          return got.toUpperCase().includes(String(v).toUpperCase()) || got === v
        }
        return got === v
      })
      if (ok) return row.result
    }
    return bag.byArgs[0]?.result ?? { error: 'no mock match', _source: tool }
  }
  return entry
}

function buildMockTools(gc: GoldenCase): ToolDefinition[] {
  const wrap = (name: GoldenToolName, description: string, parameters: ReturnType<typeof Type.Object>) =>
    defineTool({
      name,
      label: name,
      description,
      parameters,
      execute: async (_id, params) => {
        const payload = resolveMock(gc, name, params as Record<string, unknown>)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          details: payload as Record<string, unknown>,
        }
      },
    })

  return [
    wrap(
      'listerOF',
      'Liste les OF du pool (statuts 1 ferme/2 planifié/3 suggéré, article, famille produit, horizon). ' +
        "Découverte : à appeler AVANT de demander une liste d'OF à l'utilisateur. Citation [listerOF: …].",
      Type.Object({
        statuts: Type.Optional(Type.Array(Type.Number())),
        article: Type.Optional(Type.String()),
        famille: Type.Optional(
          Type.String({ description: 'Famille YFAMSTAT7_0 ou typologie TSICOD_4 (ex. ESH, BDH60)' })
        ),
        horizonDays: Type.Optional(Type.Number()),
        from: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number()),
      })
    ),
    wrap(
      'rechercherArticle',
      'Recherche article par code partiel ou libellé. Citation [rechercherArticle: …].',
      Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()) })
    ),
    wrap(
      'getVerdict',
      "Verdict photo rupture d'un OF. Citation [getVerdict: …].",
      Type.Object({ numOf: Type.String() })
    ),
    wrap(
      'descendreBOM',
      'Descente BOM récursive, vraie racine. Citation [descendreBOM: …].',
      Type.Object({ numOf: Type.String() })
    ),
    wrap(
      'getPromise',
      'CTP date optimiste + engageante. Citation [getPromise: …].',
      Type.Object({
        article: Type.String(),
        quantity: Type.Number(),
        from: Type.Optional(Type.String()),
      })
    ),
    wrap(
      'listerRetardsPrevus',
      'Liste retards prévus sur horizon. Citation [listerRetardsPrevus: …].',
      Type.Object({
        horizonDays: Type.Optional(Type.Number()),
        article: Type.Optional(Type.String()),
        client: Type.Optional(Type.String()),
        from: Type.Optional(Type.String()),
      })
    ),
    wrap(
      'listerRuptures',
      'Ruptures composants + réception couvrante (PO, fournisseur, date) ou sans_couverture. ' +
        'LE tool pour les réceptions fournisseurs attendues/critiques — ne jamais déduire de getPromise. ' +
        'Citation [listerRuptures: …].',
      Type.Object({
        horizonDays: Type.Optional(Type.Number()),
        from: Type.Optional(Type.String()),
        composant: Type.Optional(Type.String()),
        verdicts: Type.Optional(Type.Array(Type.String())),
        limit: Type.Optional(Type.Number()),
      })
    ),
  ]
}

export async function runOneCase(gc: GoldenCase): Promise<ScoreResult> {
  const tools = buildMockTools(gc)
  const runtime = await createAgentRuntime(tools)
  const toolsCalled: string[] = []
  let finalText = ''

  const unsub = runtime.session.subscribe((ev) => {
    if (ev.type === 'tool_execution_start') {
      toolsCalled.push(ev.toolName)
    }
    if (ev.type === 'message_update') {
      const inner = ev.assistantMessageEvent
      if (inner.type === 'text_delta' && inner.delta) finalText += inner.delta
    }
  })

  try {
    // Multi-tour : tours successifs dans la MÊME session (mémoire conversationnelle).
    // Le scoring porte sur le texte du dernier tour + le cumul des tools.
    for (const turn of [gc.question, ...(gc.turns ?? [])]) {
      finalText = ''
      await runtime.session.prompt(turn)
    }
  } finally {
    unsub()
    runtime.dispose()
  }

  return scoreCase(gc, finalText, toolsCalled)
}

export interface GoldenSuiteReport {
  passed: number
  failed: number
  total: number
  passRate: number
  /** Gate dure : true si passRate ≥ 0.75 et aucun échec critique tools. */
  gate: boolean
  results: ScoreResult[]
}

export async function runGoldenSuite(options?: {
  only?: string[]
  concurrency?: number
}): Promise<GoldenSuiteReport> {
  const cases = options?.only
    ? GOLDEN_CASES.filter((c) => options.only!.includes(c.id))
    : GOLDEN_CASES

  const results: ScoreResult[] = []
  // Séquentiel par défaut : quota Z.AI ; pas de course sur rate limit.
  for (const gc of cases) {
    try {
      results.push(await runOneCase(gc))
    } catch (err) {
      results.push({
        id: gc.id,
        pass: false,
        score: 0,
        max: 1,
        details: [err instanceof Error ? err.message : String(err)],
        toolsCalled: [],
        finalText: '',
      })
    }
  }

  const passed = results.filter((r) => r.pass).length
  const failed = results.length - passed
  const passRate = results.length === 0 ? 0 : passed / results.length
  // Gate : ≥ 75 % des cas, et G03 (racine profonde) + G01 (rupture directe) doivent passer
  // s'ils sont dans le lot — signaux critiques du raisonnement causal.
  const criticalIds = ['G01-rupture-feuille-directe', 'G03-racine-feuille-profonde']
  const criticalOk = criticalIds.every((id) => {
    const r = results.find((x) => x.id === id)
    return r === undefined || r.pass
  })
  const gate = passRate >= 0.75 && criticalOk

  return { passed, failed, total: results.length, passRate, gate, results }
}
