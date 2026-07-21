import React, { useCallback, useEffect, useState, useRef } from 'react'
import { cn } from '@r/lib/utils'
import { Button } from '@r/components/ui/button'
import { router } from '@inertiajs/react'
import { route } from '@/lib/routes'
import { promiseReasonText } from '@/lib/promesse/types'
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
import type { PlanMutation } from '@/lib/scenarios/types'
import { FlaskConical, Save, Trash2, CirclePlus, Zap, TriangleAlert, Plus, FolderOpen, ArrowLeftRight } from 'lucide-react'
import { DynamicIcon } from '../ui/dynamic-icon'

/**
 * Bandeau du mode scénario (issue #57) : « Scénario ‹nom› — N mutations — Impacts
 * — Enregistrer / Appliquer / Jeter » + liste des scénarios enregistrés (rouvrir /
 * supprimer). Affiché sous la toolbar quand le mode scénario est actif.
 *
 * Le bandeau ne touche pas au board : Appliquer/Jeter/Rouvrir délèguent à
 * programme.tsx (seul détenteur des board stores) via callbacks.
 *
 * Issue #58 : bouton « + Commande virtuelle » — formulaire (article, qté, date de
 * besoin, client libre) qui empile une mutation `inject_demand`. Rien n'est écrit
 * en X3 ; la carte n'existe que dans le scénario (cf. VirtualCell sur le board).
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
  const s = useScenarioStore()
  const [listOpen, setListOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  // #62 (lot 0) : « Jeter » détruit N mutations sans retour possible → confirmation
  // explicite dès qu'il y a quelque chose à perdre (scénario vide : jet direct).
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const requestDiscard = useCallback(() => {
    if (s.current.mutations.length === 0) onDiscard()
    else setConfirmDiscardOpen(true)
  }, [s.current.mutations.length, onDiscard])

  const confirmDiscard = useCallback(() => {
    setConfirmDiscardOpen(false)
    onDiscard()
  }, [onDiscard])

  const [article, setArticle] = useState('')
  const [quantity, setQuantity] = useState('1')
  // CTP §6.1 : champ vide = « au plus tôt » (le moteur calcule la date engageante).
  const [date, setDate] = useState('')
  const [client, setClient] = useState('')

  // Load list on mount
  useEffect(() => {
    s.loadList()
  }, [s])

  // CTP §6.1 — date au plus tôt (mode engageante) recalculée en arrière-plan
  // dès que (article, qté) est valide. Sert à pré-remplir le champ date laissé
  // vide et à avertir si la date saisie est avant le possible.
  const [earliest, setEarliest] = useState<null | { date: string; limiting: string }>(null)
  const [earliestLoading, setEarliestLoading] = useState(false)
  const debounceIdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchEarliest = useCallback(async (art: string, qty: number): Promise<{ date: string; limiting: string } | null> => {
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
  }, [])

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
    s.computeDiff(windowFrom, windowTo)
    onShowDiff()
  }, [s, windowFrom, windowTo, onShowDiff])

  const mutationCount = s.current.mutations.length

  return (
    <div className="flex flex-none flex-wrap items-center gap-3 border-b border-brand/40 bg-brand-soft px-7 py-2">
      <FlaskConical size={18} strokeWidth={1.75} className="text-brand" />
      <span className="font-fraunces text-[13px] font-bold text-brand">Scénario</span>

      {/* Nom éditable */}
      <input
        type="text"
        value={s.current.nom}
        placeholder="Nommer le scénario…"
        onInput={(e) => s.setNom(e.currentTarget.value)}
        className="h-[28px] w-[200px] rounded-full border border-brand/30 bg-card px-3 text-[12px] font-semibold text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      />

      {/* Règle d'allocation */}
      <select
        value={s.current.strategy ?? 'date_besoin'}
        onChange={(e) => s.setStrategy(e.currentTarget.value as any)}
        className="h-[28px] rounded-full border border-brand/30 bg-card px-3 text-[11px] font-semibold text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      >
        <option value="date_besoin">Date de besoin (défaut)</option>
        <option value="date_passation">Date de passation (anticipation)</option>
        <option value="priorite_previsions">Priorité clients à prévisions</option>
      </select>

      <span className="rounded-full bg-card px-2.5 py-1 font-mono text-[11px] font-bold text-foreground">
        {mutationCount} mutation{mutationCount > 1 ? 's' : ''}
      </span>

      {s.current.statut === 'applique' && (
        <span className="rounded-full bg-ferme/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ferme">
          Appliqué
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={mutationCount === 0 || s.diffLoading}
          onClick={openDiff}
          className="gap-1.5"
        >
          <DynamicIcon
            name={s.diffLoading ? 'progress_activity' : 'insights'}
            size={15}
            strokeWidth={1.75}
            className={cn(s.diffLoading && 'animate-spin')}
          />
          Impacts
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={s.saving}
          onClick={() => s.save()}
          className="gap-1.5"
        >
          <Save size={15} strokeWidth={1.75} />
          {s.saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>

        <Button size="sm" disabled={mutationCount === 0 || applying} onClick={onApply} className="gap-1.5">
          <DynamicIcon
            name={applying ? 'progress_activity' : 'play_arrow'}
            size={15}
            strokeWidth={1.75}
            className={cn(applying && 'animate-spin')}
          />
          {applying ? 'Application…' : 'Appliquer'}
        </Button>

        <Button size="sm" variant="ghost" onClick={requestDiscard} className="gap-1.5">
          <Trash2 size={15} strokeWidth={1.75} />
          Jeter
        </Button>

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

        {/* #58 — commande virtuelle (mutation inject_demand, what-if) */}
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setFormOpen((o) => !o)} className="gap-1.5">
            <CirclePlus size={15} strokeWidth={1.75} />
            Commande virtuelle
          </Button>
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
                className="absolute right-0 top-full z-50 mt-2 w-[280px] space-y-2 rounded-lg border border-brand/40 bg-card p-3 shadow-lg"
              >
                <p className="font-fraunces text-[12px] font-bold text-brand">+ Commande virtuelle</p>
                <input
                  list="scenario-article-options"
                  required
                  value={article}
                  onInput={(e) => setArticle(e.currentTarget.value)}
                  placeholder="Article"
                  className="h-[28px] w-full rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
                />
                <datalist id="scenario-article-options">
                  {articleOptions.map((a, i) => (
                    <option key={i} value={a} />
                  ))}
                </datalist>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onInput={(e) => setQuantity(e.currentTarget.value)}
                    placeholder="Qté"
                    className="h-[28px] w-[80px] rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
                  />
                  <input
                    type="date"
                    value={date}
                    onInput={(e) => setDate(e.currentTarget.value)}
                    title="Vide = date au plus tôt (calculée par le moteur CTP)"
                    className="h-[28px] flex-1 rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
                  />
                </div>
                {/* CTP §6.1 — date vide : le moteur propose ; date saisie trop tôt : avertit. */}
                {!date && (earliestLoading || earliest) && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Zap size={13} strokeWidth={1.75} className="text-brand" />
                    {!earliestLoading ? (
                      earliest?.date ? (
                        <>
                          Au plus tôt le <strong>{new Date(earliest.date).toLocaleDateString('fr-FR')}</strong>
                          {earliest.limiting && <> — {earliest.limiting}</>}
                        </>
                      ) : (
                        <span className="text-error">Article {earliest?.limiting}</span>
                      )
                    ) : (
                      'Calcul de la date au plus tôt…'
                    )}
                  </p>
                )}
                {date && earliest?.date && date < earliest.date && (
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-warning">
                    <TriangleAlert size={13} strokeWidth={1.75} />
                    Infaisable à cette date — sinon possible au plus tôt le{' '}
                    {new Date(earliest.date).toLocaleDateString('fr-FR')}
                  </p>
                )}
                <input
                  value={client}
                  onInput={(e) => setClient(e.currentTarget.value)}
                  placeholder="Client (libre, optionnel)"
                  className="h-[28px] w-full rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
                />
                <Button type="submit" size="sm" className="w-full gap-1.5">
                  <Plus size={15} strokeWidth={1.75} />
                  {date ? 'Ajouter au scénario' : 'Ajouter au plus tôt'}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Liste des scénarios enregistrés */}
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setListOpen((o) => !o)} className="gap-1.5">
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
              <div className="absolute right-0 top-full z-50 mt-2 max-h-[60vh] w-[300px] overflow-y-auto rounded-lg border border-rule bg-card p-1 shadow-lg">
                {s.list.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] italic text-muted-foreground">
                    Aucun scénario enregistré.
                  </div>
                ) : (
                  s.list.map((sc) => (
                    <div key={sc.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
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
                              : 'besoin'} ·{' '}
                          {sc.auteur ?? '—'}
                        </div>
                      </button>
                      <button
                        type="button"
                        title="Supprimer"
                        className="text-muted-foreground hover:text-error"
                        onClick={() => s.remove(sc.id)}
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
      </div>
    </div>
  )
}
