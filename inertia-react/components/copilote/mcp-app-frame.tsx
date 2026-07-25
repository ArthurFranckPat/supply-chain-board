/**
 * Rendu d'une MCP App dans le fil du copilote — issue #89, lot 3.
 *
 * /copilote devient hôte MCP Apps au sens de la spec : iframe sandbox,
 * handshake `ui/initialize` via `AppBridge`, puis `ui/notifications/tool-input`
 * et `ui/notifications/tool-result` pour donner ses données à l'app. Les
 * demandes de l'app (`tools/call`, `resources/read`) repartent vers le serveur
 * MCP par le pont HTTP (`mcp-host.ts` → `agent_mcp_controller`).
 *
 * L'app affichée ici est le MÊME artefact que celui servi à tout autre client
 * MCP : rien de spécifique à /copilote côté app, aucune couche de rendu maison
 * côté hôte.
 */

import { useEffect, useRef, useState } from 'react'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { getToolName } from 'ai'
import { Maximize2, Minimize2, TriangleAlert } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { readToolOutput } from '@r/lib/copilote/tool-output'
import type { AnyToolPart } from '@r/components/copilote/tool-tokens'
import {
  buildAppCsp,
  callMcpToolForApp,
  loadMcpApp,
  readHostStyleVariables,
  withCspMeta,
  type McpAppResource,
} from '@r/lib/copilote/mcp-host'

/** Bornes de hauteur : l'app pilote sa taille, l'hôte garde la main sur le fil. */
const MIN_HEIGHT = 180
const MAX_HEIGHT_INLINE = 460
const MAX_HEIGHT_FULL = 820

export interface McpAppFrameProps {
  /** Resource `ui://…` déclarée par le tool. */
  resourceUri: string
  /** Tool dont le résultat alimente l'app. */
  toolName: string
  /** Arguments de l'appel (notification `tool-input`). */
  input: unknown
  /** Payload métier du résultat (devient `structuredContent` pour l'app). */
  payload: unknown
}

/**
 * Les apps d'un message : un cadre par appel de tool qui en déclare une.
 *
 * Clé sur `toolCallId` : deux appels du même tool dans un tour donnent deux
 * graphes distincts, et un ré-appel ne recycle pas l'iframe du précédent.
 */
export function McpAppParts({ parts }: { parts: AnyToolPart[] }) {
  const apps = parts.flatMap((part) => {
    if (part.state !== 'output-available') return []
    const { payload, ui } = readToolOutput(part.output)
    if (!ui) return []
    return [
      {
        key: part.toolCallId,
        resourceUri: ui.resourceUri,
        toolName: getToolName(part),
        input: part.input,
        payload,
      },
    ]
  })

  if (apps.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {apps.map((app) => (
        <McpAppFrame
          key={app.key}
          resourceUri={app.resourceUri}
          toolName={app.toolName}
          input={app.input}
          payload={app.payload}
        />
      ))}
    </div>
  )
}

