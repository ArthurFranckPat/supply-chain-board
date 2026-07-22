import { useMemo, useState } from 'react'
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'

import AppLayout from '@r/layouts/app'
import { Calendar } from '@r/components/ui/calendar'
import { Segment, SegmentButton } from '@r/components/vision/toolbar'
import { Button } from '@r/components/ui/button'
import { DynamicIcon } from '../../components/ui/dynamic-icon'
import {
  Calendar as CalendarIcon,
  ChevronDown,
  TriangleAlert,
  X,
  CalendarDays,
  Wrench,
  Pencil,
  Trash2,
  Plus,
  CalendarRange,
} from 'lucide-react'
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
import { cn } from '@r/lib/utils'
import { route } from '@/lib/routes'

/**
 * Configuration du calendrier usine (issue #37) — port React du Solid
 * inertia/pages/config/calendrier.tsx.
 *
 * Deux blocs : jours fériés FR (activer/désactiver) + fermetures par ligne de
 * production (CRUD). La capacité de /charge en découle directement.
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

const MOIS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

/** ISO `YYYY-MM-DD` → « 14 juil.». */
const frShort = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MOIS[m - 1]}`
}

/** ISO → « 14/07/26». */
const frNum = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const factorLabel = (f: number): string =>
  f <= 0 ? '0 %' : f >= 1 ? '100 %' : `${Math.round(f * 100)} %`

const motifLabel = (m: string): string =>
  m === 'maintenance' ? 'Maintenance' : m === 'conges' ? 'Congés' : m || 'Autre'

const scopeChip = (c: Closure): { label: string; dot: string } => {
  if (c.scope === 'global') return { label: "Toute l'usine", dot: 'var(--color-planifie)' }
  if (c.scope === 'stoloc') return { label: `Atelier ${c.code}`, dot: 'var(--color-planifie)' }
  return { label: c.code, dot: 'var(--color-ferme)' }
}

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00`)

interface DateRangeSel {
  start: Date | null
  end: Date | null
}

