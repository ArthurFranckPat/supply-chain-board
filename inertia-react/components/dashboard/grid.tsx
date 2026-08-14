/**
 * Grille du tableau de bord : placement, drag et resize, sans dépendance.
 *
 * Remplace react-grid-layout (issue #87 : drag et resize inertes en v2, et la
 * v1 est incompatible React 19 — elle repose sur `ReactDOM.findDOMNode`).
 *
 * Modèle : grille à N colonnes (24 sur le tableau de bord), hauteur de ligne
 * fixe, compaction verticale. Les items
 * portent `x`/`y`/`w`/`h` en unités de grille — exactement le schéma déjà
 * persisté par le store et par `users.dashboard_layout`, donc aucune traduction.
 *
 * Interaction : un seul `pointerdown` délégué sur le conteneur, puis
 * `pointermove`/`pointerup` sur la fenêtre. Pas de HTML5 drag and drop (qui
 * intercepte le geste), pas de possession du DOM par une lib tierce (le
 * dashboard se re-rend à chaque tick de données). Le geste est piloté au pixel
 * et n'est converti en unités de grille que pour l'aperçu et le commit.
 *
 * Fluidité : pendant le geste, la position de la tuile manipulée est écrite
 * directement dans le DOM, hors de React — c'est la technique de
 * `react-resizable-panels`. Un rendu React n'a lieu qu'au franchissement d'un
 * cran de grille (l'aperçu de compaction bouge) et au relâchement. Entre deux
 * crans, un geste ne coûte que quatre propriétés de style.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as React from 'react'
import { cn } from '@r/lib/utils'
import { dashboardGridModeForWidth, type DashboardGridMode } from '@r/lib/dashboard/types'

export interface DashboardGridItem {
  id: string
  x: number
  y: number
  w: number
  h: number
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Bords redimensionnables. `n` et `w` déplacent l'arête tirée en gardant l'arête
 * opposée fixe (donc `y`/`x` bougent aussi) ; `s`, `e` et le coin `se` ne
 * touchent qu'à la taille.
 */
export type ResizeAxis = 'n' | 's' | 'e' | 'w' | 'se'

const RESIZE_AXES: ResizeAxis[] = ['n', 's', 'e', 'w', 'se']

const RESIZE_TITLES: Record<ResizeAxis, string> = {
  n: 'Glisser pour redimensionner par le haut',
  s: 'Glisser pour redimensionner par le bas',
  e: 'Glisser pour redimensionner par la droite',
  w: 'Glisser pour redimensionner par la gauche',
  se: 'Glisser pour redimensionner en largeur et en hauteur',
}

function isResizeAxis(v: string | null): v is ResizeAxis {
  return v !== null && (RESIZE_AXES as string[]).includes(v)
}

type Gesture = {
  kind: 'drag' | 'resize'
  /** Renseigné pour un resize seulement. */
  axis: ResizeAxis | null
  id: string
  pointerX: number
  pointerY: number
  origin: DashboardGridItem
  /** Layout au moment du pointerdown : l'aperçu s'en déduit, jamais du précédent. */
  base: DashboardGridItem[]
  /** Passe à true au premier `pointermove` : un clic sans déplacement ne persiste rien. */
  dirty: boolean
}

function collides(a: DashboardGridItem, b: DashboardGridItem): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
}

/**
 * Compaction verticale : chaque item remonte jusqu'à la première ligne libre,
 * dans l'ordre haut→bas puis gauche→droite. `pinnedId` garde sa position telle
 * quelle (l'item sous le curseur pendant un geste) et les autres s'organisent
 * autour.
 */
function compact(items: DashboardGridItem[], pinnedId: string | null): DashboardGridItem[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const pinned = pinnedId ? sorted.find((it) => it.id === pinnedId) : undefined
  const placed: DashboardGridItem[] = pinned ? [pinned] : []
  for (const it of sorted) {
    if (pinned && it.id === pinned.id) continue
    let y = 0
    while (placed.some((p) => collides({ ...it, y }, p))) y++
    placed.push({ ...it, y })
  }
  return placed
}

