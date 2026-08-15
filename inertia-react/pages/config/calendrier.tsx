import { useCallback, useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { router } from '@inertiajs/react'

import AppLayout from '@r/layouts/app'
import { Button } from '@r/components/ui/button'
import { Badge } from '@r/components/ui/badge'
import { Pill } from '@r/components/ui/pill'
import { Switch } from '@r/components/ui/switch'
import { CellDate, CellNumber, CellStack } from '@r/components/ui/table-row'
import {
  ToolbarDateWindow,
  ToolbarGroup,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import {
  Combobox,
  ComboboxContent,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import {
  CalendarDays,
  Wrench,
  Pencil,
  Trash2,
  Plus,
  CalendarRange,
  TriangleAlert,
  X,
} from 'lucide-react'
import { route } from '@r/lib/routes'
import { toast } from 'sonner'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'

/**
 * Configuration du calendrier usine (issue #37) — port React du Solid
 * inertia/pages/config/calendrier.tsx.
 *
 * Deux blocs : jours fériés FR (activer/désactiver) + fermetures par ligne de
 * production (CRUD). La capacité de /charge en découle directement.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • sous-nav Calendrier / Impressions en `ToolbarSegmented` (zone 01),
 *   Registre / Frise en second segmented — plus de `vision/toolbar` ;
 * • tables `DataTable` + `CellStack` / `CellDate` / `CellNumber` / `Badge` ;
 * • plus de `font-fraunces` ni de filet Airbnb (`border-rule`, `px-7`).
 */

interface Holiday {
  date: string
  name: string
  active: boolean
}
interface Closure {
  id: number
  scope: 'global' | 'wst' | 'stoloc'
  code: string
  from: string
  to: string
  factor: number
  motif: string
}
interface Poste {
  code: string
  label: string
  atelier: string
}
interface Atelier {
  code: string
  label: string
}
interface CalendrierPageProps {
  year: number
  holidays: Holiday[]
  closures: Closure[]
  postes: Poste[]
  ateliers: Atelier[]
}

type View = 'registre' | 'frise'

/** ISO `YYYY-MM-DD` → jj/mm/aaaa. */
const frFull = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

const factorLabel = (f: number): string =>
  f <= 0 ? '0 %' : f >= 1 ? '100 %' : `${Math.round(f * 100)} %`

const motifLabel = (m: string): string =>
  m === 'maintenance' ? 'Maintenance' : m === 'conges' ? 'Congés' : m || 'Autre'

const scopeChip = (c: Closure): { label: string; code: string } => {
  if (c.scope === 'global') return { label: "Toute l'usine", code: 'Usine' }
  if (c.scope === 'stoloc') return { label: `Atelier ${c.code}`, code: c.code }
  return { label: c.code, code: c.code }
}

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00`)

/** Field wrapper pour les formulaires. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/** Formulaire d'ajout de fermeture (inline, pas de Sheet). */
function ClosureForm({
  postes,
  ateliers,
  edit,
  onCancel,
  onResult,
  onDone,
}: {
  postes: Poste[]
  ateliers: Atelier[]
  edit?: Closure
  onCancel: () => void
  onResult: (res: { closure: Closure; removedIds: number[]; warn: boolean }) => void
  onDone: () => void
}) {
  const [scope, setScope] = useState<'global' | 'wst' | 'stoloc'>(edit?.scope ?? 'wst')
  const [codes, setCodes] = useState<string[]>(edit && edit.scope !== 'global' ? [edit.code] : [])
  const [range, setRange] = useState<DayPickerRange | undefined>(
    edit ? { from: isoToDate(edit.from), to: isoToDate(edit.to) } : undefined
  )
  const [motif, setMotif] = useState(edit?.motif || 'maintenance')
  const [factor, setFactor] = useState(edit ? String(edit.factor) : '0')
  const [busy, setBusy] = useState(false)

  const anchorRef = useComboboxAnchor()

  const codeOptions = useMemo(
    () =>
      scope === 'stoloc'
        ? ateliers.map((a) => ({ value: a.code, label: a.label }))
        : postes.map((p) => ({ value: p.code, label: p.code })),
    [scope, ateliers, postes]
  )

  const post = async (body: Omit<Closure, 'id'>) => {
    const res = await fetch(route('calendar_config.create_closure'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { closure: Closure; removedIds: number[]; warn: boolean }
    onResult(data)
  }

  const submit = async () => {
    if (!range?.from) return
    const base = {
      from: toIso(range.from),
      to: toIso(range.to ?? range.from),
      motif,
      factor: Number(factor),
    }
    setBusy(true)
    try {
      if (edit) {
        const res = await fetch(route('calendar_config.update_closure', { id: edit.id }), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(base),
        })
        const data = (await res.json()) as { closure: Closure; removedIds: number[]; warn: boolean }
        onResult(data)
      } else if (scope === 'global') {
        await post({ scope: 'global', code: '', ...base })
      } else {
        for (const code of codes) await post({ scope, code, ...base })
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const targetLabel = (c: Closure) =>
    c.scope === 'global' ? "Toute l'usine" : c.scope === 'stoloc' ? `Atelier ${c.code}` : c.code

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3.5 rounded-b-lg border-t border-border bg-secondary px-4 py-4">
      {!edit ? (
        <>
          <Field label="Portée">
            <ToolbarSegmented semantics="tabs" aria-label="Portée">
              <ToolbarSegment
                active={scope === 'wst'}
                onClick={() => {
                  setScope('wst')
                  setCodes([])
                }}
              >
                Poste
              </ToolbarSegment>
              <ToolbarSegment
                active={scope === 'stoloc'}
                onClick={() => {
                  setScope('stoloc')
                  setCodes([])
                }}
              >
                Atelier
              </ToolbarSegment>
              <ToolbarSegment
                active={scope === 'global'}
                onClick={() => {
                  setScope('global')
                  setCodes([])
                }}
              >
                Toute l&apos;usine
              </ToolbarSegment>
            </ToolbarSegmented>
          </Field>

          {scope !== 'global' && (
            <Field label={scope === 'wst' ? 'Postes' : 'Ateliers'}>
              <div ref={anchorRef}>
                <Combobox value={codes} onValueChange={setCodes} multiple>
                  <ComboboxChips>
                    <ComboboxChipsInput
                      placeholder={
                        scope === 'wst' ? 'Ajouter des postes…' : 'Ajouter des ateliers…'
                      }
                    />
                  </ComboboxChips>
                  <ComboboxTrigger />
                  <ComboboxContent anchor={anchorRef}>
                    <ComboboxList>
                      {codeOptions.map((opt) => (
                        <ComboboxItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </ComboboxItem>
                      ))}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            </Field>
          )}
        </>
      ) : (
        <Field label="Ligne">
          <Badge variant="outline">{targetLabel(edit)}</Badge>
        </Field>
      )}

      <Field label="Période">
        <ToolbarDateWindow
          value={range}
          onCommit={setRange}
          numberOfMonths={1}
          title="Période de fermeture"
        />
      </Field>

      <Field label="Motif">
        <ToolbarSegmented semantics="tabs" aria-label="Motif">
          <ToolbarSegment active={motif === 'maintenance'} onClick={() => setMotif('maintenance')}>
            Maintenance
          </ToolbarSegment>
          <ToolbarSegment active={motif === 'conges'} onClick={() => setMotif('conges')}>
            Congés
          </ToolbarSegment>
          <ToolbarSegment active={motif === 'autre'} onClick={() => setMotif('autre')}>
            Autre
          </ToolbarSegment>
        </ToolbarSegmented>
      </Field>

      <Field label="Capacité">
        <ToolbarSegmented semantics="tabs" aria-label="Capacité">
          <ToolbarSegment active={factor === '0'} onClick={() => setFactor('0')}>
            Fermé
          </ToolbarSegment>
          <ToolbarSegment active={factor === '0.5'} onClick={() => setFactor('0.5')}>
            Demi-journée
          </ToolbarSegment>
        </ToolbarSegmented>
      </Field>

      <div className="ml-auto flex items-center gap-2 self-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={submit}
          disabled={busy || !range?.from || (!edit && scope !== 'global' && codes.length === 0)}
        >
          {edit ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </div>
    </div>
  )
}

function createClosureColumns(deps: {
  setFormState: (s: { mode: 'edit'; closure: Closure }) => void
  removeClosure: (id: number) => void
}): ColumnDef<Closure>[] {
  const { setFormState, removeClosure } = deps
  return [
    {
      id: 'ligne',
      accessorFn: (c) => scopeChip(c).label,
      header: () => 'Ligne',
      cell: ({ row: { original: c } }) => {
        const chip = scopeChip(c)
        return <CellStack code={chip.code} label={chip.label} />
      },
    },
    {
      accessorKey: 'from',
      header: () => 'Du',
      cell: ({ row: { original: c } }) => <CellDate date={frFull(c.from)} />,
    },
    {
      accessorKey: 'to',
      header: () => 'Au',
      cell: ({ row: { original: c } }) => <CellDate date={frFull(c.to)} />,
    },
    {
      accessorKey: 'motif',
      header: () => 'Motif',
      cell: ({ row: { original: c } }) => (
        <Badge variant={c.motif === 'maintenance' ? 'warning' : 'secondary'}>
          {motifLabel(c.motif)}
        </Badge>
      ),
    },
    {
      accessorKey: 'factor',
      header: () => 'Capacité',
      cell: ({ row: { original: c } }) => (
        <CellNumber tone={c.factor <= 0 ? 'critical' : 'warning'} value={factorLabel(c.factor)} />
      ),
      meta: { thClass: 'text-right!', tdClass: 'text-right' },
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row: { original: c } }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setFormState({ mode: 'edit', closure: c })}
            title="Éditer"
          >
            <Pencil size={16} />
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => removeClosure(c.id)}
            title="Supprimer"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ),
      meta: { tdClass: 'text-right' },
    },
  ]
}

export default function Calendrier(props: CalendrierPageProps) {
  const [view, setView] = useState<View>('registre')
  const [holidays, setHolidays] = useState<Holiday[]>(props.holidays)
  const [closures, setClosures] = useState<Closure[]>(props.closures)
  const [formState, setFormState] = useState<
    { mode: 'add' } | { mode: 'edit'; closure: Closure } | null
  >(null)
  const [warn, setWarn] = useState('')
  const [closureSorting, setClosureSorting] = useState<SortingState[]>([])

  const activeCount = useMemo(() => holidays.filter((h) => h.active).length, [holidays])

  const applyResult = (res: { closure: Closure; removedIds: number[]; warn: boolean }) => {
    setClosures((prev) => {
      const next = [...prev]
      for (const id of res.removedIds) {
        const i = next.findIndex((c) => c.id === id)
        if (i >= 0) next.splice(i, 1)
      }
      const i = next.findIndex((c) => c.id === res.closure.id)
      if (i >= 0) next[i] = res.closure
      else next.push(res.closure)
      return next
    })
    if (res.warn) {
      setWarn(
        'Chevauchement avec une fermeture de motif/capacité différents — le plus restrictif s’applique.'
      )
    }
    toast.success('Calendrier enregistré. La vue Charge est actualisée.')
  }

  const toggleHoliday = (date: string) => {
    const i = holidays.findIndex((h) => h.date === date)
    if (i < 0) return
    const next = !holidays[i].active
    setHolidays((prev) => {
      const updated = [...prev]
      updated[i] = { ...updated[i], active: next }
      return updated
    })
    fetch(route('calendar_config.toggle_holiday'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, active: next }),
    })
      .then(() => toast.success('Calendrier enregistré. La vue Charge est actualisée.'))
      .catch(() => {
        setHolidays((prev) => {
          const updated = [...prev]
          updated[i] = { ...updated[i], active: !next }
          return updated
        })
      })
  }

  const removeClosure = useCallback(
    (id: number) => {
      const snapshot = closures.find((c) => c.id === id)
      setClosures((cs) => cs.filter((c) => c.id !== id))
      fetch(route('calendar_config.delete_closure', { id }), { method: 'DELETE' })
        .then(() => toast.success('Fermeture supprimée. La vue Charge est actualisée.'))
        .catch(() => {
          if (snapshot) setClosures((prev) => [...prev, snapshot])
        })
    },
    [closures]
  )

  const closureColumns = useMemo(
    () => createClosureColumns({ setFormState, removeClosure }),
    [setFormState, removeClosure]
  )

  const toolbar = (
    <>
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Configuration">
          <ToolbarSegment active>Calendrier</ToolbarSegment>
          <ToolbarSegment onClick={() => router.visit(route('print_config.index'))}>
            Impressions
          </ToolbarSegment>
          <ToolbarSegment onClick={() => router.visit(route('data_config.index'))}>
            Données
          </ToolbarSegment>
        </ToolbarSegmented>

        <ToolbarSegmented semantics="tabs" aria-label="Vue">
          <ToolbarSegment active={view === 'registre'} onClick={() => setView('registre')}>
            Registre
          </ToolbarSegment>
          <ToolbarSegment active={view === 'frise'} onClick={() => setView('frise')}>
            Frise
          </ToolbarSegment>
        </ToolbarSegmented>
      </ToolbarGroup>

      <ToolbarSpacer />

      <Pill variant="outline" onClick={() => router.visit(route('print_journal'))}>
        Journal des tirages
      </Pill>
    </>
  )

  return (
    <AppLayout
      title="Calendrier usine"
      active="config"
      subtitle={`Calendrier usine · ${props.year}`}
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-5">
          <p className="mb-5 text-sm text-muted-foreground">
            Jours ouvrés = calendrier français (fériés) moins les fermetures saisies par ligne. La
            capacité de <span className="font-medium text-foreground">/charge</span> en découle
            directement.
          </p>

          {warn && (
            <div className="mb-4 flex items-center gap-2 border border-suggere/30 bg-suggere/10 px-5 py-2 text-xs text-foreground">
              <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-suggere" />
              <span className="flex-1">{warn}</span>
              <button
                type="button"
                onClick={() => setWarn('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {view === 'registre' ? (
            <div className="grid grid-cols-[380px_1fr] items-start gap-6">
              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <CalendarDays size={16} strokeWidth={1.75} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Jours fériés France</span>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {activeCount} actifs
                  </span>
                </header>
                {holidays.map((h) => (
                  <div
                    key={h.date}
                    className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0"
                  >
                    <span className="w-[5.5rem] flex-none font-mono text-xs tabular-nums text-foreground">
                      {frFull(h.date)}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {h.name}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {h.active ? 'chômé · capacité 0 h' : 'travaillé (désactivé)'}
                      </span>
                    </span>
                    <Switch
                      className="ml-auto"
                      checked={h.active}
                      onCheckedChange={() => toggleHoliday(h.date)}
                      aria-label={`${h.name} : ${h.active ? 'chômé' : 'travaillé'}`}
                    />
                  </div>
                ))}
              </section>

              <section className="rounded-lg border border-border bg-card">
                <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Wrench size={16} strokeWidth={1.75} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    Fermetures par ligne de production
                  </span>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {closures.length} actives
                  </span>
                </header>

                {closures.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Aucune fermeture saisie.
                  </div>
                ) : (
                  <DataTable
                    columns={closureColumns}
                    rows={closures}
                    sorting={closureSorting}
                    onSortingChange={setClosureSorting}
                    virtualize={false}
                    tableClass="w-full border-collapse"
                    scrollContainerClass="rounded-none border-0 shadow-none"
                    getRowKey={(c) => String(c.id)}
                  />
                )}

                {formState === null ? (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormState({ mode: 'add' })}
                    >
                      <Plus size={16} />
                      Nouvelle fermeture
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Portée : poste (WST) ou atelier (STOLOC). 0 % = fermé · 50 % = demi-journée.
                    </span>
                  </div>
                ) : (
                  <ClosureForm
                    postes={props.postes}
                    ateliers={props.ateliers}
                    edit={formState.mode === 'edit' ? formState.closure : undefined}
                    onCancel={() => setFormState(null)}
                    onResult={applyResult}
                    onDone={() => setFormState(null)}
                  />
                )}
              </section>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-20 text-center">
              <CalendarRange size={32} strokeWidth={1.75} className="text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">Vue Frise — bientôt</div>
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                Timeline par poste sur l&apos;année (fériés + fermetures déplaçables). Conçue, pas
                encore câblée — la vue Registre reste la source d&apos;édition.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
