import React, { useCallback, useEffect, useState, useRef } from 'react'
import { cn } from '@r/lib/utils'
import { Button } from '@r/components/ui/button'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import { route } from '@r/lib/routes'
import { promiseReasonText } from '@r/lib/promesse/types'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPortal,
  AlertDialogTitle,
} from '@r/components/ui/alert-dialog'
import { useScenarioStore } from '@r/lib/scenario/store'
import type { PlanMutation } from '@r/lib/scenario/types'
import {
  FlaskConical,
  Save,
  Trash2,
  CirclePlus,
  Zap,
  TriangleAlert,
  Plus,
  FolderOpen,
  ArrowLeftRight,
  ChevronDown,
  CalendarDays,
  CalendarIcon,
  X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'react-day-picker/locale'
import { Popover } from '@base-ui/react/popover'
import { Calendar } from '@r/components/ui/calendar'
import { TextFieldInput } from '@r/components/ui/text-field'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@r/components/ui/combobox'
import { DynamicIcon } from '../ui/dynamic-icon'

/** jj/mm/aaaa pour la date de besoin affichée dans le déclencheur du calendrier. */
const fmtNeed = (iso: string) => {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy')
  } catch {
    return iso
  }
}

const MICRO_LABEL = 'mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground'

/**
 * Mode scénario (issue #57) — V3 « décision flottante » (redesign 2026-07-26,
 * validé sur design/showcase/scenario-redesign.html) :
 * • bandeau haut = identité seule (Scénario + nom + compteur-phrase + outils :
 *   dropdown « + Mutation », Ouvrir, règle d'allocation) — fond blanc, pas de teinte ;
 * • la décision (Impacts / Enregistrer / Appliquer / Jeter) descend dans une
 *   pilule encre flottante sur le board (grammaire des toasts sonner), visible
 *   tant qu'il reste des mutations en attente — mental model « changements non
 *   enregistrés ». Appliquer est le seul solid Rausch ; Jeter est repoussé en
 *   ghost destructif.
 *
 * Le dropdown « + Mutation » présente la commande virtuelle comme une option
 * parmi d'autres : inject_demand est la seule mutation créée depuis la barre
 * (formulaire) ; shift_of / shift_demand naissent du glisser-déposer sur le
 * board (rappel de geste dans le menu). suspend_supply n'a pas encore de
 * geste front → pas d'option morte.
 *
 * Le bandeau ne touche pas au board : Appliquer/Jeter/Rouvrir délèguent à
 * programme.tsx (seul détenteur des board stores) via callbacks.
 */

interface ScenarioBarProps {
  windowFrom: string
  windowTo: string
  applying: boolean
  articleOptions: string[]
  onApply: () => void
  onDiscard: () => void
  onOpenScenario: (id: number) => void
  onShowDiff: () => void
  onInjectDemand: (m: Extract<PlanMutation, { type: 'inject_demand' }>) => void
}

