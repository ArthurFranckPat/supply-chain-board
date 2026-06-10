import { useEffect, useState } from 'react'
import { X, RotateCcw, ShieldCheck, CalendarDays, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import type { FeasibilityEntry, OfPatchPayload, PlanningBoardOF } from '@/types/planningBoard'
import { STATUT_STYLES } from './OfCard'

interface OfDetailPanelProps {
  of: PlanningBoardOF
  onClose: () => void
  onPatch: (numOf: string, payload: OfPatchPayload) => void
  onReset: (numOf: string) => void
  isSaving: boolean
  feasibility?: FeasibilityEntry | null
}

function FeasibilitySection({ entry }: { entry: FeasibilityEntry }) {
  const missing = Object.entries(entry.missing_components)
  const styles = {
    ok: { border: 'border-green/40 bg-green/5', icon: <CheckCircle2 className="h-4 w-4 text-green" />, label: 'Faisable — composants disponibles' },
    bloque: { border: 'border-destructive/40 bg-destructive/5', icon: <AlertTriangle className="h-4 w-4 text-destructive" />, label: 'Bloqué — composants manquants' },
    sans_nomenclature: { border: 'border-orange/50 bg-orange/5', icon: <HelpCircle className="h-4 w-4 text-orange" />, label: 'Nomenclature non disponible' },
  }[entry.statut]

  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border p-3 ${styles.border}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold text-foreground">
        {styles.icon}
        {styles.label}
      </div>
      {missing.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {missing.map(([code, qty]) => (
            <li key={code} className="flex justify-between font-mono text-[10px] text-destructive">
              <span>{code}</span>
              <span>manque {qty}</span>
            </li>
          ))}
        </ul>
      )}
      {entry.alerts.slice(0, 3).map((alert, i) => (
        <div key={i} className="text-[9px] leading-snug text-muted-foreground">{alert}</div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function ReadOnly({ value }: { value: React.ReactNode }) {
  return <span className="text-[12px] font-medium text-foreground">{value ?? '—'}</span>
}

export function OfDetailPanel({ of, onClose, onPatch, onReset, isSaving, feasibility }: OfDetailPanelProps) {
  const [debut, setDebut] = useState(of.date_debut ?? '')
  const [fin, setFin] = useState(of.date_fin ?? '')
  const [note, setNote] = useState(of.note ?? '')

  useEffect(() => {
    setDebut(of.date_debut ?? '')
    setFin(of.date_fin ?? '')
    setNote(of.note ?? '')
  }, [of])

  const statut = STATUT_STYLES[of.statut_num] ?? STATUT_STYLES[3]
  const datesDirty = debut !== (of.date_debut ?? '') || fin !== (of.date_fin ?? '')
  const noteDirty = note !== (of.note ?? '')

  const saveDates = () => {
    const payload: OfPatchPayload = {}
    if (debut !== (of.date_debut ?? '')) payload.date_debut = debut || null
    if (fin !== (of.date_fin ?? '')) payload.date_fin = fin || null
    if (noteDirty) payload.note = note || null
    onPatch(of.num_of, payload)
  }

  const inputCls =
    'rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-4 rounded-2xl border border-border bg-card/90 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[14px] font-black tracking-tight text-foreground">{of.num_of}</div>
          <div className="text-[11px] text-muted-foreground">{of.article}</div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-[12px] leading-snug text-foreground/90">{of.description}</p>

      {feasibility && <FeasibilitySection entry={feasibility} />}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Statut">
          <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statut.chip}`}>
            {statut.label}
          </span>
        </Field>
        <Field label="Statut ERP">
          <ReadOnly value={STATUT_STYLES[of.statut_origine]?.label} />
        </Field>
        <Field label="Qté restante">
          <ReadOnly value={`${of.qte_restante} / ${of.qte_a_fabriquer}`} />
        </Field>
        <Field label="Durée estimée">
          <ReadOnly value={of.duree_heures != null ? `${of.duree_heures.toFixed(1)} h` : null} />
        </Field>
        <Field label="Poste">
          <ReadOnly value={of.poste_charge} />
        </Field>
        <Field label="Cadence">
          <ReadOnly value={of.cadence != null ? `${of.cadence}/h` : null} />
        </Field>
      </div>

      {of.statut_num !== 1 && (
        <button
          onClick={() => onPatch(of.num_of, { statut_num: 1 })}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green px-3 py-2 text-[12px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" />
          Affermir l'OF
        </button>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          Planification
        </div>
        <Field label="Début">
          <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Fin">
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className={inputCls} />
        </Field>
        {of.date_debut_origine && of.date_debut !== of.date_debut_origine && (
          <span className="text-[10px] text-muted-foreground">
            ERP : {of.date_debut_origine} → {of.date_fin_origine}
          </span>
        )}
        <Field label="Note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Commentaire ordonnanceur…"
            className={`${inputCls} resize-none`}
          />
        </Field>
        <button
          onClick={saveDates}
          disabled={isSaving || (!datesDirty && !noteDirty)}
          className="rounded-xl bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>

      {of.modified && (
        <button
          onClick={() => onReset(of.num_of)}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Annuler mes modifications
        </button>
      )}
    </aside>
  )
}
