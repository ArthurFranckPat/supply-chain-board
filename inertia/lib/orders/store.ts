import { createMemo, createSignal } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { toast as sonnerToast } from 'solid-sonner'
import type { OrderBoardData, OrderCard, OrderSearchScope } from './types'
import type { FeasibilityMode, FeasStatus } from '@/lib/board/types'
import { router } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'

const ALL_TYPES = ['MTS', 'MTO', 'NOR'] as const
const ALL_NATURES = ['COMMANDE', 'PREVISION'] as const

/**
 * Store du board planification (issue #10).
 * Drag **en temps seul** : on n'autorise pas le changement de poste (rangée figée
 * par la gamme). Override de date = PATCH endpoint dédié ; rollback + toast en cas d'échec.
 *
 * Filtres entièrement client-side (toutes les lignes sont déjà chargées via props) :
 *  - recherche live + scope (poste / commande / article / client)
 *  - cases à cocher type commande (MTS/MTO/NOR) et nature (COMMANDE/PREVISION)
 */
export function createOrderBoardStore(initial: OrderBoardData) {
  const [board, setBoard] = createStore<OrderBoardData>(initial)

  const [query, setQuery] = createSignal('')
  const [scope, setScope] = createSignal<OrderSearchScope>('poste')
  // Sélection des filtres : un Set vide ⇒ aucun masquage (tout visible).
  const [typeFilter, setTypeFilter] = createSignal<Set<string>>(new Set(ALL_TYPES))
  const [natureFilter, setNatureFilter] = createSignal<Set<string>>(new Set(ALL_NATURES))
  // Filtre atelier (STOLOC, issue #36) : vide ⇒ tous les ateliers visibles.
  const [atelierFilter, setAtelierFilter] = createSignal<Set<string>>(new Set())

  // ── Faisabilité (issue #21) ──
  // Miroir du store OF : le même endpoint /board-feasibility renvoie `orders[]` avec,
  // par ligne de commande (clé `${numCommande}#${ligne}` = id carte), les OF rattachés
  // et leur verdict faisable. On agrège par ligne (pessimiste) : bloquée si ≥ 1 OF en
  // rupture, OK sinon. Les badges s'affichent via OrderGrid.CardView → BoardCard.feas.
  const [mode, setMode] = createSignal<FeasibilityMode>('immediate')
  const [feasibility, setFeasibility] = createSignal<Record<string, FeasStatus>>({})
  const [feasLoading, setFeasLoading] = createSignal(false)
  const feasOf = (cardId: string): FeasStatus | undefined => feasibility()[cardId]

  /** Passe le filtre type/nature (cases à cocher). */
  function passesFilters(card: OrderCard): boolean {
    // Carte induite (ghost) : charge structurelle, toujours visible, hors filtres.
    if (card.induit) return true
    const tf = typeFilter()
    // orderType null ⇒ visible seulement si NOR coché (fallback historique).
    const t = card.orderType ?? 'NOR'
    if (!tf.has(t)) return false
    if (!natureFilter().has(card.nature)) return false
    return true
  }

  /** Une carte matche recherche (selon scope) + filtres. */
  function cardMatches(card: OrderCard, lineCode: string): boolean {
    if (!passesFilters(card)) return false
    const q = query().trim().toLowerCase()
    if (!q) return true
    switch (scope()) {
      case 'poste':
        return lineCode.toLowerCase().includes(q)
      case 'commande':
        return card.id.toLowerCase().includes(q)
      case 'article': {
        // Code article (ITMREF) ET libellé — insensible casse/espaces.
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
        const nq = norm(q)
        return norm(card.article ?? '').includes(nq) || norm(card.title).includes(nq)
      }
      case 'client':
        return (card.customer ?? '').toLowerCase().includes(q)
    }
  }

  function lineVisible(lineCode: string): boolean {
    const line = board.lines.find((l) => l.code === lineCode)
    if (!line) return false
    // Filtre atelier : si des ateliers sont sélectionnés, masque les autres lignes.
    const af = atelierFilter()
    if (af.size > 0 && !(line.atelier && af.has(line.atelier))) return false
    return line.dayCells.some((dc) => dc.cards.some((c) => cardMatches(c, lineCode)))
  }

  function onQueryInput(value: string) {
    setQuery(value)
  }
  function onScopeChange(value: OrderSearchScope) {
    setScope(value)
  }
  function clearSearch() {
    setQuery('')
  }

  function toggleType(t: string) {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }
  function toggleNature(n: string) {
    setNatureFilter((prev) => {
      const next = new Set(prev)
      next.has(n) ? next.delete(n) : next.add(n)
      return next
    })
  }
  function toggleAtelier(code: string) {
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }
  function clearAtelier() {
    setAtelierFilter(new Set<string>())
  }

  // ── Charge/jour live (somme des heures des cartes visibles par colonne). ──
  // Les cartes induites (card.induit) sont toujours visibles (passesFilters) →
  // leur charge est sommeée ici comme celle des commandes directes. Split
  // direct (commandes PF) vs amont (composants/sous-ensembles induits).
  const dayLoadSplit = createMemo<{ direct: number[]; amont: number[] }>(() => {
    const direct = new Array<number>(board.cols).fill(0)
    const amont = new Array<number>(board.cols).fill(0)
    for (const line of board.lines) {
      if (!lineVisible(line.code)) continue
      line.dayCells.forEach((dc, col) => {
        for (const card of dc.cards) {
          if (!cardMatches(card, line.code)) continue
          if (card.induit) amont[col] += card.hours
          else direct[col] += card.hours
        }
      })
    }
    return { direct, amont }
  })
  const dayLoad = createMemo<number[]>(() => {
    const { direct, amont } = dayLoadSplit()
    return direct.map((d, i) => d + amont[i])
  })

  /** Histogramme hebdo par ligne, recalculé live depuis les positions des cartes.
   *  `direct` = cartes commandes, `induit` = cartes ghost (besoin brut depth-1),
   *  `hours` = total (direct + induit) pour le calcul de saturation. */
  function lineWeekLoads(lineCode: string) {
    const line = board.lines.find((l) => l.code === lineCode)
    if (!line) return []
    const directByWeek: Record<number, number> = {}
    const induitByWeek: Record<number, number> = {}
    line.dayCells.forEach((dc, col) => {
      const wk = board.colWeek[col]
      if (wk === undefined) return
      for (const card of dc.cards) {
        if (card.induit) induitByWeek[wk] = (induitByWeek[wk] ?? 0) + card.hours
        else directByWeek[wk] = (directByWeek[wk] ?? 0) + card.hours
      }
    })
    return line.weekLoads.map((wl) => {
      const direct = Math.round((directByWeek[wl.week] ?? 0) * 10) / 10
      const induit = Math.round((induitByWeek[wl.week] ?? 0) * 10) / 10
      const total = direct + induit
      const cap = board.weekCaps[String(wl.week)] ?? 0
      const pct = cap > 0 ? Math.round((total / cap) * 100) : 0
      const barClass = pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : 'bg-emerald-500'
      return { week: wl.week, direct, induit, hours: total, pct, barClass }
    })
  }

  // ── Faisabilité : POST /board-feasibility → agrégation par ligne de commande ──
  // Le même endpoint que le store OF renvoie `orders[]`. Chaque ligne porte `ligne`
  // (VCRLIN_0) → clé `${numCommande}#${ligne}` = id carte. On agrège ses OF :
  // bloquée si au moins 1 OF en rupture (feasible === false), missing = union des
  // composants manquants des OF bloqués. Parité visuelle avec la vue OF (badges ✓/!).
  function runFeasibility(from: string, to: string) {
    if (!from || !to || feasLoading()) return
    setFeasLoading(true)
    fetch(route('planning_board.board_feasibility'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, mode: mode() }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{
          orders?: Array<{
            numCommande: string
            ligne?: string | null
            ofs?: Array<{ feasible?: boolean | null; missingComponents?: Record<string, number> }>
          }>
        }>
      })
      .then((data) => {
        const map: Record<string, FeasStatus> = {}
        let nbOk = 0
        let nbBlocked = 0
        for (const o of data.orders ?? []) {
          // Ligne sans n° (prévision sans VCRLIN) → pas de carte rattachable, on saute.
          if (!o.ligne) continue
          const cardId = `${o.numCommande}#${o.ligne}`
          const blockedOfs = (o.ofs ?? []).filter((of) => of.feasible === false)
          if (blockedOfs.length > 0) {
            // Union des composants manquants des OF bloqués de cette ligne.
            const missing = new Set<string>()
            for (const of of blockedOfs) {
              for (const comp of Object.keys(of.missingComponents ?? {})) missing.add(comp)
            }
            map[cardId] = { st: 'blocked', missing: Array.from(missing) }
            nbBlocked++
          } else {
            map[cardId] = { st: 'ok', missing: [] }
            nbOk++
          }
        }
        setFeasibility(map)
        toast(
          nbBlocked > 0 ? `${nbBlocked} bloquée(s) · ${nbOk} OK` : `${nbOk} ligne(s) réalisables`
        )
      })
      .catch((err) => toast(`Échec : ${err.message}`))
      .finally(() => setFeasLoading(false))
  }

  // ── Drag : PATCH override + optimistic + rollback ──
  function moveCard(id: string, fromLineCode: string, toCol: number, toIso: string) {
    const [numCommande, ligne] = id.split('#')
    if (!numCommande || !ligne) return

    const findPos = () => {
      for (let li = 0; li < board.lines.length; li++) {
        const cells = board.lines[li].dayCells
        for (const [ci, cell] of cells.entries()) {
          const idx = cell.cards.findIndex((c) => c.id === id)
          if (idx !== -1) return { line: li, col: ci, idx, card: cell.cards[idx] }
        }
      }
      return null
    }
    const from = findPos()
    if (!from) return
    // Interdit cross-row (poste figé par la gamme).
    if (board.lines[from.line].code !== fromLineCode) {
      toast('Poste figé par la gamme — déplacez seulement le jour.')
      return
    }
    if (from.col === toCol) return

    const toLine = board.lines.findIndex((l) => l.code === fromLineCode)
    if (toLine === -1) return
    const snapshot = { line: from.line, col: from.col, idx: from.idx }
    const card = from.card

    setBoard(
      produce((b) => {
        b.lines[snapshot.line].dayCells[snapshot.col].cards.splice(snapshot.idx, 1)
        b.lines[toLine].dayCells[toCol].cards.push({
          ...card,
          hasOverride: true,
          accentClass: 'border-l-amber-500',
          cardClass: 'bg-amber-50/40',
          idTone: 'text-amber-700',
        })
      })
    )
    // Un déplacement de date change le verdict de faisabilité (calculé sur l'ancienne
    // date) → on invalide le cache, comme dans le store OF.
    setFeasibility({})

    fetch(route('order_planning.update', { order: numCommande, line: ligne }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLivraison: toIso }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      })
      .catch((err) => {
        setBoard(
          produce((b) => {
            const ci = b.lines[toLine].dayCells[toCol].cards.findIndex((c) => c.id === id)
            if (ci !== -1) b.lines[toLine].dayCells[toCol].cards.splice(ci, 1)
            b.lines[snapshot.line].dayCells[snapshot.col].cards.splice(snapshot.idx, 0, card)
          })
        )
        sonnerToast.error(`Déplacement échoué : ${err.message}`)
      })
  }

  function resetOverride(id: string) {
    const [numCommande, ligne] = id.split('#')
    if (!numCommande || !ligne) return
    fetch(route('order_planning.reset_override', { order: numCommande, line: ligne }), {
      method: 'DELETE',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        toast('Override réinitialisé')
        // Rejoue la page côté serveur (date X3 d'origine) via Inertia.
        router.reload()
      })
      .catch((err) => toast(`Échec : ${err.message}`))
  }

  /** Resync après navigation Inertia (prev/next/today/horizon). */
  function reset(next: OrderBoardData) {
    setBoard(reconcile(next))
    setQuery('')
    // Les badges de faisabilité dépendent des cartes (changent avec la fenêtre).
    setFeasibility({})
  }

  /** Rafraîchit le contenu (bouton Actualiser) SANS toucher recherche/scope/filtres. */
  function updateData(next: OrderBoardData) {
    setBoard(reconcile(next))
  }

  function toast(detail: string) {
    sonnerToast(detail)
  }

  return {
    board,
    query,
    scope,
    typeFilter,
    natureFilter,
    atelierFilter,
    ateliers: () => board.ateliers ?? [],
    cardMatches,
    lineVisible,
    dayLoad,
    dayLoadSplit,
    lineWeekLoads,
    onQueryInput,
    onScopeChange,
    clearSearch,
    toggleType,
    toggleNature,
    toggleAtelier,
    clearAtelier,
    moveCard,
    resetOverride,
    reset,
    updateData,
    // Faisabilité (issue #21) — miroir du store OF, badges dérivés par ligne de commande.
    mode,
    setMode,
    feasOf,
    feasLoading,
    runFeasibility,
  }
}

export type OrderBoardStore = ReturnType<typeof createOrderBoardStore>
