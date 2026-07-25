/**
 * Registre des MCP Apps (SEP-1865) exposées par supply-board — issue #89.
 *
 * Une app = un bundle HTML autonome, déclaré en resource `ui://supply-board/<app>`,
 * rattaché à UN tool par `_meta.ui.resourceUri`. Quand le client appelle ce tool,
 * il lit la resource, l'affiche dans une iframe sandbox et lui pousse le
 * `structuredContent` du résultat par `ui/notifications/tool-result`.
 *
 * Conséquence de cette architecture : la même app s'affiche dans Claude Desktop /
 * Claude Code (transport stdio, `npm run mcp:start`) et, à terme, dans /copilote
 * devenu hôte MCP Apps — sans une ligne de rendu spécifique de part et d'autre.
 *
 * ── Artefact HTML ──
 * Le HTML est un fichier **construit** (`npm run mcp:apps`, cf. vite.mcp-apps.config.ts)
 * et **commité** dans `resources/mcp-apps/`. Commiter un artefact généré est assumé,
 * même précédent que `inertia/lib/routes-manifest.ts` : la contrainte #80 est que
 * `npm run mcp:start` marche sur un PC vierge, sans build front préalable.
 * `npm run mcp:apps:check` échoue si l'artefact commité ne correspond plus aux sources.
 *
 * ── CSP ──
 * Aucun domaine déclaré (`csp: {}` implicite via un objet vide) : les apps
 * n'appellent RIEN sur le réseau. Tout leur JS/CSS est inliné, et leurs données
 * arrivent par le protocole, pas par `fetch`. Un hôte doit donc les servir avec un
 * CSP fermé — c'est la posture la plus sûre et elle est suffisante ici.
 */

import { readFile } from 'node:fs/promises'

export interface McpAppDefinition {
  /** Clé courte de l'app (nom de dossier sous inertia-react/mcp-apps/). */
  name: string
  /** Libellé lisible, affiché par les clients dans `resources/list`. */
  title: string
  /** Description de la resource. */
  description: string
  /** Tool dont le résultat alimente l'app. */
  toolName: string
  /** URI protocolaire de la resource UI. */
  resourceUri: string
}

export const MCP_APPS: readonly McpAppDefinition[] = [
  {
    name: 'charge',
    title: 'Charge vs capacité',
    description:
      'Graphe interactif de la charge face à la capacité par poste de charge : ' +
      'barres hebdomadaires, seuil de capacité, semaines saturées.',
    toolName: 'getCharge',
    resourceUri: 'ui://supply-board/charge',
  },
]

/** L'app rattachée à un tool, s'il en a une. */
export function mcpAppForTool(toolName: string): McpAppDefinition | undefined {
  return MCP_APPS.find((a) => a.toolName === toolName)
}

/**
 * Chemin de l'artefact HTML d'une app.
 *
 * Résolu depuis l'URL du module (et non `process.cwd()`) : le serveur MCP est lancé
 * indifféremment depuis la racine du repo ou par un client MCP au cwd arbitraire.
 */
export function mcpAppHtmlPath(app: McpAppDefinition): URL {
  return new URL(`../../../resources/mcp-apps/${app.name}.html`, import.meta.url)
}

/**
 * Lit le HTML d'une app.
 *
 * Erreur explicite si l'artefact manque : sans elle, le client reçoit une resource
 * vide et affiche une iframe blanche — symptôme muet, cause introuvable.
 */
export async function readMcpAppHtml(app: McpAppDefinition): Promise<string> {
  const path = mcpAppHtmlPath(app)
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `App MCP "${app.name}" introuvable (${reason}) — lancer "npm run mcp:apps" pour construire ` +
        `resources/mcp-apps/${app.name}.html`
    )
  }
}
