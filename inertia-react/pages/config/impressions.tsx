import { useMemo, useState } from 'react'
import {
  Plus,
  Printer,
  Trash2,
  TriangleAlert,
  FileText,
  ShieldCheck,
  Settings2,
} from 'lucide-react'
import { router } from '@inertiajs/react'

import AppLayout from '@r/layouts/app'
import { Button } from '@r/components/ui/button'
import { Badge } from '@r/components/ui/badge'
import { Input } from '@r/components/ui/input'
import { Pill } from '@r/components/ui/pill'
import { CellDate, CellStack } from '@r/components/ui/table-row'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import {
  ToolbarGroup,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import { cn } from '@r/lib/utils'
import { route } from '@r/lib/routes'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'

/**
 * Routage d'impression du dossier d'OF (issue #85, lot 2).
 *
 * Une règle par atelier et par document, plus une règle par défaut. L'écran ne
 * propose que des destinations déclarées dans X3 (`APRINTER`), et distingue
 * visuellement celles qui sortent du papier de celles qui n'en sortent pas —
 * c'est la seule différence qui compte ici : le papier ne se reprend pas.
 *
 * Le journal des tirages est en lecture seule : il sert de preuve, pas de
 * brouillon.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • sous-nav Calendrier / Impressions en `ToolbarSegmented` (zone 01),
 *   journal en Pill zone 04 — plus de pills `bg-brand-soft` ;
 * • tables `DataTable` + `CellStack` / `CellDate` / `Badge` ;
 * • plus de `font-fraunces` ni de filet Airbnb (`border-rule`, `px-7`).
 */

interface Atelier {
  code: string
  label: string
}
interface Destination {
  code: string
  label: string
  kind: number
  kindLabel: string
  server: string
  queue: string
  active: boolean
  sandbox: boolean
}
interface Rule {
  id: number
  stoloc: string
  atelierLabel: string
  docType: string
  docLabel: string
  /** Le document de cette règle n'est plus configuré : elle n'imprimera rien. */
  orphan: boolean
  destCode: string
  destLabel: string
  sandbox: boolean
  note: string
  updatedAt: number
  updatedBy: string
}
interface Job {
  id: number
  ofNum: string
  docType: string
  docLabel: string
  attempt: number
  stoloc: string
  destCode: string
  sandbox: boolean
  status: string
  serverVerdict: string
  jobRank: number
  jobPhase: string
  jobDetail: string
  verdictInferred: boolean
  retCod: string
  message: string
  error: string
  durationMs: number
  origin: string
  requestedBy: string
  createdAt: number
}
interface Settings {
  /** 'off' | 'single' | 'all'. */
  autoPrintMode: string
  updatedAt: number
  updatedBy: string
}
/** Document du dossier d'OF — code GESARP + libellé métier, saisis. */
interface Doc {
  id: number
  code: string
  label: string
  position: number
  active: boolean
  updatedAt: number
  updatedBy: string
}

interface PageProps {
  settings: Settings
  documents: Doc[]
  ateliers: Atelier[]
  destinations: Destination[]
  destinationsError: string
  /** Files réellement déclarées au serveur d'édition (`$printers`). */
  queues: string[]
  queuesError: string
  rules: Rule[]
  jobs: Job[]
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Horodatage epoch (s) → jour jj/mm/aaaa. */
const fmtDay = (s: number): string => {
  if (!s) return '—'
  const d = new Date(s * 1000)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Horodatage epoch (s) → heure HH:mm, éventuellement + auteur. */
const fmtTimeBy = (s: number, by?: string): string => {
  if (!s) return by || ''
  const d = new Date(s * 1000)
  const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return by ? `${t} · ${by}` : t
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/**
 * Verdict du serveur d'édition. Distinct du verdict X3 : `soumis` + `échec`
 * est la panne partielle que l'issue #85 désigne comme l'état dangereux.
 */
function VerdictChip({ job }: { job: Job }) {
  if (job.serverVerdict === 'error') {
    return (
      <Badge variant="destructive" title={job.jobDetail}>
        <TriangleAlert size={12} />
        rien n’est sorti
      </Badge>
    )
  }
  if (job.serverVerdict === 'ok') {
    return (
      <Badge
        variant="success"
        title={
          job.verdictInferred
            ? 'Succès déduit de la disparition de la tâche, pas lu sur un statut terminal.'
            : undefined
        }
      >
        remis à la file{job.verdictInferred ? ' *' : ''}
      </Badge>
    )
  }
  if (job.serverVerdict === 'unknown') {
    return (
      <Badge variant="warning" title={job.jobDetail}>
        sans verdict
      </Badge>
    )
  }
  return <span className="text-muted-foreground">—</span>
}

/** Pastille papier / sans effet — la distinction structurante de l'écran. */
function EffetChip({ sandbox }: { sandbox: boolean }) {
  return sandbox ? (
    <Badge variant="secondary">
      <ShieldCheck size={12} />
      sans papier
    </Badge>
  ) : (
    <Badge variant="warning">
      <Printer size={12} />
      papier
    </Badge>
  )
}

const AUTO_MODES = [
  {
    v: 'off',
    label: 'Jamais',
    hint: 'L’affermissement n’imprime rien. Le dossier se tire à la main depuis le détail OF.',
  },
  {
    v: 'single',
    label: 'Affermissement unitaire',
    hint: 'Un OF affermi depuis son détail imprime son dossier. L’affermissement groupé, non.',
  },
  {
    v: 'all',
    label: 'Unitaire et groupé',
    hint: 'Tout affermissement imprime. Un lot de 20 OF sort 40 documents d’un coup.',
  },
]

/**
 * Documents du dossier d'OF.
 *
 * Le code est celui de `GESARP` et il dépend du dossier X3 : sur AE1 le bon de
 * travail est `RECETTE`, pas le `BONTRV` standard. Il n'est pas confronté à X3
 * ici — le board n'expose pas le dictionnaire des états, et une faute de frappe
 * se voit au premier tirage, avec le nom de l'état dans le refus.
 */
function DocumentsSetting({ documents }: { documents: Doc[] }) {
  const [docs, setDocs] = useState<Doc[]>(documents)
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(route('print_config.upsert_document'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok || j.error) {
        setError(j.error ?? `Erreur ${r.status}`)
        return null
      }
      return j.document as Doc
    } catch (e) {
      setError(String(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    const saved = await save({
      code,
      label,
      position: (docs.at(-1)?.position ?? 0) + 1,
      active: true,
    })
    if (!saved) return
    setDocs((prev) => [...prev.filter((d) => d.code !== saved.code), saved])
    setCode('')
    setLabel('')
  }

  const toggle = async (d: Doc) => {
    const saved = await save({
      code: d.code,
      label: d.label,
      position: d.position,
      active: !d.active,
    })
    if (saved) setDocs((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
  }

  const remove = async (d: Doc) => {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(route('print_config.delete_document', { id: d.id }), {
        method: 'DELETE',
      })
      const j = await r.json()
      if (!r.ok || j.error) return setError(j.error ?? `Erreur ${r.status}`)
      setDocs((prev) => prev.filter((x) => x.id !== d.id))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Settings2 size={16} strokeWidth={1.75} className="text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">Documents du dossier</h2>
        <span className="text-xs text-muted-foreground">
          codes d’état X3 (GESARP), dans l’ordre d’impression
        </span>
      </header>

      <div className="flex flex-col gap-2 px-4 py-3">
        {docs.length === 0 && (
          <p className="text-xs text-destructive">
            Aucun document configuré : l’affermissement n’imprimera rien.
          </p>
        )}

        {docs.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs font-bold tabular-nums">{d.code}</span>
            <span className="text-muted-foreground">{d.label || '(sans libellé)'}</span>
            {!d.active && <Badge variant="warning">désactivé</Badge>}
            <span className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => void toggle(d)}
                disabled={busy}
              >
                {d.active ? 'Désactiver' : 'Activer'}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => void remove(d)}
                disabled={busy}
              >
                <Trash2 size={13} />
              </Button>
            </span>
          </div>
        ))}

        <div className="mt-1 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <Field label="Code état">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="RECETTE"
              className="h-8 w-40 font-mono text-sm"
            />
          </Field>
          <Field label="Libellé métier">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bon de travail"
              className="h-8 w-56 text-sm"
            />
          </Field>
          <Button
            type="button"
            size="sm"
            onClick={() => void add()}
            disabled={busy || !code.trim()}
          >
            <Plus size={14} />
            Ajouter
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  )
}

function AutoPrintSetting({ settings }: { settings: Settings }) {
  const [mode, setMode] = useState(settings.autoPrintMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const change = async (v: string) => {
    const previous = mode
    setMode(v)
    setBusy(true)
    setError('')
    try {
      const r = await fetch(route('print_config.update_settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoPrintMode: v }),
      })
      const j = await r.json()
      if (!r.ok || j.error) {
        setError(j.error ?? `Erreur ${r.status}`)
        setMode(previous)
      }
    } catch (e) {
      setError(String(e))
      setMode(previous)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Settings2 size={16} strokeWidth={1.75} className="text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">Déclenchement</h2>
        <span className="text-xs text-muted-foreground">
          quand l’affermissement doit-il imprimer le dossier ?
        </span>
      </header>

      <div className="flex flex-col gap-1 px-4 py-3">
        {AUTO_MODES.map((m) => (
          <label
            key={m.v}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors',
              mode === m.v ? 'bg-muted' : 'hover:bg-muted/50'
            )}
          >
            <input
              type="radio"
              name="autoPrintMode"
              className="mt-0.5"
              checked={mode === m.v}
              disabled={busy}
              onChange={() => void change(m.v)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.hint}</span>
            </span>
          </label>
        ))}

        {error && (
          <div className="mt-1 flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-foreground">
            <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0 text-destructive" />
            {error}
          </div>
        )}

        <p className="mt-1 text-xs text-muted-foreground">
          La réimpression explicite depuis le détail OF reste disponible quel que soit ce réglage —
          c’est un geste, pas un automatisme.
          {settings.updatedBy ? ` Dernière modification : ${settings.updatedBy}.` : ''}
        </p>
      </div>
    </section>
  )
}

/** Formulaire d'ajout / remplacement d'une règle. */
function RuleForm({
  ateliers,
  documents,
  destinations,
  queues,
  onSaved,
  onCancel,
}: {
  ateliers: Atelier[]
  documents: Doc[]
  destinations: Destination[]
  queues: string[]
  onSaved: (r: Rule) => void
  onCancel: () => void
}) {
  const [stoloc, setStoloc] = useState('')
  const [docType, setDocType] = useState(documents[0]?.code ?? '')
  const [destCode, setDestCode] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dest = destinations.find((d) => d.code === destCode)

  const groups = useMemo(() => {
    const by = new Map<string, Destination[]>()
    for (const d of destinations.filter((x) => x.active)) {
      const k = d.kindLabel
      by.set(k, [...(by.get(k) ?? []), d])
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [destinations])

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(route('print_config.upsert_rule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stoloc, docType, destCode, note }),
      })
      const j = await r.json()
      if (!r.ok || j.error) {
        setError(j.error ?? `Erreur ${r.status}`)
        return
      }
      onSaved(j.rule)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Atelier">
          <Select
            value={stoloc || '__default__'}
            onValueChange={(v) => setStoloc(!v || v === '__default__' ? '' : String(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-full">
              <SelectValue placeholder="Par défaut (tous ateliers)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Par défaut (tous ateliers)</SelectItem>
              {ateliers.map((a) => (
                <SelectItem key={a.code} value={a.code}>
                  {a.label} ({a.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Document">
          <Select value={docType} onValueChange={(v) => setDocType(String(v ?? ''))}>
            <SelectTrigger size="sm" className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {documents.map((d) => (
                <SelectItem key={d.code} value={d.code}>
                  {d.label || d.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Destination X3">
          <Select value={destCode || null} onValueChange={(v) => setDestCode(String(v ?? ''))}>
            <SelectTrigger size="sm" className="h-8 w-full">
              <SelectValue placeholder="— choisir —" />
            </SelectTrigger>
            <SelectContent>
              {groups.map(([kind, list]) => (
                <SelectGroup key={kind}>
                  <SelectLabel>{kind}</SelectLabel>
                  {list.map((d) => (
                    <SelectItem key={d.code} value={d.code}>
                      {d.code} — {d.label || '(sans libellé)'}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Note">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optionnel"
            className="h-8 text-sm"
          />
        </Field>
      </div>

      {dest && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <EffetChip sandbox={dest.sandbox} />
          <span className="text-muted-foreground">
            {dest.server ? `Serveur ${dest.server}` : 'Aucun serveur d’impression déclaré'}
            {dest.queue ? ` · file ${dest.queue}` : ''}
          </span>
          {!dest.sandbox && !dest.server && (
            <span className="flex items-center gap-1 text-suggere">
              <TriangleAlert size={13} />
              Destination legacy : file pointant un poste, à vérifier physiquement avant usage.
            </span>
          )}
          {!dest.sandbox && queues.length > 0 && dest.queue && !queues.includes(dest.queue) && (
            <span className="flex items-center gap-1 font-medium text-destructive">
              <TriangleAlert size={13} />
              La file « {dest.queue} » n’existe pas sur le serveur d’édition. Cette règle échouera.
            </span>
          )}
          {!dest.sandbox && (
            <span className="flex items-center gap-1 font-medium text-suggere">
              <TriangleAlert size={13} />
              Cette destination sort du papier dans l’atelier.
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-foreground">
          <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0 text-destructive" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={busy || !destCode} size="sm">
          Enregistrer
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost" size="sm">
          Annuler
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Une seule règle par atelier et par document — enregistrer remplace l’existante.
        </span>
      </div>
    </div>
  )
}

/** Tri générique une colonne — repli sur `fallback` (ordre par défaut) quand aucun tri n'est actif. */
function sortByColumn<T>(
  rows: T[],
  sorting: SortingState[],
  fallback: (a: T, b: T) => number
): T[] {
  const s = sorting[0]
  if (!s) return [...rows].sort(fallback)
  const dir = s.desc ? -1 : 1
  return [...rows].sort((a, b) => {
    const av = a[s.id as keyof T]
    const bv = b[s.id as keyof T]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    if (typeof av === 'boolean' && typeof bv === 'boolean') return (Number(av) - Number(bv)) * dir
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir
  })
}

function createRuleColumns(deps: {
  rulesCassees: Set<number>
  removeRule: (id: number) => void
}): ColumnDef<Rule>[] {
  const { rulesCassees, removeRule } = deps
  return [
    {
      accessorKey: 'atelierLabel',
      header: () => 'Atelier',
      cell: ({ row: { original: r } }) => (
        <CellStack code={r.stoloc || 'Défaut'} label={r.atelierLabel} />
      ),
    },
    {
      accessorKey: 'docLabel',
      header: () => 'Document',
      cell: ({ row: { original: r } }) => (
        <CellStack
          code={r.docType}
          label={r.docLabel}
          action={r.orphan ? <Badge variant="destructive">document retiré</Badge> : undefined}
        />
      ),
    },
    {
      accessorKey: 'destCode',
      header: () => 'Destination',
      cell: ({ row: { original: r } }) => (
        <CellStack
          code={r.destCode}
          label={r.destLabel}
          action={
            rulesCassees.has(r.id) ? (
              <Badge variant="destructive" title="File absente du serveur d’édition">
                <TriangleAlert size={12} />
                file introuvable
              </Badge>
            ) : undefined
          }
        />
      ),
    },
    {
      id: 'effet',
      accessorFn: (r) => r.sandbox,
      header: () => 'Effet',
      cell: ({ row: { original: r } }) => <EffetChip sandbox={r.sandbox} />,
    },
    {
      accessorKey: 'updatedAt',
      header: () => 'Modifiée',
      cell: ({ row: { original: r } }) => (
        <CellDate date={fmtDay(r.updatedAt)} relative={fmtTimeBy(r.updatedAt, r.updatedBy)} />
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row: { original: r } }) => (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => void removeRule(r.id)}
          title="Supprimer la règle"
        >
          <Trash2 size={16} />
        </Button>
      ),
      meta: { tdClass: 'text-right' },
    },
  ]
}

const jobColumns: ColumnDef<Job>[] = [
  {
    accessorKey: 'createdAt',
    header: () => 'Quand',
    cell: ({ row: { original: j } }) => (
      <CellDate date={fmtDay(j.createdAt)} relative={fmtTimeBy(j.createdAt)} />
    ),
  },
  {
    accessorKey: 'ofNum',
    header: () => 'OF',
    cell: ({ row: { original: j } }) => <CellStack code={j.ofNum} />,
  },
  {
    accessorKey: 'docLabel',
    header: () => 'Document',
    cell: ({ row: { original: j } }) => <CellStack code={j.docType} label={j.docLabel} />,
  },
  {
    id: 'tirage',
    enableSorting: false,
    header: () => 'Tirage',
    cell: ({ row: { original: j } }) =>
      j.attempt > 1 ? (
        <Badge variant="warning">réimpression #{j.attempt}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">initial</span>
      ),
  },
  {
    accessorKey: 'destCode',
    header: () => 'Destination',
    cell: ({ row: { original: j } }) => <CellStack code={j.destCode} />,
  },
  {
    accessorKey: 'status',
    header: () => 'X3',
    cell: ({ row: { original: j } }) => (
      <>
        {j.status === 'submitted' && <Badge variant="success">soumis</Badge>}
        {j.status === 'pending' && (
          <Badge variant="warning" title="Issue de l’appel X3 inconnue.">
            en cours
          </Badge>
        )}
        {j.status !== 'submitted' && j.status !== 'pending' && (
          <Badge variant="destructive" title={j.error}>
            refusé
          </Badge>
        )}
      </>
    ),
  },
  {
    id: 'verdict',
    enableSorting: false,
    header: () => 'Serveur d’édition',
    cell: ({ row: { original: j } }) => (
      <span className="inline-flex items-center gap-1.5">
        <VerdictChip job={j} />
        {j.jobRank > 0 && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">#{j.jobRank}</span>
        )}
      </span>
    ),
  },
  {
    accessorKey: 'origin',
    header: () => 'Origine',
    cell: ({ row: { original: j } }) => (
      <span className="text-xs text-muted-foreground">
        {j.origin}
        {j.requestedBy ? ` · ${j.requestedBy}` : ''}
      </span>
    ),
  },
]

export default function ImpressionsConfig(props: PageProps) {
  const [rules, setRules] = useState<Rule[]>(props.rules)
  const [adding, setAdding] = useState(false)
  const [ruleSorting, setRuleSorting] = useState<SortingState[]>([])
  const [jobSorting, setJobSorting] = useState<SortingState[]>([])

  const applyRule = (r: Rule) => {
    setRules((prev) => [...prev.filter((x) => x.id !== r.id), r])
    setAdding(false)
  }

  const removeRule = async (id: number) => {
    await fetch(route('print_config.delete_rule', { id }), { method: 'DELETE' })
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  const sorted = useMemo(
    () =>
      sortByColumn(
        rules,
        ruleSorting,
        (a, b) => a.stoloc.localeCompare(b.stoloc) || a.docType.localeCompare(b.docType)
      ),
    [rules, ruleSorting]
  )

  /**
   * Règles dont la file n'existe pas sur le serveur d'édition. Elles passeront
   * le contrôle X3 et échoueront au tirage — c'est précisément ce qu'on veut
   * voir avant d'affermir, pas après.
   */
  const rulesCassees = useMemo(() => {
    if (props.queues.length === 0) return new Set<number>()
    const queueOf = new Map(props.destinations.map((d) => [d.code, d]))
    return new Set(
      rules
        .filter((r) => {
          const d = queueOf.get(r.destCode)
          return d && !d.sandbox && d.queue && !props.queues.includes(d.queue)
        })
        .map((r) => r.id)
    )
  }, [rules, props.destinations, props.queues])

  const ruleColumns = useMemo(() => createRuleColumns({ rulesCassees, removeRule }), [rulesCassees])

  const manquantes = props.documents
    .filter((d) => d.active)
    .filter((d) => !rules.some((r) => r.stoloc === '' && r.docType === d.code))

  const toolbar = (
    <>
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Configuration">
          <ToolbarSegment onClick={() => router.visit(route('calendar_config.index'))}>
            Calendrier
          </ToolbarSegment>
          <ToolbarSegment active>Impressions</ToolbarSegment>
          <ToolbarSegment onClick={() => router.visit(route('data_config.index'))}>
            Données
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
      title="Impressions"
      active="config"
      subtitle="Routage des impressions d’OF"
      theme="cursor"
      toolbar={toolbar}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          À l’affermissement d’un OF, le bon de travail et le bon de sortie matière partent vers
          l’imprimante de l’atelier concerné. Cet écran décide de la cible ; il ne déclenche rien.
        </p>

        {props.destinationsError && (
          <div className="flex items-center gap-2 border border-suggere/30 bg-suggere/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-suggere" />
            <span className="font-medium">Destinations X3 indisponibles :</span>
            <span className="truncate font-mono">{props.destinationsError}</span>
            <span className="text-muted-foreground">
              — les règles existantes restent affichées, mais aucune nouvelle règle ne peut être
              validée.
            </span>
          </div>
        )}

        <DocumentsSetting documents={props.documents} />

        <AutoPrintSetting settings={props.settings} />

        {props.queuesError && (
          <div className="flex items-center gap-2 border border-suggere/30 bg-suggere/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-suggere" />
            <span className="font-medium">Serveur d’édition injoignable :</span>
            <span className="truncate font-mono">{props.queuesError}</span>
            <span className="text-muted-foreground">
              — impossible de confronter les règles aux files réelles, et les tirages resteront «
              sans verdict ».
            </span>
          </div>
        )}

        {rulesCassees.size > 0 && (
          <div className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span>
              <span className="font-medium tabular-nums">
                {rulesCassees.size} règle{rulesCassees.size > 1 ? 's' : ''}
              </span>{' '}
              pointe{rulesCassees.size > 1 ? 'nt' : ''} une file inconnue du serveur d’édition. X3
              acceptera l’édition, rien ne sortira.
            </span>
          </div>
        )}

        {manquantes.length > 0 && (
          <div className="flex items-center gap-2 border border-suggere/30 bg-suggere/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-suggere" />
            <span>
              Aucune règle par défaut pour{' '}
              <span className="font-medium">
                {manquantes.map((d) => d.label.toLowerCase()).join(' et ')}
              </span>
              . Un OF dont l’atelier n’a pas de règle ne sera pas imprimé — l’impression sera
              refusée, pas silencieuse.
            </span>
          </div>
        )}

        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Printer size={16} strokeWidth={1.75} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Routage</h2>
            <span className="text-xs text-muted-foreground">
              atelier (STOLOC) × document → destination X3
            </span>
          </header>

          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucune règle. Commencez par la règle par défaut de chaque document.
            </p>
          ) : (
            <DataTable
              columns={ruleColumns}
              rows={sorted}
              sorting={ruleSorting}
              onSortingChange={setRuleSorting}
              virtualize={false}
              tableClass="w-full"
              scrollContainerClass="rounded-none border-0 shadow-none"
              getRowKey={(r) => String(r.id)}
            />
          )}

          {adding ? (
            <RuleForm
              ateliers={props.ateliers}
              documents={props.documents.filter((d) => d.active)}
              destinations={props.destinations}
              queues={props.queues}
              onSaved={applyRule}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div className="px-4 py-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus size={16} />
                Nouvelle règle
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <FileText size={16} strokeWidth={1.75} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Derniers tirages</h2>
            <span className="text-xs text-muted-foreground">
              journal d’idempotence — un OF déjà imprimé ne se réimprime que sur demande explicite
            </span>
          </header>

          {props.jobs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun tirage journalisé.
            </p>
          ) : (
            <DataTable
              columns={jobColumns}
              rows={props.jobs}
              sorting={jobSorting}
              onSortingChange={setJobSorting}
              virtualize={false}
              tableClass="w-full"
              scrollContainerClass="rounded-none border-0 shadow-none"
              getRowKey={(j) => String(j.id)}
            />
          )}

          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Deux verdicts, volontairement séparés.{' '}
            <span className="font-medium text-foreground">X3</span> dit s’il a accepté l’édition ;
            le <span className="font-medium text-foreground">serveur d’édition</span> dit ce qu’elle
            est devenue — une édition acceptée par X3 peut très bien finir en erreur. « Remis à la
            file » reste la limite haute : un bac vide ou un bourrage ne remonte nulle part.
            L’astérisque marque un succès déduit de la disparition de la tâche plutôt que lu sur un
            statut terminal.
          </p>
        </section>
      </div>
    </AppLayout>
  )
}
