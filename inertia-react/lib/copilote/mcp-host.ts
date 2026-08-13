/**
 * Socle d'hôte MCP Apps pour /copilote — issue #89, lot 3.
 *
 * Trois responsabilités, volontairement hors du composant React :
 *  1. charger une resource `ui://` par le protocole (route `mcp/app`, cache par URI) ;
 *  2. construire la CSP de l'iframe **depuis** `_meta.ui.csp` déclaré par le serveur,
 *     jamais plus large ;
 *  3. exposer le thème de l'hôte à l'app en variables MCP (`useHostStyles` côté app).
 *
 * ── Choix de sandbox, assumé et documenté ──
 * Une seule iframe `sandbox="allow-scripts"`, contenu injecté par `srcdoc` : le
 * document obtient une **origine opaque**, donc aucun accès au DOM, aux cookies
 * ni au localStorage de /copilote — `allow-same-origin` n'est jamais accordé.
 * La spec recommande en plus une origine dédiée (double-iframe) pour un hôte web ;
 * cette recommandation sert les cas où l'app a besoin d'une origine stable (OAuth,
 * allowlist CORS d'une API tierce) ou vient d'un tiers. Nos apps sont
 * first-party, sans réseau (CSP fermée) et sans stockage : l'origine dédiée
 * n'apporterait rien de vérifiable ici. Le jour où une app tierce ou une app qui
 * appelle une API externe apparaît, il faudra une origine séparée AVANT de la
 * charger.
 */

import type { McpUiResourceCsp, McpUiStyles } from '@modelcontextprotocol/ext-apps/app-bridge'

export interface McpAppResource {
  uri: string
  mimeType: string
  html: string
  meta: {
    ui?: {
      csp?: McpUiResourceCsp
      permissions?: Record<string, unknown>
      prefersBorder?: boolean
    }
  } | null
}

const cache = new Map<string, Promise<McpAppResource>>()

/** Charge (et mémorise) le HTML d'une app. Le même URI n'est lu qu'une fois. */
export function loadMcpApp(uri: string): Promise<McpAppResource> {
  const hit = cache.get(uri)
  if (hit) return hit

  const pending = fetch(`/api/v1/copilote/mcp/app?uri=${encodeURIComponent(uri)}`, {
    headers: { accept: 'application/json' },
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Lecture de ${uri} refusée (HTTP ${res.status})`)
      }
      return (await res.json()) as McpAppResource
    })
    .catch((error) => {
      // Un échec ne doit pas rester en cache : l'app doit pouvoir se recharger au
      // prochain message (serveur redémarré, artefact reconstruit).
      cache.delete(uri)
      throw error
    })

  cache.set(uri, pending)
  return pending
}

/** `tools/call` demandé par une app, rejoué côté serveur par le client MCP. */
export async function callMcpToolForApp(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch('/api/v1/copilote/mcp/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body
}

/**
 * CSP de l'iframe, dérivée de `_meta.ui.csp`.
 *
 * `'unsafe-inline'` sur script/style est structurel : une app MCP est un fichier
 * HTML autonome, tout son JS et son CSS y sont inlinés. Le reste est fermé par
 * défaut (`default-src 'none'`), et un domaine n'apparaît que si le serveur l'a
 * déclaré — l'hôte n'élargit jamais de lui-même.
 */
export function buildAppCsp(csp: McpUiResourceCsp | undefined): string {
  const resources = csp?.resourceDomains ?? []
  const connects = csp?.connectDomains ?? []
  const frames = csp?.frameDomains ?? []
  const base = csp?.baseUriDomains ?? []

  const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${join(...resources)}`.trim(),
    `style-src 'unsafe-inline' ${join(...resources)}`.trim(),
    `img-src data: blob: ${join(...resources)}`.trim(),
    `font-src data: ${join(...resources)}`.trim(),
    `media-src data: blob: ${join(...resources)}`.trim(),
    connects.length > 0 ? `connect-src ${join(...connects)}` : "connect-src 'none'",
    frames.length > 0 ? `frame-src ${join(...frames)}` : "frame-src 'none'",
    base.length > 0 ? `base-uri ${join(...base)}` : "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/** Injecte la CSP dans le document de l'app (srcdoc). */
export function withCspMeta(html: string, csp: string): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}">`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${tag}`)
  }
  // Pas de <head> explicite : le navigateur en fabrique un, la balise doit
  // précéder tout script pour être prise en compte.
  return `${tag}${html}`
}

/** Variables de thème lues sur l'hôte et traduites en variables MCP. */
export function readHostStyleVariables(): McpUiStyles {
  const root = document.documentElement
  const computed = getComputedStyle(root)
  const get = (token: string) => computed.getPropertyValue(token).trim() || undefined

  // Correspondance tokens supply-board → variables MCP. Le but n'est pas
  // l'exhaustivité mais que l'app ne jure pas : fond, texte, bordures, accents
  // d'état, polices.
  return {
    '--color-background-primary': get('--card') ?? get('--background'),
    '--color-background-secondary': get('--secondary'),
    '--color-background-tertiary': get('--muted'),
    '--color-background-inverse': get('--foreground'),
    '--color-background-info': get('--primary'),
    '--color-background-danger': get('--destructive'),
    '--color-background-success': get('--ferme'),
    '--color-background-warning': get('--suggere'),
    '--color-text-primary': get('--foreground'),
    '--color-text-secondary': get('--muted-foreground'),
    '--color-text-tertiary': get('--muted-foreground'),
    '--color-text-inverse': get('--background'),
    '--color-text-danger': get('--destructive'),
    '--color-text-warning': get('--suggere'),
    '--color-border-primary': get('--border'),
    '--color-border-secondary': get('--border'),
    '--color-ring-primary': get('--ring'),
    '--font-sans': get('--font-sans'),
    '--font-mono': get('--font-mono'),
    '--border-radius-sm': get('--radius-sm') ?? get('--radius'),
    '--border-radius-md': get('--radius'),
  } as McpUiStyles
}
