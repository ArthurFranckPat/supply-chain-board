/**
 * Scoring déterministe d'une réponse agent sur un cas d'or.
 * Aucun LLM-as-judge en v1 — inclusion de tokens de racine.
 */

import type { GoldenCase, GoldenToolName } from '#services/agent/eval/golden_cases'

export interface ScoreResult {
  id: string
  pass: boolean
  score: number
  max: number
  details: string[]
  toolsCalled: string[]
  finalText: string
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function scoreCase(
  gc: GoldenCase,
  finalText: string,
  toolsCalled: string[]
): ScoreResult {
  const details: string[] = []
  let score = 0
  let max = 0
  const text = norm(finalText)
  const called = new Set(toolsCalled)

  // 1. Tools obligatoires
  const must = gc.mustCall ?? (['getVerdict'] as GoldenToolName[])
  for (const t of must) {
    max += 1
    if (called.has(t)) {
      score += 1
    } else {
      details.push(`tool manquant: ${t}`)
    }
  }

  // 2. Articles racine
  for (const a of gc.expected.articles ?? []) {
    max += 2
    if (text.includes(norm(a))) {
      score += 2
    } else {
      details.push(`article racine absent: ${a}`)
    }
  }

  // 3. OFs
  for (const ofId of gc.expected.ofs ?? []) {
    max += 1
    if (text.includes(norm(ofId))) {
      score += 1
    } else {
      details.push(`OF absent: ${ofId}`)
    }
  }

  // 4. Keywords (au moins 1 sur le lot suffit pour 1 pt, tous pour full)
  const kws = gc.expected.keywords ?? []
  if (kws.length > 0) {
    max += 2
    const hits = kws.filter((k) => text.includes(norm(k)))
    if (hits.length === 0) {
      details.push(`aucun keyword parmi: ${kws.join(', ')}`)
    } else if (hits.length < Math.ceil(kws.length / 2)) {
      score += 1
      details.push(`keywords partiels: ${hits.join(', ')}`)
    } else {
      score += 2
    }
  }

  // 5. Faisable ok
  if (gc.expected.feasibleOk) {
    max += 2
    const neg =
      text.includes('faisable') ||
      text.includes('pas de rupture') ||
      text.includes('aucune rupture') ||
      text.includes('aucun manque') ||
      text.includes('pas de probleme') ||
      text.includes('ok')
    const falseNeg =
      (text.includes('rupture') && !text.includes('pas de rupture')) ||
      text.includes('bloque')
    if (neg && !falseNeg) {
      score += 2
    } else if (neg) {
      score += 1
      details.push('faisable mentionné mais signal rupture concurrent')
    } else {
      details.push('devait conclure faisable/ok')
    }
  }

  // Gate : ≥ 70 % des points + tous les tools must
  const toolsOk = must.every((t) => called.has(t))
  const ratio = max === 0 ? 0 : score / max
  const pass = toolsOk && ratio >= 0.7

  if (!pass && toolsOk) details.push(`score ${score}/${max} < 70%`)

  return {
    id: gc.id,
    pass,
    score,
    max,
    details,
    toolsCalled,
    finalText,
  }
}
