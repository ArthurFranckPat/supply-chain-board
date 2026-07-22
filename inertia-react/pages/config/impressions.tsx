import { useMemo, useState } from 'react'
import { Plus, Printer, Trash2, TriangleAlert, FileText, ShieldCheck } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { Button } from '@r/components/ui/button'
import { Input } from '@r/components/ui/input'
import { cn } from '@r/lib/utils'
import { route } from '@/lib/routes'

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
  attempt: number
  stoloc: string
  destCode: string
  sandbox: boolean
  status: string
  retCod: string
  message: string
  error: string
  durationMs: number
  origin: string
  requestedBy: string
  createdAt: number
}
interface PageProps {
  ateliers: Atelier[]
  destinations: Destination[]
  destinationsError: string
  rules: Rule[]
  jobs: Job[]
}

const DOCS = [
  { code: 'BONTRV', label: 'Bon de travail' },
  { code: 'BSM', label: 'Bon de sortie matière' },
]

const docLabel = (c: string) => DOCS.find((d) => d.code === c)?.label ?? c

/** Horodatage epoch (s) → « 22/07/26 14:38 ». */
const fmtStamp = (s: number): string => {
  if (!s) return '—'
  const d = new Date(s * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

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

/** Pastille papier / sans effet — la distinction structurante de l'écran. */
function EffetChip({ sandbox }: { sandbox: boolean }) {
  return sandbox ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-muted-foreground">
      <ShieldCheck size={12} />
      sans papier
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-900">
      <Printer size={12} />
      papier
    </span>
  )
}

/** Formulaire d'ajout / remplacement d'une règle. */
function RuleForm({
  ateliers,
  destinations,
  onSaved,
  onCancel,
}: {
  ateliers: Atelier[]
  destinations: Destination[]
  onSaved: (r: Rule) => void
  onCancel: () => void
}) {
  const [stoloc, setStoloc] = useState('')
  const [docType, setDocType] = useState('BONTRV')
  const [destCode, setDestCode] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dest = destinations.find((d) => d.code === destCode)

  // Groupées par nature : l'utilisateur choisit d'abord un effet, puis une file.
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
    <div className="flex flex-col gap-3 border-t border-rule px-4 py-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Atelier">
          <select
            value={stoloc}
            onChange={(e) => setStoloc(e.target.value)}
            className="h-9 rounded-md border border-rule bg-card px-2 text-[13px]"
          >
            <option value="">Par défaut (tous ateliers)</option>
            {ateliers.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label} ({a.code})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Document">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-9 rounded-md border border-rule bg-card px-2 text-[13px]"
          >
            {DOCS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Destination X3">
          <select
            value={destCode}
            onChange={(e) => setDestCode(e.target.value)}
            className="h-9 rounded-md border border-rule bg-card px-2 text-[13px]"
          >
            <option value="">— choisir —</option>
            {groups.map(([kind, list]) => (
              <optgroup key={kind} label={kind}>
                {list.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.label || '(sans libellé)'}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optionnel" />
        </Field>
      </div>

      {dest && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-[12px]">
          <EffetChip sandbox={dest.sandbox} />
          <span className="text-muted-foreground">
            {dest.server ? `Serveur ${dest.server}` : 'Aucun serveur d’impression déclaré'}
            {dest.queue ? ` · file ${dest.queue}` : ''}
          </span>
          {!dest.sandbox && !dest.server && (
            <span className="flex items-center gap-1 text-amber-700">
              <TriangleAlert size={13} />
              Destination legacy : file pointant un poste, à vérifier physiquement avant usage.
            </span>
          )}
          {!dest.sandbox && (
            <span className="flex items-center gap-1 font-semibold text-amber-800">
              <TriangleAlert size={13} />
              Cette destination sort du papier dans l’atelier.
            </span>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-900">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={submit} disabled={busy || !destCode} size="sm">
          Enregistrer
        </Button>
        <Button onClick={onCancel} variant="ghost" size="sm">
          Annuler
        </Button>
        <span className="ml-auto text-[11.5px] text-muted-foreground">
          Une seule règle par atelier et par document — enregistrer remplace l’existante.
        </span>
      </div>
    </div>
  )
}

export default function ImpressionsConfig(props: PageProps) {
  const [rules, setRules] = useState<Rule[]>(props.rules)
  const [adding, setAdding] = useState(false)

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
      [...rules].sort(
        (a, b) => a.stoloc.localeCompare(b.stoloc) || a.docType.localeCompare(b.docType)
      ),
    [rules]
  )

  const papier = sorted.filter((r) => !r.sandbox).length
  const manquantes = DOCS.filter((d) => !rules.some((r) => r.stoloc === '' && r.docType === d.code))

  return (
    <AppLayout
      title="Impressions"
      active="config"
      subtitle="Routage des impressions d’OF"
      theme="airbnb"
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold not-italic text-brand">
            {rules.length} règle{rules.length > 1 ? 's' : ''}
          </div>
          <div>
            {papier} vers une imprimante · {rules.length - papier} sans effet physique
          </div>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6">
        <nav className="flex items-center gap-2 text-[12.5px]">
          <a
            href={route('calendar_config.index')}
            className="rounded-md px-2.5 py-1 font-semibold text-muted-foreground hover:text-foreground"
          >
            Calendrier usine
          </a>
          <span className="rounded-md bg-brand-soft px-2.5 py-1 font-semibold text-brand">
            Impressions
          </span>
        </nav>

        <div>
          <h1 className="mb-1 font-fraunces text-[24px] font-extrabold tracking-tight">
            Routage des impressions
          </h1>
          <p className="text-[13px] text-muted-foreground">
            À l’affermissement d’un OF, le bon de travail et le bon de sortie matière partent vers
            l’imprimante de l’atelier concerné. Cet écran décide de la cible ; il ne déclenche
            rien.
          </p>
        </div>

        {props.destinationsError && (
          <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <TriangleAlert size={15} />
            Destinations X3 indisponibles : {props.destinationsError} — les règles existantes
            restent affichées, mais aucune nouvelle règle ne peut être validée.
          </p>
        )}

        {manquantes.length > 0 && (
          <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-[12.5px]">
            <TriangleAlert size={15} className="text-amber-700" />
            Aucune règle par défaut pour&nbsp;
            <strong>{manquantes.map((d) => d.label.toLowerCase()).join(' et ')}</strong>. Un OF dont
            l’atelier n’a pas de règle ne sera pas imprimé — l’impression sera refusée, pas
            silencieuse.
          </p>
        )}

        {/* --- Règles de routage --------------------------------------------- */}
        <section className="rounded-lg border border-rule bg-card">
          <header className="flex items-center gap-2 border-b border-rule px-4 py-3">
            <Printer size={16} className="text-brand" />
            <h2 className="font-fraunces text-[15px] font-bold">Routage</h2>
            <span className="text-[11.5px] text-muted-foreground">
              atelier (STOLOC) × document → destination X3
            </span>
          </header>

          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              Aucune règle. Commencez par la règle par défaut de chaque document.
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-bold">Atelier</th>
                  <th className="px-4 py-2 font-bold">Document</th>
                  <th className="px-4 py-2 font-bold">Destination</th>
                  <th className="px-4 py-2 font-bold">Effet</th>
                  <th className="px-4 py-2 font-bold">Modifiée</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b border-rule/60 last:border-0">
                    <td className="px-4 py-2">
                      <span className={cn(!r.stoloc && 'italic text-muted-foreground')}>
                        {r.atelierLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2">{docLabel(r.docType)}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-[12px] font-bold">{r.destCode}</span>
                      {r.destLabel && (
                        <span className="ml-2 text-muted-foreground">{r.destLabel}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <EffetChip sandbox={r.sandbox} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {fmtStamp(r.updatedAt)}
                      {r.updatedBy ? ` · ${r.updatedBy}` : ''}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRule(r.id)}
                        className="text-muted-foreground transition-colors hover:text-danger"
                        title="Supprimer la règle"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {adding ? (
            <RuleForm
              ateliers={props.ateliers}
              destinations={props.destinations}
              onSaved={applyRule}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-brand px-3 py-2 font-sans text-[12.5px] font-bold text-brand"
              >
                <Plus size={16} />
                Nouvelle règle
              </button>
            </div>
          )}
        </section>

        {/* --- Journal ------------------------------------------------------- */}
        <section className="rounded-lg border border-rule bg-card">
          <header className="flex items-center gap-2 border-b border-rule px-4 py-3">
            <FileText size={16} className="text-brand" />
            <h2 className="font-fraunces text-[15px] font-bold">Derniers tirages</h2>
            <span className="text-[11.5px] text-muted-foreground">
              journal d’idempotence — un OF déjà imprimé ne se réimprime que sur demande explicite
            </span>
          </header>

          {props.jobs.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              Aucun tirage journalisé.
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-bold">Quand</th>
                  <th className="px-4 py-2 font-bold">OF</th>
                  <th className="px-4 py-2 font-bold">Document</th>
                  <th className="px-4 py-2 font-bold">Tirage</th>
                  <th className="px-4 py-2 font-bold">Destination</th>
                  <th className="px-4 py-2 font-bold">Verdict</th>
                  <th className="px-4 py-2 font-bold">Origine</th>
                </tr>
              </thead>
              <tbody>
                {props.jobs.map((j) => (
                  <tr key={j.id} className="border-b border-rule/60 last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{fmtStamp(j.createdAt)}</td>
                    <td className="px-4 py-2 font-mono text-[12px]">{j.ofNum}</td>
                    <td className="px-4 py-2">{docLabel(j.docType)}</td>
                    <td className="px-4 py-2">
                      {j.attempt > 1 ? (
                        <span className="font-semibold text-amber-800">
                          réimpression #{j.attempt}
                        </span>
                      ) : (
                        'initial'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-[12px]">{j.destCode}</span>
                    </td>
                    <td className="px-4 py-2">
                      {j.status === 'submitted' ? (
                        <span className="text-emerald-700">soumis à X3</span>
                      ) : (
                        <span className="text-red-700" title={j.error}>
                          échec
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {j.origin}
                      {j.requestedBy ? ` · ${j.requestedBy}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="border-t border-rule px-4 py-2 text-[11.5px] italic text-muted-foreground">
            « Soumis à X3 » atteste que l’édition a été acceptée par le serveur d’édition — pas que
            le document est sorti de l’imprimante.
          </p>
        </section>
      </div>
    </AppLayout>
  )
}