export function McpAppFrame(props: McpAppFrameProps) {
  const { resourceUri, toolName, input, payload } = props
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const bridgeRef = useRef<AppBridge | null>(null)

  const [resource, setResource] = useState<McpAppResource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const [fullscreen, setFullscreen] = useState(false)
  const [ready, setReady] = useState(false)

  // 1. Charger le HTML de l'app (une fois par URI, cache dans mcp-host).
  useEffect(() => {
    let alive = true
    loadMcpApp(resourceUri)
      .then((res) => {
        if (alive) setResource(res)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [resourceUri])

  // Valeurs mutables lues par les handlers du pont : les mettre en dépendances
  // de l'effet ci-dessous rejouerait le handshake à chaque agrandissement ou
  // chaque nouveau résultat, ce qui remettrait le graphe à zéro.
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen
  const payloadRef = useRef(payload)
  payloadRef.current = payload
  const inputRef = useRef(input)
  inputRef.current = input

  /**
   * 2. Pont d'abord, contenu ensuite.
   *
   * ORDRE CRITIQUE : l'app envoie `ui/initialize` dès l'exécution de son script.
   * Si le pont n'écoute pas encore, ce message est perdu et l'app reste bloquée
   * sur « Connexion… » — un `onLoad` de l'iframe arrive trop tard. On installe
   * donc le transport sur l'iframe encore vide (`about:blank`), puis on injecte
   * le document par `srcdoc`. Le WindowProxy de l'iframe ne change pas à la
   * navigation, donc le filtre `event.source` du transport reste valide.
   */
  useEffect(() => {
    const frame = iframeRef.current
    if (!frame || !resource) return

    const frameWindow = frame.contentWindow
    if (!frameWindow) return

    let closed = false
    const bridge = new AppBridge(
      // Pas de client MCP dans le navigateur : les demandes de l'app sont
      // servies par les handlers ci-dessous, qui repassent par le backend (donc
      // par l'allowlist du serveur). Un client MCP côté page aurait signifié
      // exposer le serveur au navigateur — non.
      null,
      { name: 'supply-board-copilote', version: '1.0.0' },
      {
        serverTools: {},
        serverResources: {},
        logging: {},
        sandbox: {
          // Ce que l'hôte accorde réellement, à comparer par l'app avec ce
          // qu'elle a demandé.
          csp: resource.meta?.ui?.csp ?? {},
        },
      },
      {
        hostContext: {
          theme: 'light',
          styles: { variables: readHostStyleVariables() },
          displayMode: fullscreenRef.current ? 'fullscreen' : 'inline',
          availableDisplayModes: ['inline', 'fullscreen'],
          locale: 'fr-FR',
          timeZone: 'Europe/Paris',
          userAgent: 'supply-board/copilote',
          platform: 'web',
        },
      }
    )

    bridge.oncalltool = async (params) => {
      const result = await callMcpToolForApp(
        params.name,
        (params.arguments ?? {}) as Record<string, unknown>
      )
      return result as never
    }

    bridge.onreadresource = async (params) => {
      const res = await loadMcpApp(params.uri)
      return {
        contents: [{ uri: res.uri, mimeType: res.mimeType, text: res.html, _meta: res.meta ?? {} }],
      }
    }

    bridge.onsizechange = ({ height: h }) => {
      if (typeof h === 'number' && h > 0) {
        const max = fullscreenRef.current ? MAX_HEIGHT_FULL : MAX_HEIGHT_INLINE
        setHeight(Math.min(Math.max(h, MIN_HEIGHT), max))
      }
    }

    bridge.onrequestdisplaymode = async ({ mode }) => {
      // `pip` non supporté : on répond le mode réellement appliqué, comme la
      // spec l'exige (l'app doit pouvoir constater le refus).
      const applied = mode === 'fullscreen' ? 'fullscreen' : 'inline'
      setFullscreen(applied === 'fullscreen')
      return { mode: applied }
    }

    // L'app est prête : on lui donne l'entrée puis le résultat du tool. C'est
    // par cette notification, et uniquement par elle, qu'elle reçoit sa donnée.
    bridge.oninitialized = () => {
      if (closed) return
      setReady(true)
      void bridge
        .sendToolInput({ arguments: (inputRef.current ?? {}) as Record<string, unknown> })
        .then(() =>
          bridge.sendToolResult({
            content: [],
            structuredContent: (payloadRef.current ?? {}) as Record<string, unknown>,
          })
        )
        .catch((err: unknown) => {
          if (!closed) setError(err instanceof Error ? err.message : String(err))
        })
    }

    bridgeRef.current = bridge
    bridge
      .connect(new PostMessageTransport(frameWindow, frameWindow))
      .then(() => {
        if (closed) return
        // Le transport écoute : le document peut arriver.
        frame.srcdoc = withCspMeta(resource.html, buildAppCsp(resource.meta?.ui?.csp))
      })
      .catch((err: unknown) => {
        if (!closed) setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      closed = true
      setReady(false)
      void bridge.close().catch(() => {})
      if (bridgeRef.current === bridge) bridgeRef.current = null
      // Le document est jeté avec le pont : sinon une app orpheline continuerait
      // de tourner (et de demander des tools) sans personne pour lui répondre.
      frame.srcdoc = ''
    }
  }, [resource])

  // 3. Nouveau résultat pour un pont déjà ouvert (le modèle rappelle le tool) :
  // on renotifie l'app sans recharger l'iframe, elle se met à jour en place.
  useEffect(() => {
    const bridge = bridgeRef.current
    if (!bridge || !ready) return
    void bridge
      .sendToolResult({
        content: [],
        structuredContent: (payload ?? {}) as Record<string, unknown>,
      })
      .catch(() => {
        /* pont fermé entre-temps — le prochain montage refera le handshake */
      })
  }, [payload, ready])

  // Changement de mode d'affichage côté hôte (bouton) : l'app doit pouvoir s'y
  // adapter (densité, hauteur) — c'est le rôle de `hostContext`.
  useEffect(() => {
    const bridge = bridgeRef.current
    if (!bridge || !ready) return
    void Promise.resolve(
      bridge.sendHostContextChange({
        hostContext: { displayMode: fullscreen ? 'fullscreen' : 'inline' },
      })
    ).catch(() => {})
  }, [fullscreen, ready])

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          App « {resourceUri} » non affichable : {error}
        </span>
      </div>
    )
  }

  const bordered = resource?.meta?.ui?.prefersBorder !== false

  return (
    <figure className="my-1.5">
      <div
        className={cn(
          'relative overflow-hidden rounded-xl bg-card',
          bordered && 'border border-border/60'
        )}
      >
        <figcaption className="flex items-center justify-between gap-2 border-b border-border/50 px-2.5 py-1.5 text-[10.5px] text-muted-foreground">
          <span className="truncate font-mono">{toolName}</span>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-secondary hover:text-foreground"
            title={fullscreen ? 'Réduire' : 'Agrandir'}
          >
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </figcaption>

        {/* `srcdoc` est posé impérativement APRÈS la connexion du pont (cf. plus
            haut) : React ne doit donc pas le piloter. */}
        <iframe
          ref={iframeRef}
          title={`app ${resourceUri}`}
          // Origine opaque : pas d'`allow-same-origin`, donc aucun accès au
          // DOM, aux cookies ni au stockage de l'hôte (cf. mcp-host.ts).
          sandbox="allow-scripts"
          style={{ height }}
          className="block w-full border-0 bg-transparent transition-[height] duration-200"
        />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
            {resource ? 'Ouverture de l’app…' : 'Chargement de l’app…'}
          </div>
        )}
      </div>
    </figure>
  )
}
