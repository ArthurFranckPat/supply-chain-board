/**
 * Smoke CLI étape 1 — prouve provider GLM + tool ping + zéro builtin.
 *
 * Usage : dotenvx run -- node --import @poppinss/ts-exec bin/agent_smoke.ts
 *      ou : npm run … (via dotenvx)
 */

import {
  assertAgentProviderConfigured,
  runAgentTurn,
} from '#services/agent_service'

async function main() {
  const info = assertAgentProviderConfigured()
  console.log('provider-check', info)
  if (!info.hasKey) {
    console.error('ZAI_API_KEY manquante')
    process.exit(2)
  }

  let sawTool = false
  let text = ''

  for await (const ev of runAgentTurn({
    message:
      'Appelle le tool ping avec msg=provider-ok. Ensuite réponds uniquement : OK provider. Cite [ping: …].',
  })) {
    if (ev.type === 'session') {
      console.log('session', ev)
      if (ev.tools.some((t) => ['bash', 'read', 'write', 'edit'].includes(t))) {
        console.error('SECURITY FAIL builtins', ev.tools)
        process.exit(3)
      }
    }
    if (ev.type === 'tool_start') {
      console.log('tool_start', ev.toolName)
      if (ev.toolName === 'ping') sawTool = true
    }
    if (ev.type === 'tool_end') console.log('tool_end', ev.toolName, 'err=', ev.isError)
    if (ev.type === 'text_delta') {
      text += ev.text
      process.stdout.write(ev.text)
    }
    if (ev.type === 'error') {
      console.error('\nerror-event', ev.message)
      process.exit(4)
    }
    if (ev.type === 'done') console.log('\n--- done', ev.sessionId)
  }

  if (!sawTool) {
    console.error('\nFAIL : tool ping jamais appelé')
    process.exit(5)
  }
  console.log('\nSMOKE OK — text length', text.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
