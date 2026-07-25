#!/usr/bin/env node

/**
 * Revue de PR par GLM 5.2 (provider zai, API OpenAI-compatible).
 *
 * Usage CI :  gh pr diff "$PR_NUMBER" | node scripts/ai-review.mjs
 * Sortie    : la revue en markdown sur stdout (prête pour `gh pr comment`).
 *
 * Variables d'environnement requises :
 *   ZAI_API_KEY  — clé API Z.AI (Zhipu)
 */

const BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
const MODEL = 'glm-5.2'
const MAX_DIFF_CHARS = 120_000
const FETCH_TIMEOUT_MS = 60_000

const IGNORED_PATHS = /package-lock\.json|bun\.lock|pnpm-lock\.yaml|yarn\.lock|\.min\.(js|css)$/

const SYSTEM_PROMPT = `Tu es un relecteur de code senior sur un projet AdonisJS 7 + React 19 (Inertia) pour la supply chain (ERP Sage X3).

Règles du projet :
- Commits conventionnels en français (feat/fix/refactor/chore(scope): …).
- Pas de SolidJS — le front est exclusivement React 19 + shadcn/ui + Tailwind.
- Le copilote IA est read-only sur les données X3 ; seul SQLite local est en écriture.
- Les outils agent sont définis via TypeBox (defineTool) et exposés en MCP.
- Les graphes utilisent des tooltips HTML custom, jamais le <title> natif SVG.
- Les semaines sont toujours datées avec l'année ISO (« S26 2025 »).
- Le projet tourne sur Node 26 et le modèle glm-5.2 (provider zai) — ce sont des choix validés, ne pas les signaler.

Ta revue doit être :
- En français.
- Structurée en markdown avec des sections (🔴 Bloquant, 🟡 Suggestion, 🟢 Bien vu).
- Concrète : citer le fichier et la ligne quand c'est possible.
- Courte : ignorer le style/formatage (le lint s'en charge), se concentrer sur la logique, la sécurité, les bugs potentiels, les conventions ci-dessus.
- Terminée par une phrase de verdict : « ✅ LGTM » ou « ⚠️ À corriger avant merge ».

Si le diff est vide ou trivial (rename, dépendances), réponds simplement « ✅ LGTM — changement trivial ».`

async function main() {
  const apiKey = process.env.ZAI_API_KEY
  if (!apiKey) {
    console.error('ERREUR : ZAI_API_KEY manquante.')
    process.exit(1)
  }

  let diff = ''
  for await (const chunk of process.stdin) diff += chunk
  diff = diff.trim()

  if (!diff) {
    console.log('✅ LGTM — diff vide.')
    return
  }

  // Filtrer les fichiers générés / lockfiles (bruit pour la revue).
  diff = diff
    .split(/^diff --git /m)
    .filter((chunk) => {
      const file = chunk.match(/^[ab]\/(\S+)/)?.[1]
      return file && !IGNORED_PATHS.test(file)
    })
    .map((chunk) => `diff --git ${chunk}`)
    .join('')
    .trim()

  if (!diff) {
    console.log('✅ LGTM — diff ne contenant que des lockfiles / fichiers générés.')
    return
  }

  const truncated = diff.length > MAX_DIFF_CHARS
  if (truncated) diff = diff.slice(0, MAX_DIFF_CHARS) + '\n\n[… diff tronqué …]'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    signal: controller.signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Voici le diff de la PR. Fais ta revue.\n\n\`\`\`diff\n${diff}\n\`\`\``,
        },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  clearTimeout(timer)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`ERREUR API GLM ${res.status} : ${body.slice(0, 500)}`)
    process.exit(1)
  }

  const json = await res.json()
  const review = json.choices?.[0]?.message?.content?.trim()
  if (!review) {
    console.error('ERREUR : réponse vide de GLM.')
    process.exit(1)
  }

  const header = `## 🤖 Revue IA (GLM 5.2)\n\n`
  const footer = truncated
    ? '\n\n---\n*Diff tronqué à 120 k caractères — la revue peut être incomplète.*'
    : ''

  console.log(header + review + footer)
}

main()