/** Toggle « pilule » (réutilise le langage visuel des onglets). */
function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { v: T; label: string }[]
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            'rounded-[5px] px-3 py-1.5 text-[12px] font-semibold transition-colors',
            value === o.v
              ? 'bg-brand-soft text-brand'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Field wrapper pour les formulaires. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
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
  const [range, setRange] = useState<DateRangeSel>(
    edit ? { start: isoToDate(edit.from), end: isoToDate(edit.to) } : { start: null, end: null }
  )
  const [motif, setMotif] = useState(edit?.motif || 'maintenance')
  const [factor, setFactor] = useState(edit ? String(edit.factor) : '0')
  const [busy, setBusy] = useState(false)
  const [calOpen, setCalOpen] = useState(false)

  const anchorRef = useComboboxAnchor()

  // Options du combobox selon la portée.
  const codeOptions = useMemo(
    () =>
      scope === 'stoloc'
        ? ateliers.map((a) => ({ value: a.code, label: a.label }))
        : postes.map((p) => ({ value: p.code, label: p.code })),
    [scope, ateliers, postes]
  )

  const rangeLabel = useMemo(() => {
    if (!range.start) return 'Choisir la période'
    const end = range.end ?? range.start
    return `${frNum(toIso(range.start))} → ${frNum(toIso(end))}`
  }, [range])

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
    if (!range.start) return
    const base = {
      from: toIso(range.start),
      to: toIso(range.end ?? range.start),
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

  const applyRange = (r: DayPickerRange | undefined) => {
    const next: DateRangeSel = { start: r?.from ?? null, end: r?.to ?? null }
    setRange(next)
    if (next.start && next.end) setCalOpen(false)
  }

  const targetLabel = (c: Closure) =>
    c.scope === 'global' ? "Toute l'usine" : c.scope === 'stoloc' ? `Atelier ${c.code}` : c.code

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3.5 rounded-b-lg border-t border-rule-soft bg-secondary px-4 py-4">
      {!edit ? (
        <>
          <Field label="Portée">
            <Pills
              value={scope}
              onChange={(v) => {
                setScope(v)
                setCodes([])
              }}
              options={[
                { v: 'wst', label: 'Poste' },
                { v: 'stoloc', label: 'Atelier' },
                { v: 'global', label: "Toute l'usine" },
              ]}
            />
          </Field>

          {scope !== 'global' && (
            <Field label={scope === 'wst' ? 'Postes' : 'Ateliers'}>
              <div ref={anchorRef}>
                <Combobox value={codes} onValueChange={setCodes} multiple>
                  <ComboboxChips>
                    <ComboboxChipsInput
                      placeholder={scope === 'wst' ? 'Ajouter des postes…' : 'Ajouter des ateliers…'}
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
          <span className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-rule bg-card px-3 font-mono text-[12.5px] font-bold">
            <span
              className="size-[7px] rounded-[2px]"
              style={{
                background: edit.scope === 'wst' ? 'var(--color-ferme)' : 'var(--color-planifie)',
              }}
            />
            {targetLabel(edit)}
          </span>
        </Field>
      )}

      <Field label="Période">
        <div className="relative">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            className="flex h-[34px] min-w-[170px] items-center gap-2 rounded-lg border border-rule bg-card px-3 text-[12.5px] font-semibold transition-colors hover:border-brand"
          >
            <CalendarIcon size={15} className="text-muted-foreground" />
            <span className={!range.start ? 'text-muted-foreground' : ''}>{rangeLabel}</span>
            <ChevronDown size={16} className="ml-auto text-muted-foreground" />
          </button>
          {calOpen && (
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setCalOpen(false)}
              />
              <div className="absolute left-0 top-full z-50 mt-2 rounded-lg border border-rule bg-popover shadow-float">
                <Calendar
                  mode="range"
                  locale={fr}
                  selected={{
                    from: range.start ?? undefined,
                    to: range.end ?? undefined,
                  }}
                  onSelect={applyRange}
                />
              </div>
            </>
          )}
        </div>
      </Field>

      <Field label="Motif">
        <Pills
          value={motif}
          onChange={setMotif}
          options={[
            { v: 'maintenance', label: 'Maintenance' },
            { v: 'conges', label: 'Congés' },
            { v: 'autre', label: 'Autre' },
          ]}
        />
      </Field>

      <Field label="Capacité">
        <Pills
          value={factor}
          onChange={setFactor}
          options={[
            { v: '0', label: 'Fermé' },
            { v: '0.5', label: 'Demi-journée' },
          ]}
        />
      </Field>

      <div className="ml-auto flex items-center gap-2 self-end">
        <Button variant="ghost" onClick={onCancel} className="text-muted-foreground">
          Annuler
        </Button>
        <Button
          onClick={submit}
          disabled={
            busy ||
            !range.start ||
            (!edit && scope !== 'global' && codes.length === 0)
          }
        >
          <DynamicIcon name={edit ? 'check' : 'add'} size={16} className="mr-1" />
          {edit ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </div>
    </div>
  )
}

export default function Calendrier(props: CalendrierPageProps) {
  const [view, setView] = useState<View>('registre')
  const [holidays, setHolidays] = useState<Holiday[]>(props.holidays)
  const [closures, setClosures] = useState<Closure[]>(props.closures)
  const [formState, setFormState] = useState<
    { mode: 'add' } | { mode: 'edit'; closure: Closure } | null
  >(null)
  const [warn, setWarn] = useState('')

  const activeCount = useMemo(() => holidays.filter((h) => h.active).length, [holidays])

  // Applique le résultat d'une création (fusion #37).
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
  }

  // ── Fériés ───────────────────────────────────────────────────────────────
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
    }).catch(() => {
      setHolidays((prev) => {
        const updated = [...prev]
        updated[i] = { ...updated[i], active: !next }
        return updated
      })
    })
  }

  // ── Fermetures ─────────────────────────────────────────────────────────────
  const removeClosure = (id: number) => {
    const snapshot = closures.find((c) => c.id === id)
    setClosures((cs) => cs.filter((c) => c.id !== id))
    fetch(route('calendar_config.delete_closure', { id }), { method: 'DELETE' }).catch(() => {
      if (snapshot) setClosures((prev) => [...prev, snapshot])
    })
  }

  return (
    <AppLayout
      title="Calendrier usine"
      active="config"
      subtitle="Calendrier usine"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold not-italic text-brand">
            Année {props.year}
          </div>
          <div>
            <b className="font-bold text-foreground">{activeCount}</b> fériés actifs ·{' '}
            <b className="font-bold text-foreground">{closures.length}</b> fermetures
              </div>
            </>
          }
          mastheadActions={
            <Segment role="radiogroup" ariaLabel="Vue">
              {(['registre', 'frise'] as const).map((v) => (
                <SegmentButton key={v} role="radio" active={view === v} onClick={() => setView(v)}>
                  {v === 'registre' ? 'Registre' : 'Frise'}
                </SegmentButton>
              ))}
            </Segment>
          }
        >
        <div className="mx-auto w-full max-w-[1280px] px-7 py-6">
          <nav className="mb-4 flex items-center gap-2 text-[12.5px]">
            <span className="rounded-md bg-brand-soft px-2.5 py-1 font-semibold text-brand">
              Calendrier usine
            </span>
            <a
              href={route('print_config.index')}
              className="rounded-md px-2.5 py-1 font-semibold text-muted-foreground hover:text-foreground"
            >
              Impressions
            </a>
          </nav>
          <h1 className="mb-1 font-fraunces text-[24px] font-extrabold tracking-tight">
            Calendrier usine {props.year}
          </h1>
          <p className="mb-5 text-[13px] text-muted-foreground">
            Jours ouvrés = calendrier français (fériés) moins les fermetures saisies par ligne. La
            capacité de <b className="text-foreground">/charge</b> en découle directement.
          </p>

          {warn && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-suggere/40 bg-[color-mix(in_srgb,var(--color-suggere)_12%,transparent)] px-3.5 py-2 text-[12.5px]">
              <TriangleAlert size={17} className="text-suggere" />
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
              {/* Jours fériés */}
              <section className="overflow-hidden rounded-lg border border-rule bg-card">
                <header className="flex items-center gap-2 border-b border-rule-soft px-4 py-3.5">
                  <CalendarDays size={18} className="text-brand" />
                  <span className="font-fraunces text-[15px] font-bold">Jours fériés France</span>
                  <span className="ml-auto font-mono text-[11px] font-bold text-muted-foreground">
                    {activeCount} actifs
                  </span>
                </header>
                {holidays.map((h) => (
                  <div
                    key={h.date}
                    className="flex items-center gap-3 border-b border-rule-soft px-4 py-2.5 last:border-0"
                  >
                    <span className="w-[58px] flex-none font-mono text-[12px] font-bold text-brand">
                      {frShort(h.date)}
                    </span>
                    <span className="text-[13px] font-medium">
                      {h.name}
                      <span className="block text-[10.5px] font-normal text-muted-foreground">
                        {h.active ? 'chômé · capacité 0 h' : 'travaillé (désactivé)'}
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={h.active}
                      onClick={() => toggleHoliday(h.date)}
                      className={cn(
                        'relative ml-auto h-[22px] w-[38px] flex-none rounded-full transition-colors',
                        h.active ? 'bg-ferme' : 'bg-rule'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all',
                          h.active ? 'left-[18px]' : 'left-[2px]'
                        )}
                      />
                    </button>
                  </div>
                ))}
              </section>

              {/* Fermetures par ligne */}
              <section className="rounded-lg border border-rule bg-card">
                <header className="flex items-center gap-2 border-b border-rule-soft px-4 py-3.5">
                  <Wrench size={18} className="text-suggere" />
                  <span className="font-fraunces text-[15px] font-bold">
                    Fermetures par ligne de production
                  </span>
                  <span className="ml-auto font-mono text-[11px] font-bold text-muted-foreground">
                    {closures.length} actives
                  </span>
                </header>

                {closures.length === 0 ? (
                  <div className="px-4 py-8 text-center font-fraunces text-[13px] italic text-muted-foreground">
                    Aucune fermeture saisie.
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Ligne', 'Du', 'Au', 'Motif', 'Capacité', ''].map((h) => (
                          <th
                            key={h}
                            className="border-b border-rule-soft px-3.5 py-2.5 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {closures.map((c) => {
                        const chip = scopeChip(c)
                        return (
                          <tr key={c.id} className="hover:bg-rule/10">
                            <td className="border-b border-rule-soft px-3.5 py-2.5">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-0.5 font-mono text-[11px] font-bold">
                                <span className="size-[7px] rounded-[2px]" style={{ background: chip.dot }} />
                                {chip.label}
                              </span>
                            </td>
                            <td className="border-b border-rule-soft px-3.5 py-2.5 font-mono text-[12.5px]">
                              {frNum(c.from)}
                            </td>
                            <td className="border-b border-rule-soft px-3.5 py-2.5 font-mono text-[12.5px]">
                              {frNum(c.to)}
                            </td>
                            <td className="border-b border-rule-soft px-3.5 py-2.5">
                              <span
                                className="inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background:
                                    c.motif === 'maintenance'
                                      ? 'color-mix(in srgb, var(--color-suggere) 18%, transparent)'
                                      : 'color-mix(in srgb, var(--color-planifie) 16%, transparent)',
                                  /* orange sombre grammaire (b-suggere du showcase) */
                                  color: c.motif === 'maintenance' ? '#c2410c' : 'var(--color-planifie)',
                                }}
                              >
                                {motifLabel(c.motif)}
                              </span>
                            </td>
                            <td
                              className="border-b border-rule-soft px-3.5 py-2.5 font-mono text-[12.5px] font-bold"
                              style={{
                                color:
                                  c.factor <= 0 ? 'var(--color-danger)' : 'var(--color-suggere)',
                              }}
                            >
                              {factorLabel(c.factor)}
                            </td>
                            <td className="border-b border-rule-soft px-3.5 py-2.5">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setFormState({ mode: 'edit', closure: c })}
                                  className="text-muted-foreground transition-colors hover:text-brand"
                                  title="Éditer"
                                >
                                  <Pencil size={18} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeClosure(c.id)}
                                  className="text-muted-foreground transition-colors hover:text-danger"
                                  title="Supprimer"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}

                {formState === null ? (
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setFormState({ mode: 'add' })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-brand px-3 py-2 font-sans text-[12.5px] font-bold text-brand"
                    >
                      <Plus size={16} />Nouvelle
                      fermeture
                    </button>
                    <span className="font-fraunces text-[11.5px] italic text-muted-foreground">
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
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-rule bg-card px-6 py-20 text-center">
              <CalendarRange size={34} className="text-brand/60" />
              <div className="font-fraunces text-[16px] font-bold">Vue Frise — bientôt</div>
              <p className="max-w-md text-[12.5px] text-muted-foreground">
                Timeline par poste sur l'année (fériés + fermetures déplaçables). Conçue, pas encore
                câblée — la vue Registre reste la source d'édition.
              </p>
            </div>
          )}
        </div>
    </AppLayout>
  )
}
