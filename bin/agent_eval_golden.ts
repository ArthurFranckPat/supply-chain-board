/**
 * Runner CLI — jeu de cas d'or agent (gate étape 3).
 *
 * Usage :
 *   npx dotenvx run -- node --import @poppinss/ts-exec bin/agent_eval_golden.ts
 *   npx dotenvx run -- node --import @poppinss/ts-exec bin/agent_eval_golden.ts G01 G03
 */

import { runGoldenSuite } from '#services/agent/eval/run_golden'
import { assertAgentProviderConfigured } from '#services/agent_service'

async function main() {
  const info = assertAgentProviderConfigured()
  if (!info.hasKey) {
    console.error('ZAI_API_KEY manquante')
    process.exit(2)
  }
  console.log('provider', info)

  const only = process.argv.slice(2).filter((a) => a.startsWith('G'))
  const report = await runGoldenSuite(only.length ? { only } : undefined)

  for (const r of report.results) {
    const mark = r.pass ? 'PASS' : 'FAIL'
    console.log(
      `[${mark}] ${r.id}  ${r.score}/${r.max}  tools=${r.toolsCalled.join(',') || '—'}`
    )
    if (!r.pass) {
      for (const d of r.details) console.log(`        - ${d}`)
      if (r.finalText) {
        const preview = r.finalText.replace(/\s+/g, ' ').slice(0, 220)
        console.log(`        text: ${preview}${r.finalText.length > 220 ? '…' : ''}`)
      }
    }
  }

  console.log(
    `\n=== ${report.passed}/${report.total} pass (${(report.passRate * 100).toFixed(0)}%) gate=${report.gate ? 'OPEN' : 'CLOSED'} ===`
  )
  process.exit(report.gate ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