export function ScenarioBar({
  windowFrom,
  windowTo,
  applying,
  articleOptions,
  onApply,
  onDiscard,
  onOpenScenario,
  onShowDiff,
  onInjectDemand,
}: ScenarioBarProps) {
  // Sélecteurs fins, un par tranche affichée. `useScenarioStore()` sans sélecteur
  // s'abonne à l'état ENTIER, dont l'identité change à chaque `set()` : l'effet de
  // chargement de la liste se redéclenchait alors sur son propre `set({ listLoading })`,
  // en rafale de GET /scenarios jusqu'à tuer le serveur de dev.
  const nom = useScenarioStore((st) => st.current.nom)
  const strategy = useScenarioStore((st) => st.current.strategy)
  const statut = useScenarioStore((st) => st.current.statut)
  const mutations = useScenarioStore((st) => st.current.mutations)
  const diffLoading = useScenarioStore((st) => st.diffLoading)
  const saving = useScenarioStore((st) => st.saving)
  const list = useScenarioStore((st) => st.list)
  // Actions : références stables posées à la création du store, jamais recréées.
  const setNom = useScenarioStore((st) => st.setNom)
  const setStrategy = useScenarioStore((st) => st.setStrategy)
  const save = useScenarioStore((st) => st.save)
  const remove = useScenarioStore((st) => st.remove)
  const computeDiff = useScenarioStore((st) => st.computeDiff)

  const [menuOpen, setMenuOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  // Ancre du Combobox article : le panneau (portal) se positionne dessus avec
  // évitement de collision natif (base-ui), mieux que l'ancien datalist natif.
  const articleAnchorRef = useRef<HTMLDivElement>(null)
  // #62 (lot 0) : « Jeter » détruit N mutations sans retour possible → confirmation
  // explicite dès qu'il y a quelque chose à perdre (scénario vide : jet direct).
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const requestDiscard = useCallback(() => {
    if (mutations.length === 0) onDiscard()
    else setConfirmDiscardOpen(true)
  }, [mutations, onDiscard])

  const confirmDiscard = useCallback(() => {
    setConfirmDiscardOpen(false)
    onDiscard()
  }, [onDiscard])

  const [article, setArticle] = useState('')
  const [quantity, setQuantity] = useState('1')
  // CTP §6.1 : champ vide = « au plus tôt » (le moteur calcule la date engageante).
  const [date, setDate] = useState('')
  const [client, setClient] = useState('')

  // Chargement de la liste au montage, une fois. Le bandeau ne monte qu'à l'entrée en
  // mode scénario : y revenir la recharge, ce qui suffit.
  useEffect(() => {
    useScenarioStore.getState().loadList()
  }, [])

  // CTP §6.1 — date au plus tôt (mode engageante) recalculée en arrière-plan
  // dès que (article, qté) est valide. Sert à pré-remplir le champ date laissé
  // vide et à avertir si la date saisie est avant le possible.
  const [earliest, setEarliest] = useState<null | { date: string; limiting: string }>(null)
  const [earliestLoading, setEarliestLoading] = useState(false)
  const debounceIdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchEarliest = useCallback(
    async (art: string, qty: number): Promise<{ date: string; limiting: string } | null> => {
      setEarliestLoading(true)
      try {
        const params = new URLSearchParams({ article: art, quantity: String(qty) })
        const res = await fetch(`${route('promesse.index')}?${params}`)
        if (!res.ok) return null
        const data = await res.json()
        if (data.engageante?.infeasible) {
          const out = { date: '', limiting: 'infaisable (ni stock, ni flux, ni nomenclature)' }
          setEarliest(out)
          return out
        }
        const lf = data.engageante.limitingFactor
        const out = {
          date: String(data.engageante.promiseDate).slice(0, 10),
          limiting: lf ? `${lf.article} — ${promiseReasonText(lf.reason)}` : '',
        }
        setEarliest(out)
        return out
      } catch {
        return null
      } finally {
        setEarliestLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    const art = article.trim()
    const qty = Number(quantity)
    setEarliest(null)
    if (debounceIdRef.current) clearTimeout(debounceIdRef.current)
    if (!formOpen || !art || !Number.isFinite(qty) || qty <= 0) return
    debounceIdRef.current = setTimeout(() => {
      fetchEarliest(art, qty)
    }, 400)
    return () => {
      if (debounceIdRef.current) clearTimeout(debounceIdRef.current)
    }
  }, [formOpen, article, quantity, fetchEarliest])

  const submitInject = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const art = article.trim()
      const qty = Number(quantity)
      if (!art || !Number.isFinite(qty) || qty <= 0) return
      let besoin = date
      let fromEngine = false
      if (!besoin) {
        // Date vide → date au plus tôt du moteur CTP (déjà chargée ou à la volée).
        const e2 = earliest ?? (await fetchEarliest(art, qty))
        if (!e2?.date) return
        besoin = e2.date
        fromEngine = true
      }
      onInjectDemand({
        type: 'inject_demand',
        id: `VIRT-${Date.now().toString(36)}`,
        article: art,
        quantity: qty,
        date: besoin,
        client: client.trim() || undefined,
        earliest: fromEngine || undefined,
      })
      setArticle('')
      setQuantity('1')
      setDate('')
      setClient('')
      setFormOpen(false)
    },
    [article, quantity, date, client, earliest, onInjectDemand, fetchEarliest]
  )

  const openDiff = useCallback(() => {
    onShowDiff()
    computeDiff(windowFrom, windowTo).catch((err: Error) => {
      toast.error(`Impacts indisponibles : ${err.message}`)
    })
  }, [computeDiff, windowFrom, windowTo, onShowDiff])

  const mutationCount = mutations.length

  // Filtrage de l'autocomplete article (code insensible à la casse). Saisie libre
  // autorisée : la valeur tapée reste l'article même sans sélection dans la liste.
  const q = article.trim().toLowerCase()
  const filteredArticles = q
    ? articleOptions.filter((a) => a.toLowerCase().includes(q))
    : articleOptions

  return (
    <>
      {/* ── Bandeau identité — fond blanc, la parenthèse what-if est portée par
             le compteur-phrase, pas par la teinte. ── */}
      <div className="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule bg-card px-5 py-1.5">
        <FlaskConical size={17} strokeWidth={1.75} className="text-brand" />
        <span className="font-fraunces text-[13px] font-extrabold tracking-tight text-foreground">
          Scénario
        </span>

        {/* Nom éditable — souligné pointillé, discret tant qu'on n'édite pas. */}
        <input
          type="text"
          value={nom}
          placeholder="Nommer le scénario…"
          onInput={(e) => setNom(e.currentTarget.value)}
          className="w-[170px] border-0 border-b border-dashed border-input bg-transparent px-0.5 py-0.5 text-[12px] font-semibold text-foreground placeholder:text-muted-foreground focus:border-b-brand focus:outline-none"
        />

        {/* Compteur-phrase : le pouls du scénario. */}
        <span className="flex items-center gap-2 rounded-full border border-rule bg-card px-2.5 py-1 text-[11px] font-bold tabular-nums text-foreground">
          <span className="size-1.5 rounded-full bg-brand" />
          {mutationCount === 0
            ? 'Vierge'
            : `${mutationCount} mutation${mutationCount > 1 ? 's' : ''} en attente`}
        </span>

        {statut === 'applique' && (
          <span className="rounded-full bg-ferme/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ferme">
            Appliqué
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* ── Dropdown « + Mutation » : la commande virtuelle n'est qu'une
                 option ; les décalages naissent du glisser-déposer sur le board. ── */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFormOpen(false)
                setMenuOpen((o) => !o)
              }}
              className="gap-1.5"
            >
              <CirclePlus size={15} strokeWidth={1.75} />
              Mutation
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={cn(
                  'text-muted-foreground transition-transform',
                  menuOpen && 'rotate-180'
                )}
              />
            </Button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-2 w-[272px] rounded-xl border border-rule bg-card p-1.5 shadow-[var(--shadow-float)]">
                  <p className="px-2.5 pb-1.5 pt-1 text-[9px] font-extrabold uppercase tracking-[0.07em] text-muted-foreground">
                    Ajouter une mutation
                  </p>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    onClick={() => {
                      setMenuOpen(false)
                      setFormOpen(true)
                    }}
                  >
                    <CirclePlus
                      size={15}
                      strokeWidth={1.75}
                      className="mt-0.5 text-muted-foreground"
                    />
                    <span>
                      <b className="block text-[12px] font-bold text-foreground">
                        Commande virtuelle
                      </b>
                      <i className="mt-px block text-[11px] not-italic text-muted-foreground">
                        Injecter une demande client what-if
                      </i>
                    </span>
                  </button>
                  {/* Rappels de geste : ces mutations se créent sur le board, pas ici. */}
                  <div className="flex w-full cursor-default items-start gap-2.5 rounded-lg px-2.5 py-2 text-left">
                    <CalendarDays
                      size={15}
                      strokeWidth={1.75}
                      className="mt-0.5 text-muted-foreground"
                    />
                    <span className="flex-1">
                      <b className="block text-[12px] font-bold text-foreground/80">
                        Décaler un OF
                      </b>
                      <i className="mt-px block text-[11px] not-italic text-muted-foreground">
                        Glissez un OF sur le board
                      </i>
                    </span>
                    <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      board
                    </span>
                  </div>
                  <div className="flex w-full cursor-default items-start gap-2.5 rounded-lg px-2.5 py-2 text-left">
                    <ArrowLeftRight
                      size={15}
                      strokeWidth={1.75}
                      className="mt-0.5 text-muted-foreground"
                    />
                    <span className="flex-1">
                      <b className="block text-[12px] font-bold text-foreground/80">
                        Décaler une demande
                      </b>
                      <i className="mt-px block text-[11px] not-italic text-muted-foreground">
                        Glissez une ligne de commande sur le board
                      </i>
                    </span>
                    <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      board
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* #58 — commande virtuelle (mutation inject_demand, what-if),
                   ancrée sous le dropdown qui l'ouvre. */}
            {formOpen && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setFormOpen(false)}
                />
                <form
                  onSubmit={submitInject}
                  className="absolute left-0 top-full z-50 mt-2 w-[272px] rounded-xl border border-rule bg-card p-1.5 shadow-[var(--shadow-float)]"
                >
                  {/* Même coquille que le dropdown qui l'ouvre : 272 px, rounded-xl, p-1.5,
                      libellé de section en micro-capitales. Pas de titre Fraunces coloré —
                      le voltage Rausch reste réservé au CTA. */}
                  <p className="px-2.5 pb-1.5 pt-1 text-[9px] font-extrabold uppercase tracking-[0.07em] text-muted-foreground">
                    Commande virtuelle
                  </p>
                  <div className="space-y-2.5 px-2.5 pb-1.5">
                    {/* Article — Combobox du design system (portal + évitement de
                        collision) à la place du datalist natif, non stylable. Saisie
                        libre conservée : la valeur tapée vaut article sans sélection. */}
                    <div>
                      <p className={MICRO_LABEL}>Article</p>
                      <div ref={articleAnchorRef}>
                        {/* Contrôlé sur `inputValue`, PAS sur `value` : un article tapé
                            hors liste n'est pas une valeur sélectionnée, et le contrôle
                            de `value` le ferait effacer par le composant à la fermeture. */}
                        <Combobox
                          inputValue={article}
                          onInputValueChange={(v) => setArticle(v)}
                          onValueChange={(v) => v != null && setArticle(String(v))}
                        >
                          <ComboboxInput placeholder="Code article…" className="h-10 w-full" />
                          <ComboboxContent anchor={articleAnchorRef}>
                            <ComboboxList>
                              {filteredArticles.length === 0 ? (
                                <p className="px-2 py-3 text-center text-[12px] text-muted-foreground">
                                  Aucun article ne correspond.
                                </p>
                              ) : (
                                filteredArticles.slice(0, 50).map((a) => (
                                  <ComboboxItem key={a} value={a}>
                                    <span className="font-mono text-[12px] font-semibold">{a}</span>
                                  </ComboboxItem>
                                ))
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <div className="w-[76px]">
                        <p className={MICRO_LABEL}>Qté</p>
                        <TextFieldInput
                          type="number"
                          min="1"
                          required
                          value={quantity}
                          onChange={(e) => setQuantity(e.currentTarget.value)}
                          className="h-10 tabular-nums"
                        />
                      </div>
                      {/* Date de besoin — même déclencheur + Calendar que les fenêtres
                          du board ; l'input date natif n'a pas de rendu maîtrisable et
                          affichait « jj/mm/aaaa » en gris clair au milieu du formulaire. */}
                      <div className="min-w-0 flex-1">
                        <p className={MICRO_LABEL}>Besoin</p>
                        <Popover.Root open={dateOpen} onOpenChange={setDateOpen}>
                          <div className="relative">
                            <Popover.Trigger className="flex h-10 w-full items-center gap-2 rounded-[8px] border border-input bg-transparent px-3 text-[12px] transition-colors hover:border-foreground/40">
                              <CalendarIcon
                                size={14}
                                strokeWidth={1.75}
                                className="shrink-0 text-muted-foreground"
                              />
                              <span
                                className={cn(
                                  'truncate tabular-nums',
                                  !date && 'text-muted-foreground'
                                )}
                              >
                                {date ? fmtNeed(date) : 'Au plus tôt'}
                              </span>
                              {date && (
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  aria-label="Effacer la date"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDate('')
                                  }}
                                  className="ml-auto text-muted-foreground hover:text-foreground"
                                >
                                  <X size={13} strokeWidth={2} />
                                </span>
                              )}
                            </Popover.Trigger>
                            <Popover.Portal>
                              <Popover.Positioner
                                side="bottom"
                                align="end"
                                sideOffset={8}
                                collisionPadding={8}
                                className="z-50"
                              >
                                <Popover.Popup
                                  data-slot="popover-content"
                                  className="max-w-(--available-width) overflow-x-auto rounded-lg border border-rule bg-popover shadow-float"
                                >
                                  <Calendar
                                    mode="single"
                                    locale={fr}
                                    selected={date ? parseISO(date) : undefined}
                                    onSelect={(d) => {
                                      setDate(d ? format(d, 'yyyy-MM-dd') : '')
                                      setDateOpen(false)
                                    }}
                                  />
                                </Popover.Popup>
                              </Popover.Positioner>
                            </Popover.Portal>
                          </div>
                        </Popover.Root>
                      </div>
                    </div>
                    {/* CTP §6.1 — date vide : le moteur propose ; date saisie trop tôt : avertit. */}
                    {!date && (earliestLoading || earliest) && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Zap size={13} strokeWidth={1.75} className="shrink-0 text-brand" />
                        {!earliestLoading ? (
                          earliest?.date ? (
                            <>
                              Au plus tôt le{' '}
                              <strong className="font-bold tabular-nums text-foreground">
                                {new Date(earliest.date).toLocaleDateString('fr-FR')}
                              </strong>
                              {earliest.limiting && <> — {earliest.limiting}</>}
                            </>
                          ) : (
                            <span className="text-destructive">Article {earliest?.limiting}</span>
                          )
                        ) : (
                          'Calcul de la date au plus tôt…'
                        )}
                      </p>
                    )}
                    {date && earliest?.date && date < earliest.date && (
                      <p className="flex items-start gap-1.5 text-[11px] font-semibold text-warning">
                        <TriangleAlert size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                        <span className="tabular-nums">
                          Infaisable à cette date — sinon possible au plus tôt le{' '}
                          {new Date(earliest.date).toLocaleDateString('fr-FR')}
                        </span>
                      </p>
                    )}
                    <div>
                      <p className={MICRO_LABEL}>Client · optionnel</p>
                      <TextFieldInput
                        value={client}
                        onChange={(e) => setClient(e.currentTarget.value)}
                        placeholder="Nom libre"
                        className="h-10"
                      />
                    </div>
                    <Button type="submit" size="sm" className="w-full gap-1.5">
                      <Plus size={15} strokeWidth={1.75} />
                      {date ? 'Ajouter au scénario' : 'Ajouter au plus tôt'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>

          {/* Liste des scénarios enregistrés */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setListOpen((o) => !o)}
              className="gap-1.5"
            >
              <FolderOpen size={15} strokeWidth={1.75} />
              Ouvrir
            </Button>
            {listOpen && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setListOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-2 max-h-[60vh] w-[300px] overflow-y-auto rounded-xl border border-rule bg-card p-1 shadow-[var(--shadow-float)]">
                  {list.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[12px] italic text-muted-foreground">
                      Aucun scénario enregistré.
                    </div>
                  ) : (
                    list.map((sc) => (
                      <div
                        key={sc.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(sc.id)}
                          onChange={() => toggleSelect(sc.id)}
                          className="h-3.5 w-3.5 rounded border-brand/30 text-brand focus:ring-brand"
                        />
                        <button
                          type="button"
                          className="flex-1 text-left"
                          onClick={() => {
                            onOpenScenario(sc.id)
                            setListOpen(false)
                          }}
                        >
                          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                            {sc.nom}
                            {sc.statut === 'applique' && (
                              <span className="font-mono text-[9px] font-bold uppercase text-ferme">
                                appliqué
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {sc.mutations.length} mut. ·{' '}
                            {sc.strategy === 'date_passation'
                              ? 'passation'
                              : sc.strategy === 'priorite_previsions'
                                ? 'prévisions'
                                : 'besoin'}{' '}
                            · {sc.auteur ?? '—'}
                          </div>
                        </button>
                        <button
                          type="button"
                          title="Supprimer"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => remove(sc.id)}
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </div>
                    ))
                  )}
                  {selectedIds.length >= 2 && (
                    <div className="border-t border-brand/20 p-2">
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => {
                          router.visit(`/programme/scenarios/comparer?ids=${selectedIds.join(',')}`)
                        }}
                      >
                        <ArrowLeftRight size={15} strokeWidth={1.75} />
                        Comparer ({selectedIds.length})
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Règle d'allocation */}
          <select
            value={strategy ?? 'date_besoin'}
            onChange={(e) => setStrategy(e.currentTarget.value as any)}
            className="h-[28px] rounded-full border border-rule bg-card px-3 text-[11px] font-semibold text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          >
            <option value="date_besoin">Date de besoin (défaut)</option>
            <option value="date_passation">Date de passation (anticipation)</option>
            <option value="priorite_previsions">Priorité clients à prévisions</option>
          </select>
        </div>
      </div>

      {/* ── Barre de décision flottante — pilule encre bas-centre (grammaire
             des toasts sonner). Visible ⇔ mutations en attente : c'est le rappel
             permanent que rien n'est écrit en X3. z-30 : sous les backdrops des
             popovers (z-40), un clic dehors ferme d'abord le popover ouvert. ── */}
      {mutationCount > 0 && (
        <div
          role="toolbar"
          aria-label="Décision scénario"
          className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 print:hidden"
        >
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1.5 rounded-full bg-foreground py-1.5 pl-5 pr-2 shadow-[var(--shadow-overlay)]">
            <span className="mr-1 whitespace-nowrap text-[12px] font-semibold text-background/80">
              <b className="font-extrabold tabular-nums text-background">{mutationCount}</b>{' '}
              mutation
              {mutationCount > 1 ? 's' : ''} en attente
            </span>
            <span className="h-5 w-px bg-background/20" />

            <Button
              size="sm"
              variant="outline"
              disabled={diffLoading}
              onClick={openDiff}
              className="gap-1.5 border-white/25 bg-transparent text-background hover:bg-white/15 hover:text-background"
            >
              <DynamicIcon
                name={diffLoading ? 'progress_activity' : 'insights'}
                size={15}
                strokeWidth={1.75}
                className={cn(diffLoading && 'animate-spin')}
              />
              Impacts
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => save()}
              className="gap-1.5 border-white/25 bg-transparent text-background hover:bg-white/15 hover:text-background"
            >
              <Save size={15} strokeWidth={1.75} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>

            <Button size="sm" disabled={applying} onClick={onApply} className="gap-1.5">
              <DynamicIcon
                name={applying ? 'progress_activity' : 'play_arrow'}
                size={15}
                strokeWidth={1.75}
                className={cn(applying && 'animate-spin')}
              />
              {applying ? 'Application…' : 'Appliquer'}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={requestDiscard}
              className="gap-1.5 text-background/60 hover:bg-white/10 hover:text-[#ffb4a3]"
            >
              <Trash2 size={15} strokeWidth={1.75} />
              Jeter
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogPortal>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Jeter le scénario ?</AlertDialogTitle>
              <AlertDialogDescription>
                {mutationCount} mutation{mutationCount > 1 ? 's' : ''} non appliquée
                {mutationCount > 1 ? 's' : ''} ser{mutationCount > 1 ? 'ont' : 'a'} perdue
                {mutationCount > 1 ? 's' : ''} et le board reviendra à l'état réel. Cette action est
                irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button size="sm" variant="outline" onClick={() => setConfirmDiscardOpen(false)}>
                Annuler
              </Button>
              <Button size="sm" variant="destructive" onClick={confirmDiscard} className="gap-1.5">
                <Trash2 size={15} strokeWidth={1.75} />
                Jeter le scénario
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  )
}
