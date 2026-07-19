/**
 * Diagnostic de ligne (drawer) — port React de
 * inertia/components/tracking/suivi-detail-sheet.tsx.
 */
import { cn } from '@r/lib/utils'
import { BADGE_TONE, VERDICT_TONE, OF_STATUT } from '@/lib/suivi/tracking-shared'
import type { SuiviDisplayRow, ProactiveDisplayRow } from '@/lib/suivi/types'

interface SuiviDetailSheetProps {
  type: 'reactif' | 'proactif'
  row: SuiviDisplayRow | ProactiveDisplayRow
}

type StepState = 'green' | 'amber' | 'gray' | 'purple'

const STEP_CIRCLE: Record<StepState, string> = {
  green:
    'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] border border-emerald-400',
  amber:
    'bg-amber-500 text-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.3)] border border-amber-400',
  purple:
    'bg-purple-500 text-white animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.3)] border border-purple-400',
  gray: 'bg-secondary text-muted-foreground border border-rule',
}

export function SuiviDetailSheet({ type, row }: SuiviDetailSheetProps) {
  const isReactif = type === 'reactif'
  const reactiveRow = row as SuiviDisplayRow
  const proactiveRow = row as ProactiveDisplayRow
  // Champs absents du payload proactif (late/lateDays/enZoneExpe côté réactif
  // uniquement) — le Solid lisait undefined (falsy), on garde la même lecture.
  const late = (row as SuiviDisplayRow).late ?? false
  const lateDays = (row as SuiviDisplayRow).lateDays ?? 0
  const enZoneExpe = (row as SuiviDisplayRow).enZoneExpe ?? false

  // Stepper (Physical Supply Chain Lifecycle)
  const stepAppro: StepState = (() => {
    if (isReactif) {
      const causeType = reactiveRow.cause?.type
      if (causeType === 'AUCUN_OF_PLANIFIE') return 'gray'
      if (causeType === 'ATTENTE_RECEPTION_FOURNISSEUR') return 'amber'
      return 'green'
    }
    const v = proactiveRow.verdictKey
    if (v === 'uncov') return 'gray'
    if (v === 'blocked') return 'amber'
    return 'green'
  })()

  const stepDispo: StepState = (() => {
    if (stepAppro !== 'green') return 'gray'
    if (isReactif) {
      const status = reactiveRow.statusKey
      const causeType = reactiveRow.cause?.type
      if (
        status === 'ret' &&
        (causeType === 'RUPTURE_COMPOSANTS' || causeType === 'RETARD_ORDONNANCEMENT')
      ) {
        return 'gray'
      }
      return 'green'
    }
    const v = proactiveRow.verdictKey
    if (v === 'late' || v === 'blocked' || v === 'uncov') return 'gray'
    if (v === 'risk') return 'amber'
    return 'green'
  })()

  const total = row.qteRestante || 1

  const stepAlloc: StepState = (() => {
    if (stepDispo !== 'green') return 'gray'
    if (isReactif) {
      const status = reactiveRow.statusKey
      if (status === 'exp') return 'green'
      if (status === 'alc') return 'amber'
      return 'gray'
    }
    const v = proactiveRow.verdictKey
    const fullyAllocated = proactiveRow.qteAllouee >= total
    if (v === 'stock' || fullyAllocated) return 'green'
    if (proactiveRow.qteAllouee > 0) return 'amber'
    return 'gray'
  })()

  const stepExp: StepState = (() => {
    if (stepAlloc !== 'green') return 'gray'
    if (isReactif && reactiveRow.cq) return 'purple'
    if (isReactif && reactiveRow.statusKey === 'ras') return 'green'
    if (enZoneExpe) return 'amber'
    return 'gray'
  })()

  // Quantity bar
  const strictVal = isReactif ? reactiveRow.allocStrict : proactiveRow.qteAllouee
  const cqVal = isReactif ? reactiveRow.allocCq : 0
  const reliquatVal = isReactif
    ? Math.max(0, total - strictVal - cqVal)
    : proactiveRow.reliquat

  const pctStrict = Math.round((strictVal / total) * 100)
  const pctCq = Math.round((cqVal / total) * 100)
  const pctReliquat = Math.round((reliquatVal / total) * 100)

  // `action` n'existe que sur les lignes réactives (payload serveur) — le
  // Solid plantait au clic d'une ligne proactive (r().action.severity sur
  // undefined). Repli neutre plutôt que crash.
  const action = (row as SuiviDisplayRow).action ?? { severity: 'info' as const, label: '—' }
  const severity = action.severity

  return (
    <div className="text-sans flex flex-col gap-6 pb-8">
      {/* 1. Stepper de Cycle de Commande */}
      <div className="relative flex items-center justify-between overflow-hidden rounded-2xl border border-rule-soft/60 bg-secondary/15 px-3 py-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]">
        <div className="absolute left-10 right-10 top-[2.25rem] z-0 h-0.5 border-t border-rule-soft bg-secondary" />

        {/* Etape 1: Commande */}
        <div className="z-10 flex w-16 flex-col items-center gap-1.5">
          <div
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-[12px] font-bold transition-all',
              STEP_CIRCLE.green
            )}
            title="Commande enregistrée et validée dans l'ERP."
          >
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
          </div>
          <span className="text-center text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Saisie
          </span>
        </div>

        {/* Etape 2: Planifié / Couvert */}
        <div className="z-10 flex w-16 flex-col items-center gap-1.5">
          <div
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-[12px] font-bold transition-all',
              STEP_CIRCLE[stepAppro]
            )}
            title={
              stepAppro === 'green'
                ? "Ligne d'approvisionnement planifiée (OF, Stock ou PO)"
                : stepAppro === 'amber'
                  ? 'Approvisionnement fournisseur tardif'
                  : "Aucune couverture d'approvisionnement planifiée"
            }
          >
            <span className="material-symbols-outlined text-[16px]">precision_manufacturing</span>
          </div>
          <span className="text-center text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Couverture
          </span>
        </div>

        {/* Etape 3: Produit / Disponible */}
        <div className="z-10 flex w-16 flex-col items-center gap-1.5">
          <div
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-[12px] font-bold transition-all',
              STEP_CIRCLE[stepDispo]
            )}
            title={
              stepDispo === 'green'
                ? 'Produit fini disponible en stock'
                : stepDispo === 'amber'
                  ? 'Fabrication en cours à risque'
                  : 'Rupture composant ou retard de fabrication'
            }
          >
            <span className="material-symbols-outlined text-[16px]">inventory_2</span>
          </div>
          <span className="text-center text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Disponible
          </span>
        </div>

        {/* Etape 4: Réservé / Alloué */}
        <div className="z-10 flex w-16 flex-col items-center gap-1.5">
          <div
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-[12px] font-bold transition-all',
              STEP_CIRCLE[stepAlloc]
            )}
            title={
              stepAlloc === 'green'
                ? 'Stock alloué et réservé dans X3'
                : stepAlloc === 'amber'
                  ? 'Stock disponible mais allocation informatique à faire'
                  : "En attente d'entrée en stock"
            }
          >
            <span className="material-symbols-outlined text-[16px]">bookmark_added</span>
          </div>
          <span className="text-center text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Alloué
          </span>
        </div>

        {/* Etape 5: Zone Expé */}
        <div className="z-10 flex w-16 flex-col items-center gap-1.5">
          <div
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-[12px] font-bold transition-all',
              STEP_CIRCLE[stepExp]
            )}
            title={
              stepExp === 'green'
                ? 'Commande traitée (RAS)'
                : stepExp === 'amber'
                  ? "Stock en zone d'expédition, en attente d'enlèvement"
                  : stepExp === 'purple'
                    ? 'Bloqué en attente du contrôle qualité (CQ)'
                    : "En attente de transfert vers la zone d'expédition"
            }
          >
            <span className="material-symbols-outlined text-[16px]">local_shipping</span>
          </div>
          <span className="text-center text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Zone Expé
          </span>
        </div>
      </div>

      {/* 2. Header Card (Fiche Commande) */}
      <div className="relative overflow-hidden rounded-2xl border border-rule bg-gradient-to-br from-secondary/30 via-secondary/10 to-transparent p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm">
        <div className="absolute -right-6 -top-6 size-24 rounded-full bg-brand/5 opacity-[0.03] blur-xl" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-rule bg-foreground/[0.05] px-2.5 py-0.5 font-mono text-[13px] font-extrabold tracking-tight text-foreground">
                {row.numCommande}
              </span>
              <span className="font-sans text-[11px] font-bold text-muted-foreground/75">
                • Commande client
              </span>
            </div>
            {row.refCommandeClient && (
              <div className="mt-2 font-mono text-[10.5px] font-medium text-muted-foreground">
                Réf ext: <span className="text-foreground/80">{row.refCommandeClient}</span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            <span className="rounded-full border border-brand/20 bg-brand-soft/80 px-2.5 py-1 font-mono text-[10px] font-extrabold uppercase tracking-wide text-brand">
              {row.type}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-rule-soft/60 pt-4">
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Client
            </span>
            <div className="mt-0.5 text-[13px] font-bold text-foreground">{row.client}</div>
          </div>
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Atelier / Ligne
            </span>
            <div className="mt-0.5 text-[13px] font-bold text-foreground">
              {row.atelierLabel || '—'}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-rule-soft/60 pt-4">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">
            Article &amp; Désignation
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[12.5px] font-bold text-brand">{row.article}</span>
            {row.refArticleClient && row.refArticleClient !== row.article && (
              <span className="rounded bg-secondary/40 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                (Client: {row.refArticleClient})
              </span>
            )}
          </div>
          <div className="mt-1 text-[12.5px] font-medium leading-relaxed text-secondary-foreground">
            {row.designation || '—'}
          </div>
        </div>
      </div>

      {/* 3. Alert Notification (Recommandation) */}
      <div
        className={cn(
          'relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-rule p-5 shadow-[0_4px_20px_-6px_rgba(0,0,0,0.02)] transition-all',
          severity === 'info' && 'border-brand/20 bg-brand/5 text-brand',
          severity === 'warning' &&
            'border-amber-500/25 bg-amber-500/[0.04] text-amber-600 dark:text-amber-400',
          severity === 'critical' && 'border-destructive/20 bg-destructive/[0.03] text-destructive'
        )}
      >
        <div className="absolute right-0 top-0 -translate-y-3 translate-x-3 opacity-[0.04]">
          <span className="material-symbols-outlined text-[72px] leading-none">
            {severity === 'critical' ? 'report' : severity === 'warning' ? 'warning' : 'info'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">
            {severity === 'critical' ? 'report' : severity === 'warning' ? 'warning' : 'info'}
          </span>
          <span className="text-[10px] font-extrabold uppercase tracking-wider">
            Recommandation Supply-Chain
          </span>
        </div>
        <p className="text-[13px] font-bold leading-relaxed text-foreground">{action.label}</p>
      </div>

      {/* 4. Expé & Délais */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex h-20 flex-col justify-between rounded-2xl border border-rule bg-card p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">
            Date d'Expédition
          </span>
          <div className="font-mono text-[16px] font-black text-foreground">
            {row.dateExp || '—'}
          </div>
        </div>
        <div className="flex h-20 flex-col justify-between rounded-2xl border border-rule bg-card p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">
            État de Livraison
          </span>
          <div className="flex flex-col gap-0.5">
            {isReactif ? (
              <span
                className={cn(
                  'inline-flex w-fit items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide',
                  BADGE_TONE[reactiveRow.statusKey]
                )}
              >
                {reactiveRow.statusLabel}
              </span>
            ) : (
              <span
                className={cn(
                  'inline-flex w-fit items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide',
                  VERDICT_TONE[proactiveRow.verdictKey]
                )}
              >
                {proactiveRow.verdictLabel}
              </span>
            )}
            {late && (
              <span className="mt-0.5 flex items-center gap-0.5 text-[10.5px] font-bold text-destructive">
                <span className="material-symbols-outlined text-[12px] leading-none">schedule</span>
                Retard: +{lateDays} jour{lateDays > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 5. Gauge Visuelle & Répartition des Quantités */}
      <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-card p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
        <h4 className="border-b border-rule-soft pb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80">
          Répartition des Quantités
        </h4>

        {/* Stacked Progress Bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground/85">
            <span>Rapport d'allocation</span>
            <span>
              {strictVal + cqVal} / {total} u ({pctStrict + pctCq}%)
            </span>
          </div>
          <div className="relative flex h-3 w-full overflow-hidden rounded-full border border-rule-soft bg-secondary/50">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pctStrict}%` }} />
            <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${pctCq}%` }} />
            <div className="h-full bg-secondary transition-all duration-500" style={{ width: `${pctReliquat}%` }} />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-rule-soft/40 bg-secondary/15 p-2.5">
            <div className="text-[9.5px] font-semibold text-muted-foreground">Reste à livrer</div>
            <div className="mt-0.5 font-mono text-[16px] font-black text-foreground">{total}</div>
          </div>
          {isReactif ? (
            <>
              <div className="rounded-xl border border-rule-soft/40 bg-secondary/15 p-2.5">
                <div className="text-[9.5px] font-semibold text-emerald-600">Strict</div>
                <div className="mt-0.5 font-mono text-[16px] font-black text-emerald-600">
                  {reactiveRow.allocStrict}
                </div>
              </div>
              <div className="rounded-xl border border-rule-soft/40 bg-secondary/15 p-2.5">
                <div className="text-[9.5px] font-semibold text-purple-600">Sous CQ</div>
                <div className="mt-0.5 font-mono text-[16px] font-black text-purple-600">
                  {reactiveRow.allocCq}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-rule-soft/40 bg-secondary/15 p-2.5">
                <div className="text-[9.5px] font-semibold text-emerald-600">Alloué</div>
                <div className="mt-0.5 font-mono text-[16px] font-black text-emerald-600">
                  {proactiveRow.qteAllouee}
                </div>
              </div>
              <div className="rounded-xl border border-rule-soft/40 bg-secondary/15 p-2.5">
                <div className="text-[9.5px] font-semibold text-muted-foreground">Reliquat</div>
                <div className="mt-0.5 font-mono text-[16px] font-black text-foreground">
                  {proactiveRow.reliquat}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 6. Goulots & Approvisionnements (BOM) */}
      {!isReactif && proactiveRow.composants.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-card p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <h4 className="border-b border-rule-soft pb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80">
            Goulots d'Approvisionnement
          </h4>
          <div className="flex flex-col gap-4">
            {proactiveRow.composants.map((c) => (
              <div
                key={c.art}
                className="flex flex-col gap-2 border-b border-rule-soft pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12.5px] font-bold text-destructive">{c.art}</span>
                  <span className="rounded bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-extrabold text-destructive">
                    −{c.qty} manquants
                  </span>
                </div>
                <div className="text-[12px] font-medium leading-normal text-secondary-foreground">
                  {c.desc}
                </div>

                {/* Reception Directe (Acheminement) */}
                {c.reception ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-rule-soft bg-gradient-to-r from-secondary/15 to-transparent p-4">
                    <div className="flex items-center justify-between">
                      <div
                        className={cn(
                          'flex items-center gap-1.5 text-[11px] font-bold',
                          c.reception.overdue ? 'text-destructive' : 'text-brand'
                        )}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {c.reception.overdue ? 'warning' : 'local_shipping'}
                        </span>
                        <span>
                          {c.reception.overdue
                            ? `Retard d'approvisionnement (+${c.reception.retardJ}j)`
                            : 'Acheminement en cours'}
                        </span>
                      </div>
                      <span className="rounded border border-rule-soft bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        PO: {c.reception.po}
                      </span>
                    </div>

                    {/* Delivery Timeline Track */}
                    <div className="mt-1 flex items-center gap-2 px-1">
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[8px] font-extrabold uppercase text-emerald-600">
                          Commandé
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <div
                          className={cn(
                            'h-1.5 rounded-full',
                            c.reception.overdue ? 'bg-destructive/40' : 'bg-emerald-500'
                          )}
                        />
                        <span
                          className={cn(
                            'text-[8px] font-extrabold uppercase',
                            c.reception.overdue
                              ? 'font-bold text-destructive'
                              : 'text-emerald-600'
                          )}
                        >
                          Transit
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <div
                          className={cn(
                            'h-1.5 rounded-full',
                            c.reception.overdue ? 'bg-destructive' : 'bg-secondary'
                          )}
                        />
                        <span
                          className={cn(
                            'text-[8px] font-extrabold uppercase',
                            c.reception.overdue
                              ? 'font-bold text-destructive'
                              : 'text-muted-foreground'
                          )}
                        >
                          Arrivée ({c.reception.eta})
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 flex flex-col gap-0.5 border-t border-rule-soft/60 pt-2 text-[11px] text-muted-foreground">
                      <div>
                        <span className="font-semibold text-foreground/80">Fournisseur :</span>{' '}
                        {c.reception.supplier}
                      </div>
                    </div>
                  </div>
                ) : (
                  !c.descente && (
                    <div className="flex w-fit items-center gap-1 rounded-lg border border-destructive/10 bg-destructive/5 px-2.5 py-1 font-mono text-[10px] font-bold text-destructive/80">
                      <span className="material-symbols-outlined text-[13px] leading-none">
                        event_busy
                      </span>
                      Aucune réception d'achat de couverture prévue.
                    </div>
                  )
                )}

                {/* Descente de Nomenclature (Niveau Cascade) */}
                {c.descente && (
                  <div className="flex flex-col gap-2 rounded-xl border border-rule-soft bg-secondary/15 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                      <span className="material-symbols-outlined text-[14px]">
                        subdirectory_arrow_right
                      </span>
                      <span>Nomenclature sous-ensemble</span>
                    </div>
                    {c.descente.statut === 'se_a_lancer' ? (
                      <div className="flex items-center gap-1 pl-3.5 text-[11px] font-bold text-emerald-700">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Composants disponibles — OF du sous-ensemble prêt à lancer
                      </div>
                    ) : (
                      <div className="mt-1 ml-2 flex flex-col gap-2.5 border-l-2 border-dotted border-destructive/20 pl-3">
                        <div className="text-[9.5px] font-extrabold uppercase tracking-wide text-destructive">
                          Composants parents bloquants :
                        </div>
                        {c.descente.par.map((p) => (
                          <div
                            key={p.art}
                            className="relative flex flex-col gap-1 pl-2 text-[11px] text-muted-foreground"
                          >
                            <div className="absolute left-0 top-1.5 size-1.5 -translate-x-[15px] rounded-full bg-destructive/40" />
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-foreground/80">
                                <b className="font-mono text-[11.5px] font-bold text-destructive">
                                  {p.art}
                                </b>{' '}
                                <span className="text-[10px] opacity-80">({p.desc})</span>
                              </span>
                              <span className="shrink-0 font-mono font-bold text-destructive">
                                −{p.manque}
                              </span>
                            </div>
                            {p.reception ? (
                              <div className="mt-0.5 flex flex-col gap-0.5 rounded border border-rule-soft bg-secondary/40 p-2.5 text-[10px]">
                                <div
                                  className={cn(
                                    'flex items-center gap-1 font-semibold',
                                    p.reception.overdue ? 'text-destructive' : 'text-foreground/75'
                                  )}
                                >
                                  <span className="material-symbols-outlined text-[12px]">
                                    {p.reception.overdue ? 'warning' : 'local_shipping'}
                                  </span>
                                  <span>
                                    {p.reception.overdue
                                      ? `Retard +${p.reception.retardJ}j`
                                      : 'Livraison prévue'}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                                  <span>
                                    PO: <span className="text-foreground/80">{p.reception.po}</span>
                                  </span>
                                  <span>
                                    Arrivée:{' '}
                                    <span className="text-foreground/80">{p.reception.eta}</span>
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex w-fit items-center gap-0.5 rounded bg-destructive/5 px-2 py-0.5 text-[9.5px] font-bold text-destructive/80">
                                <span className="material-symbols-outlined text-[11px] leading-none">
                                  event_busy
                                </span>
                                Aucune couverture
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Ordres de Fabrication Associés */}
      {!isReactif && proactiveRow.ofs.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-card p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <h4 className="border-b border-rule-soft pb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80">
            Ordres de Fabrication ({proactiveRow.ofs.length})
          </h4>
          <div className="flex flex-col gap-4">
            {proactiveRow.ofs.map((of) => {
              const st = OF_STATUT[of.statutNum]
              return (
                <div
                  key={of.numOf}
                  className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-rule-soft bg-secondary/15 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-rule bg-card px-2.5 py-0.5 font-mono text-[13px] font-bold text-foreground shadow-sm">
                        {of.numOf}
                      </span>
                      {of.estDebuté && (
                        <span
                          className="relative flex h-2 size-2 rounded-full bg-brand-soft/80"
                          title="OF Débuté"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75"></span>
                          <span className="relative inline-flex h-2 size-2 rounded-full bg-brand"></span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {of.estDebuté && (
                        <span className="rounded border border-brand/10 bg-brand-soft px-2 py-0.5 font-sans text-[8.5px] font-extrabold uppercase text-brand">
                          En cours
                        </span>
                      )}
                      {st && (
                        <span
                          className={cn(
                            'rounded border border-transparent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider',
                            st.tone
                          )}
                        >
                          {st.tag}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-rule-soft/60 pt-3 text-[11px] text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground/60">Composant de tête :</span>
                      <div className="mt-0.5 font-mono font-semibold text-foreground">
                        {of.article}
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground/60">Quantité allouée :</span>
                      <div className="mt-0.5 font-mono font-semibold text-foreground">
                        {of.qteAllouee} u
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground/60">Fin planifiée :</span>
                      <div className="mt-0.5 font-mono font-semibold text-foreground">
                        {of.dateFin}
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground/60">État de faisabilité :</span>
                      <div className="mt-0.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-bold',
                            of.feasible ? 'text-emerald-600' : 'text-destructive'
                          )}
                        >
                          <span className="material-symbols-outlined text-[13px] leading-none">
                            {of.feasible ? 'check_circle' : 'cancel'}
                          </span>
                          {of.feasible === null ? '—' : of.feasible ? 'Prêt à produire' : 'Bloqué'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {of.missingComponents.length > 0 && (
                    <div className="mt-1 flex flex-col gap-1.5 border-t border-rule-soft/60 pt-3">
                      <div className="text-[9.5px] font-bold uppercase tracking-wide text-destructive">
                        Composants manquants :
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {of.missingComponents.map((mc) => (
                          <span
                            key={mc.art}
                            className="rounded border border-destructive/10 bg-destructive/5 px-2 py-0.5 font-mono text-[9px] font-semibold text-destructive"
                          >
                            {mc.art} (−{mc.qty})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 8. Emplacements de Stock */}
      {isReactif && reactiveRow.emplacements.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-card p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <h4 className="border-b border-rule-soft pb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80">
            Emplacements &amp; Palettes de Stock
          </h4>
          <div className="flex flex-col gap-2.5">
            {reactiveRow.emplacements.map((e, i) => (
              <div
                key={`${e.nom}-${e.hum}-${i}`}
                className="flex items-center justify-between rounded-xl border border-rule-soft/60 bg-secondary/5 p-3 transition-all hover:bg-secondary/15"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg border border-rule-soft bg-secondary text-muted-foreground/75">
                    <span className="material-symbols-outlined text-[18px]">
                      {e.source === 'STOALL' ? 'inventory' : 'shelves'}
                    </span>
                  </div>
                  <div>
                    <div className="font-mono text-[12px] font-bold text-foreground">{e.nom}</div>
                    <div
                      className={cn(
                        'mt-0.5 text-[9px] font-extrabold uppercase tracking-wider',
                        e.source === 'STOALL' ? 'text-emerald-600' : 'text-amber-600'
                      )}
                    >
                      {e.source === 'STOALL' ? 'Stock Alloué' : 'Stock Libre'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {e.dateMiseEnStock && (
                    <span
                      className="rounded-lg border border-rule-soft bg-secondary/55 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                      title="Date d'entrée en stock"
                    >
                      Entrée: {e.dateMiseEnStock}
                    </span>
                  )}
                  {e.hum && (
                    <span className="rounded-lg border border-rule-soft bg-secondary/55 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      HU: {e.hum}
                    </span>
                  )}
                  <span className="rounded border border-rule-soft bg-secondary/30 px-2 py-1 font-mono text-[12.5px] font-extrabold text-foreground">
                    {Math.round(e.qte)} u
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SuiviDetailSheet
