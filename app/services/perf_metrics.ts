/**
 * Agrégat de latence par route, en mémoire (issue #33).
 *
 * Sert de baseline locale sans APM externe : le `timing_middleware` enregistre la durée
 * de chaque requête ici, et `GET /api/v1/_perf` renvoie P50/P95/count par route. Volontairement
 * léger — un ring buffer borné par route, pas de persistance (reset au redémarrage du process).
 */

/** Nombre d'échantillons conservés par route (fenêtre glissante). */
const MAX_SAMPLES = 200

export interface RouteStats {
  route: string
  count: number
  p50: number
  p95: number
  max: number
  lastMs: number
}

class PerfMetrics {
  /** route → durées récentes (ms), ring buffer borné à MAX_SAMPLES. */
  private samples = new Map<string, number[]>()
  /** route → compteur cumulé (non borné, pour distinguer trafic réel vs fenêtre). */
  private totals = new Map<string, number>()

  record(route: string, durationMs: number): void {
    const list = this.samples.get(route) ?? []
    list.push(durationMs)
    if (list.length > MAX_SAMPLES) list.shift()
    this.samples.set(route, list)
    this.totals.set(route, (this.totals.get(route) ?? 0) + 1)
  }

  /** Percentile (0-100) sur un tableau de durées, par interpolation nearest-rank. */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const rank = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]
  }

  snapshot(): RouteStats[] {
    const out: RouteStats[] = []
    for (const [route, list] of this.samples) {
      const sorted = [...list].sort((a, b) => a - b)
      out.push({
        route,
        count: this.totals.get(route) ?? list.length,
        p50: Math.round(this.percentile(sorted, 50)),
        p95: Math.round(this.percentile(sorted, 95)),
        max: Math.round(sorted[sorted.length - 1] ?? 0),
        lastMs: Math.round(list[list.length - 1] ?? 0),
      })
    }
    return out.sort((a, b) => b.p95 - a.p95)
  }

  reset(): void {
    this.samples.clear()
    this.totals.clear()
  }
}

/** Singleton partagé par le middleware et le contrôleur perf. */
const perfMetrics = new PerfMetrics()
export default perfMetrics