function bottomRow(items: DashboardGridItem[]): number {
  return items.reduce((max, it) => Math.max(max, it.y + it.h), 0)
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export interface DashboardGridProps {
  /** Items visibles uniquement, en unités de grille. */
  items: DashboardGridItem[]
  /** Les enfants sont appariés aux items par leur `key` (= `id`). */
  children: React.ReactNode
  editMode: boolean
  /** Appelé au relâchement seulement — pas à chaque frame. */
  onChange: (items: DashboardGridItem[]) => void
  cols?: number
  rowHeight?: number
  gap?: number
  minW?: number
  minH?: number
  className?: string
}

export function DashboardGrid({
  items,
  children,
  editMode,
  onChange,
  // Valeurs par défaut alignées sur celles du tableau de bord, pour qu'un
  // oubli de prop ne produise pas une géométrie d'une autre échelle.
  cols = 24,
  rowHeight = 24.5,
  gap = 16,
  minW = 6,
  minH = 6,
  className,
}: DashboardGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // 0 tant que non mesuré — avec colWidth=0 les tuiles font (w-1)*gap px
  // (~112 px pour w=8) puis explosent à la vraie largeur. Mesure en
  // useLayoutEffect (avant paint) et on n'affiche qu'une fois prêt.
  const [width, setWidth] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)
  const gridMode: DashboardGridMode = dashboardGridModeForWidth(viewportWidth || 1440)

  const gestureRef = useRef<Gesture | null>(null)
  const detachRef = useRef<(() => void) | null>(null)
  /** Dernier cran de grille appliqué — évite de recalculer un aperçu identique. */
  const lastCandidateRef = useRef<DashboardGridItem | null>(null)
  const previewRef = useRef<DashboardGridItem[] | null>(null)
  const [preview, setPreview] = useState<DashboardGridItem[] | null>(null)
  /**
   * Boîte en pixels de la tuile manipulée. Volontairement une ref et non un
   * état : elle change à chaque frame, et la repasser par React ferait un rendu
   * par frame. Elle est peinte directement dans le DOM (cf. paintGhost) et
   * relue au rendu pour que React reparte de la bonne position.
   */
  const ghostRef = useRef<Box | null>(null)
  /** Nœuds des tuiles, pour écrire leur style sans repasser par le rendu. */
  const nodeRefs = useRef(new Map<string, HTMLDivElement>())
  const [activeId, setActiveId] = useState<string | null>(null)
  /** 'drag' ou l'axe de resize — porte le curseur sur le conteneur pendant le geste. */
  const [gestureCursor, setGestureCursor] = useState<string | null>(null)

  // ----- Largeur du conteneur (avant paint pour éviter le CLS) -----
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const apply = (w: number) => {
      if (w > 0) setWidth((prev) => (prev === w ? prev : w))
    }
    apply(node.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) apply(entry.contentRect.width)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  // Mode mobile/tablette/desktop : viewport, pas la gouttière restante après
  // la sidebar (768 − 256 < 768 ferait tomber à tort en une colonne).
  useLayoutEffect(() => {
    const applyVp = () => {
      const w = window.innerWidth
      setViewportWidth((prev) => (prev === w ? prev : w))
    }
    applyVp()
    window.addEventListener('resize', applyVp)
    return () => window.removeEventListener('resize', applyVp)
  }, [])

  // ----- Conversions grille ↔ pixels -----
  const colWidth = width > 0 ? (width - gap * (cols - 1)) / cols : 0
  const colStep = colWidth + gap
  const rowStep = rowHeight + gap

  const toBox = useCallback(
    (it: DashboardGridItem): Box => ({
      left: it.x * colStep,
      top: it.y * rowStep,
      width: it.w * colWidth + (it.w - 1) * gap,
      height: it.h * rowHeight + (it.h - 1) * gap,
    }),
    [colStep, rowStep, colWidth, rowHeight, gap]
  )

  const layout = preview ?? items
  const height = bottomRow(layout) * rowStep - gap

  /**
   * Applique la boîte courante au nœud de la tuile manipulée, sans rendu React.
   * C'est le cœur du gain de fluidité : entre deux crans de grille, un geste ne
   * déclenche plus aucun rendu — seules quatre propriétés de style changent.
   */
  const paintGhost = useCallback(() => {
    const g = gestureRef.current
    const box = ghostRef.current
    if (!g || !box) return
    const node = nodeRefs.current.get(g.id)
    if (!node) return
    node.style.left = `${box.left}px`
    node.style.top = `${box.top}px`
    node.style.width = `${box.width}px`
    node.style.height = `${box.height}px`
  }, [])

  /**
   * React ne connaît pas les écritures directes ci-dessus : si un rendu survient
   * en plein geste (franchissement de cran), il peut écraser le style par sa
   * propre valeur. On repeint après chaque rendu tant que le geste dure.
   */
  useLayoutEffect(() => {
    if (activeId) paintGhost()
  })

  // ----- Geste -----
  const endGesture = useCallback(() => {
    const g = gestureRef.current
    const next = previewRef.current
    gestureRef.current = null
    previewRef.current = null
    ghostRef.current = null
    setPreview(null)
    setActiveId(null)
    setGestureCursor(null)
    // Compaction finale sans pin : l'item relâché remonte lui aussi.
    if (g?.dirty && next) onChange(compact(next, null))
  }, [onChange])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!editMode || e.button !== 0 || gestureRef.current) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const resizeHandle = target.closest('[data-grid-resize]')
      const dragHandle = resizeHandle ? null : target.closest('[data-grid-drag]')
      if (!resizeHandle && !dragHandle) return
      const rawAxis = resizeHandle?.getAttribute('data-grid-resize') ?? null
      const axis = isResizeAxis(rawAxis) ? rawAxis : null
      if (resizeHandle && !axis) return
      const host = target.closest<HTMLElement>('[data-grid-id]')
      const id = host?.dataset.gridId
      if (!id) return
      const origin = items.find((it) => it.id === id)
      if (!origin) return

      // Empêche la sélection de texte et le drag natif de l'image/du SVG.
      e.preventDefault()
      gestureRef.current = {
        kind: resizeHandle ? 'resize' : 'drag',
        axis,
        id,
        pointerX: e.clientX,
        pointerY: e.clientY,
        origin,
        base: items,
        dirty: false,
      }
      previewRef.current = items
      lastCandidateRef.current = origin
      setPreview(items)
      ghostRef.current = toBox(origin)
      setActiveId(id)
      setGestureCursor(axis ?? 'drag')

      // Les écouteurs sont posés ici, pas dans un effet : un effet ne s'exécute
      // qu'au rendu suivant, et un `pointermove` arrivé entre-temps serait perdu.
      // La géométrie est figée par fermeture pour la durée du geste.
      const apply = (ev: PointerEvent) => {
        const g = gestureRef.current
        if (!g || colWidth <= 0) return
        const dx = ev.clientX - g.pointerX
        const dy = ev.clientY - g.pointerY
        const box = toBox(g.origin)
        let candidate: DashboardGridItem

        if (g.kind === 'drag') {
          const left = box.left + dx
          const top = Math.max(0, box.top + dy)
          ghostRef.current = { ...box, left, top }
          candidate = {
            ...g.origin,
            x: clamp(Math.round(left / colStep), 0, cols - g.origin.w),
            y: Math.max(0, Math.round(top / rowStep)),
          }
        } else {
          const axis = g.axis ?? 'se'
          const pullsW = axis === 'w'
          const pullsN = axis === 'n'
          const widens = axis === 'e' || axis === 'se'
          const heightens = axis === 's' || axis === 'se'

          // Bornes en pixels des arêtes mobiles, pour que l'aperçu ne sorte
          // jamais de la grille ni ne passe sous les tailles minimales.
          const minWPx = minW * colWidth + (minW - 1) * gap
          const minHPx = minH * rowHeight + (minH - 1) * gap
          const maxWPx = (cols - g.origin.x) * colWidth + (cols - g.origin.x - 1) * gap

          const next = { ...g.origin }
          const ghostBox = { ...box }

          if (pullsW) {
            // L'arête droite reste fixe : on borne le décalage du bord gauche.
            const shift = clamp(dx, -box.left, box.width - minWPx)
            ghostBox.left = box.left + shift
            ghostBox.width = box.width - shift
            const right = g.origin.x + g.origin.w
            next.x = clamp(Math.round(ghostBox.left / colStep), 0, right - minW)
            next.w = right - next.x
          } else if (widens) {
            ghostBox.width = clamp(box.width + dx, minWPx, maxWPx)
            next.w = clamp(Math.round((ghostBox.width + gap) / colStep), minW, cols - g.origin.x)
          }

          if (pullsN) {
            // Idem verticalement : l'arête basse reste fixe.
            const shift = clamp(dy, -box.top, box.height - minHPx)
            ghostBox.top = box.top + shift
            ghostBox.height = box.height - shift
            const bottom = g.origin.y + g.origin.h
            next.y = clamp(Math.round(ghostBox.top / rowStep), 0, bottom - minH)
            next.h = bottom - next.y
          } else if (heightens) {
            ghostBox.height = Math.max(minHPx, box.height + dy)
            next.h = Math.max(minH, Math.round((ghostBox.height + gap) / rowStep))
          }

          ghostRef.current = ghostBox
          candidate = next
        }

        g.dirty = true
        paintGhost()

        // Le fantôme suit le pointeur au pixel, mais l'aperçu de compaction ne
        // bouge qu'au franchissement d'un cran. Sans ce garde-fou on relance un
        // rendu complet de la grille à chaque frame pour un layout identique.
        const prev = lastCandidateRef.current
        if (
          prev &&
          prev.x === candidate.x &&
          prev.y === candidate.y &&
          prev.w === candidate.w &&
          prev.h === candidate.h
        ) {
          return
        }
        lastCandidateRef.current = candidate

        const next = compact(
          g.base.map((it) => (it.id === g.id ? candidate : it)),
          g.id
        )
        previewRef.current = next
        setPreview(next)
      }

      // `pointermove` peut dépasser 60 Hz (souris haute fréquence, écran 120 Hz).
      // On ne traite qu'un événement par frame : au-delà, le travail est jeté par
      // le compositeur de toute façon.
      let frame = 0
      let pending: PointerEvent | null = null
      const onMove = (ev: PointerEvent) => {
        pending = ev
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          if (pending) apply(pending)
        })
      }

      const detach = () => {
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        detachRef.current = null
      }
      function onUp() {
        detach()
        endGesture()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      detachRef.current = detach
    },
    [
      editMode,
      items,
      toBox,
      colWidth,
      colStep,
      rowStep,
      rowHeight,
      gap,
      cols,
      minW,
      minH,
      endGesture,
      paintGhost,
    ]
  )

  // Démontage en plein geste : on ne laisse pas d'écouteur sur window.
  useEffect(() => () => detachRef.current?.(), [])

  // ----- Rendu -----
  const byId = useMemo(() => new Map(layout.map((it) => [it.id, it])), [layout])
  const activeItem = activeId ? byId.get(activeId) : undefined

  /**
   * Enfants clonés une fois par changement de `children`, pas à chaque rendu.
   *
   * Le clonage sert à imposer `h-full w-full` (la boîte positionnée porte la
   * hauteur, les cartes internes sont en `h-full`). Mais `cloneElement` produit
   * un nouvel élément : le refaire à chaque frame de geste annule le
   * court-circuit d'identité de React et re-rend l'intégralité des cartes KPI —
   * tableaux et graphiques compris. Mémorisés ici, ces sous-arbres sont ignorés
   * pendant tout le geste ; seules les `div` de positionnement se re-rendent.
   */
  const clonedChildren = useMemo(() => {
    const map = new Map<string, React.ReactNode>()
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child) || child.key == null) return
      // React préfixe les keys des enfants d'un tableau ; on retombe sur l'id brut.
      const id = String(child.key).replace(/^\.\$/, '')
      const el = child as React.ReactElement<{ className?: string }>
      map.set(id, React.cloneElement(el, { className: cn(el.props.className, 'h-full w-full') }))
    })
    return map
  }, [children])

  /** Poignées : identiques d'un rendu à l'autre tant que `editMode` ne change pas. */
  const handles = useMemo(
    () =>
      editMode
        ? RESIZE_AXES.map((axis) => (
            <span
              key={axis}
              data-grid-resize={axis}
              className={`dashboard-grid-resize dashboard-grid-resize-${axis} print:hidden`}
              title={RESIZE_TITLES[axis]}
            />
          ))
        : null,
    [editMode]
  )

  const tiles: React.ReactNode[] = []
  for (const [id, child] of clonedChildren) {
    const item = byId.get(id)
    if (!item) continue
    const isActive = id === activeId
    const box = (isActive && ghostRef.current) || toBox(item)
    tiles.push(
      <div
        key={id}
        ref={(el) => {
          if (el) nodeRefs.current.set(id, el)
          else nodeRefs.current.delete(id)
        }}
        data-grid-id={id}
        className={cn('dashboard-grid-item', isActive && 'is-active')}
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }}
      >
        {child}
        {handles}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('dashboard-grid', activeId && 'is-gesturing', className)}
      data-grid-mode={gridMode}
      data-gesture={gestureCursor ?? undefined}
      style={{
        position: 'relative',
        height: Math.max(height, 0),
        // Pas de tuiles à (w-1)*gap tant que la largeur réelle n'est pas connue.
        visibility: width > 0 ? 'visible' : 'hidden',
      }}
      onPointerDown={onPointerDown}
    >
      {width > 0 && activeItem && (
        <div
          className="dashboard-grid-placeholder"
          style={{ position: 'absolute', ...toBox(activeItem) }}
        />
      )}
      {width > 0 ? tiles : null}
    </div>
  )
}
