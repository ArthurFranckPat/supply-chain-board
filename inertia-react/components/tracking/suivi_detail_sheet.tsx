import React from 'react'
import { Message, Pill } from 'carbon-react'
import { cn } from '@/libs/cn'
import { OF_STATUT } from '@/lib/suivi/tracking-shared'
import { STATUS_PILL, VERDICT_PILL, OF_STATUT_PILL, TYPE_PILL } from '../../lib/suivi/pill_tones'
import type { SuiviDisplayRow, ProactiveDisplayRow } from '@/lib/suivi/types'

interface SuiviDetailSheetProps {
  type: 'reactif' | 'proactif'
  row: SuiviDisplayRow | ProactiveDisplayRow
}

export function SuiviDetailSheet({ type, row }: SuiviDetailSheetProps) {
  const isReactif = type === 'reactif'

  // Helpers to cast to specific row type safely
  const reactiveRow = row as SuiviDisplayRow
  const proactiveRow = row as ProactiveDisplayRow

  const enZoneExpe = isReactif ? reactiveRow.enZoneExpe : false
  // action est envoyée par le serveur POUR LES DEUX familles (reactif + proactif,
  // cf. SuiviController). On lit row.action directement — la dérivation précédente
  // depuis verdictKey écrasait la vraie recommandation du moteur.
  const action = (row as { action: { severity: 'info' | 'warning' | 'critical'; label: string } }).action

  const late = isReactif ? reactiveRow.late : proactiveRow.joursRetard > 0
  const lateDays = isReactif ? reactiveRow.lateDays : proactiveRow.joursRetard

  // Stepper calculations (Physical Supply Chain Lifecycle)
  const stepApproState = () => {
    if (isReactif) {
      const causeType = reactiveRow.cause?.type
      if (causeType === 'AUCUN_OF_PLANIFIE') return 'gray'
      if (causeType === 'ATTENTE_RECEPTION_FOURNISSEUR') return 'amber'
      return 'green'
    } else {
      const v = proactiveRow.verdictKey
      if (v === 'uncov') return 'gray'
      if (v === 'blocked') return 'amber'
      return 'green'
    }
  }

  const stepDispoState = () => {
    if (stepApproState() !== 'green') return 'gray'
    if (isReactif) {
      const status = reactiveRow.statusKey
      const causeType = reactiveRow.cause?.type
      if (status === 'ret' && (causeType === 'RUPTURE_COMPOSANTS' || causeType === 'RETARD_ORDONNANCEMENT')) {
        return 'gray'
      }
      return 'green'
    } else {
      const v = proactiveRow.verdictKey
      if (v === 'late' || v === 'blocked' || v === 'uncov') return 'gray'
      if (v === 'risk') return 'amber'
      return 'green'
    }
  }

  const stepAllocState = () => {
    if (stepDispoState() !== 'green') return 'gray'
    if (isReactif) {
      const status = reactiveRow.statusKey
      if (status === 'exp') return 'green'
      if (status === 'alc') return 'amber'
      return 'gray'
    } else {
      const v = proactiveRow.verdictKey
      const fullyAllocated = proactiveRow.qteAllouee >= total
      if (v === 'stock' || fullyAllocated) return 'green'
      if (proactiveRow.qteAllouee > 0) return 'amber'
      return 'gray'
    }
  }

  const stepExpState = () => {
    if (stepAllocState() !== 'green') return 'gray'
    if (isReactif && reactiveRow.cq) return 'purple'
    if (isReactif && reactiveRow.statusKey === 'ras') return 'green'
    if (enZoneExpe) return 'amber'
    return 'gray'
  }

  // Quantity bar calculations
  const total = row.qteRestante || 1
  const strictVal = isReactif ? reactiveRow.allocStrict : proactiveRow.qteAllouee
  const cqVal = isReactif ? reactiveRow.allocCq : 0
  const reliquatVal = isReactif ? Math.max(0, total - strictVal - cqVal) : proactiveRow.reliquat

  const pctStrict = Math.round((strictVal / total) * 100)
  const pctCq = Math.round((cqVal / total) * 100)
  const pctReliquat = Math.round((reliquatVal / total) * 100)

  return (
    <div className="flex flex-col gap-6 text-sans pb-8">
      {/* 1. Stepper de Cycle de Commande */}
      <div className="flex items-center justify-between px-3 py-4 bg-secondary/15 rounded-2xl border border-rule-soft/60 relative overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]">
        <div className="absolute left-10 right-10 top-[2.25rem] h-0.5 bg-secondary border-t border-rule-soft z-0" />
        
        {/* Etape 1: Commande */}
        <div className="flex flex-col items-center gap-1.5 z-10 w-16">
          <div className="size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] border border-emerald-400"
               title="Commande enregistrée et validée dans l'ERP.">
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
          </div>
          <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Saisie</span>
        </div>

        {/* Etape 2: Planifié / Couvert */}
        <div className="flex flex-col items-center gap-1.5 z-10 w-16">
          <div className={cn("size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all", {
            'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] border border-emerald-400': stepApproState() === 'green',
            'bg-amber-500 text-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.3)] border border-amber-400': stepApproState() === 'amber',
            'bg-secondary text-muted-foreground border border-rule': stepApproState() === 'gray'
          })}
               title={stepApproState() === 'green' ? 'Ligne d\'approvisionnement planifiée (OF, Stock ou PO)' : stepApproState() === 'amber' ? 'Approvisionnement fournisseur tardif' : 'Aucune couverture d\'approvisionnement planifiée'}>
            <span className="material-symbols-outlined text-[16px]">precision_manufacturing</span>
          </div>
          <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Couverture</span>
        </div>

        {/* Etape 3: Produit / Disponible */}
        <div className="flex flex-col items-center gap-1.5 z-10 w-16">
          <div className={cn("size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all", {
            'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] border border-emerald-400': stepDispoState() === 'green',
            'bg-amber-500 text-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.3)] border border-amber-400': stepDispoState() === 'amber',
            'bg-secondary text-muted-foreground border border-rule': stepDispoState() === 'gray'
          })}
               title={stepDispoState() === 'green' ? 'Produit fini disponible en stock' : stepDispoState() === 'amber' ? 'Fabrication en cours à risque' : 'Rupture composant ou retard de fabrication'}>
            <span className="material-symbols-outlined text-[16px]">inventory_2</span>
          </div>
          <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Disponible</span>
        </div>

        {/* Etape 4: Réservé / Alloué */}
        <div className="flex flex-col items-center gap-1.5 z-10 w-16">
          <div className={cn("size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all", {
            'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] border border-emerald-400': stepAllocState() === 'green',
            'bg-amber-500 text-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.3)] border border-amber-400': stepAllocState() === 'amber',
            'bg-secondary text-muted-foreground border border-rule': stepAllocState() === 'gray'
          })}
               title={stepAllocState() === 'green' ? 'Stock alloué et réservé dans X3' : stepAllocState() === 'amber' ? 'Stock disponible mais allocation informatique à faire' : 'En attente d\'entrée en stock'}>
            <span className="material-symbols-outlined text-[16px]">bookmark_added</span>
          </div>
          <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Alloué</span>
        </div>

        {/* Etape 5: Zone Expé */}
        <div className="flex flex-col items-center gap-1.5 z-10 w-16">
          <div className={cn("size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all", {
            'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] border border-emerald-400': stepExpState() === 'green',
            'bg-amber-500 text-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.3)] border border-amber-400': stepExpState() === 'amber',
            'bg-purple-500 text-white animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.3)] border border-purple-400': stepExpState() === 'purple',
            'bg-secondary text-muted-foreground border border-rule': stepExpState() === 'gray'
          })}
               title={stepExpState() === 'green' ? 'Commande traitée (RAS)' : stepExpState() === 'amber' ? 'Stock en zone d\'expédition, en attente d\'enlèvement' : stepExpState() === 'purple' ? 'Bloqué en attente du contrôle qualité (CQ)' : 'En attente de transfert vers la zone d\'expédition'}>
            <span className="material-symbols-outlined text-[16px]">local_shipping</span>
          </div>
          <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Zone Expé</span>
        </div>
      </div>

      {/* 2. Header Card (Fiche Commande) */}
      <div className="relative overflow-hidden rounded-2xl border border-rule bg-gradient-to-br from-secondary/30 via-secondary/10 to-transparent p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm">
        <div className="absolute -right-6 -top-6 size-24 rounded-full bg-brand/5 opacity-[0.03] blur-xl" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-extrabold tracking-tight text-foreground bg-foreground/[0.05] px-2.5 py-0.5 rounded-lg border border-rule">
                {row.numCommande}
              </span>
              <span className="text-[11px] font-sans font-bold text-muted-foreground/75">
                • Commande client
              </span>
            </div>
            {row.refCommandeClient && (
              <div className="mt-2 font-mono text-[10.5px] text-muted-foreground font-medium">
                Réf ext: <span className="text-foreground/80">{row.refCommandeClient}</span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            {/* Chip Type (MTS/MTO/NOR) — Carbon Pill (variant information / fill brand). */}
            <Pill
              colorVariant={TYPE_PILL.colorVariant}
              fill={TYPE_PILL.fill}
              pillRole="status"
            >
              {row.type}
            </Pill>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-rule-soft/60 pt-4">
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Client</span>
            <div className="text-[13px] font-bold text-foreground mt-0.5">{row.client}</div>
          </div>
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Atelier / Ligne</span>
            <div className="text-[13px] font-bold text-foreground mt-0.5">{row.atelierLabel || row.atelier || '—'}</div>
          </div>
        </div>

        <div className="mt-4 border-t border-rule-soft/60 pt-4">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Article & Désignation</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[12.5px] font-bold text-brand">{row.article}</span>
            {row.refArticleClient && row.refArticleClient !== row.article && (
              <span className="font-mono text-[10px] text-muted-foreground bg-secondary/40 px-1.5 py-px rounded">(Client: {row.refArticleClient})</span>
            )}
          </div>
          <div className="text-[12.5px] font-medium text-secondary-foreground leading-relaxed mt-1">{row.designation || '—'}</div>
        </div>
      </div>

      {/* 3. Alerte Recommandation — Carbon Message (variant dérive de action.severity). */}
      <Message
        variant={
          action.severity === 'critical' ? 'error'
          : action.severity === 'warning' ? 'warning'
          : 'info'
        }
        title="Recommandation Supply-Chain"
      >
        {action.label}
      </Message>

      {/* 4. Expé & Délais */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between h-20">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Date d'Expédition</span>
          <div className="font-mono text-[16px] font-black text-foreground">{row.dateExp || '—'}</div>
        </div>
        <div className="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between h-20">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">État de Livraison</span>
          <div className="flex flex-col gap-0.5">
            {(() => {
              // Badge état de livraison — Carbon Pill (tone dérivé du statusKey / verdictKey).
              const tone = isReactif
                ? STATUS_PILL[reactiveRow.statusKey]
                : VERDICT_PILL[proactiveRow.verdictKey]
              const label = isReactif ? reactiveRow.statusLabel : proactiveRow.verdictLabel
              return (
                <Pill colorVariant={tone.colorVariant} fill={tone.fill} pillRole="status">
                  {label}
                </Pill>
              )
            })()}
            {late && (
              <span className="text-[10.5px] text-destructive font-bold mt-0.5 flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px] leading-none">schedule</span>
                Retard: +{lateDays} jour{lateDays > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 5. Gauge Visuelle & Répartition des Quantités */}
      <div className="rounded-2xl border border-rule p-5 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
          Répartition des Quantités
        </h4>
        
        {/* Stacked Progress Bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground/85">
            <span>Rapport d'allocation</span>
            <span>{strictVal + cqVal} / {total} u ({pctStrict + pctCq}%)</span>
          </div>
          <div className="relative h-3 w-full bg-secondary/50 rounded-full overflow-hidden flex border border-rule-soft">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${pctStrict}%` }} />
            <div className="bg-purple-500 h-full transition-all duration-500" style={{ width: `${pctCq}%` }} />
            <div className="bg-secondary h-full transition-all duration-500" style={{ width: `${pctReliquat}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center mt-2">
          <div className="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
            <div className="text-[9.5px] font-semibold text-muted-foreground">Reste à livrer</div>
            <div className="font-mono text-[16px] font-black text-foreground mt-0.5">{total}</div>
          </div>
          {isReactif ? (
            <>
              <div className="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
                <div className="text-[9.5px] font-semibold text-emerald-600">Strict</div>
                <div className="font-mono text-[16px] font-black text-emerald-600 mt-0.5">{reactiveRow.allocStrict}</div>
              </div>
              <div className="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
                <div className="text-[9.5px] font-semibold text-purple-600">Sous CQ</div>
                <div className="font-mono text-[16px] font-black text-purple-600 mt-0.5">{reactiveRow.allocCq}</div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
                <div className="text-[9.5px] font-semibold text-emerald-600">Alloué</div>
                <div className="font-mono text-[16px] font-black text-emerald-600 mt-0.5">{proactiveRow.qteAllouee}</div>
              </div>
              <div className="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
                <div className="text-[9.5px] font-semibold text-muted-foreground">Reliquat</div>
                <div className="font-mono text-[16px] font-black text-foreground mt-0.5">{proactiveRow.reliquat}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 6. Goulots & Approvisionnements (BOM) */}
      {!isReactif && proactiveRow.composants.length > 0 && (
        <div className="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
            Goulots d'Approvisionnement
          </h4>
          <div className="flex flex-col gap-4">
            {proactiveRow.composants.map((c, idx) => (
              <div key={idx} className="border-b border-rule-soft last:border-0 pb-4 last:pb-0 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12.5px] font-bold text-destructive">{c.art}</span>
                  <Pill size="S" colorVariant="negative" fill={false} pillRole="status">
                    {`−${c.qty} manquants`}
                  </Pill>
                </div>
                <div className="text-[12px] font-medium text-secondary-foreground leading-normal">{c.desc}</div>

                {/* Reception Directe (Acheminement) */}
                {c.reception ? (
                  <div className="rounded-xl border border-rule-soft bg-gradient-to-r from-secondary/15 to-transparent p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className={cn("flex items-center gap-1.5 text-[11px] font-bold", {
                        'text-destructive': c.reception.overdue,
                        'text-brand': !c.reception.overdue
                      })}>
                        <span className="material-symbols-outlined text-[16px]">
                          {c.reception.overdue ? 'warning' : 'local_shipping'}
                        </span>
                        <span>{c.reception.overdue ? `Retard d'approvisionnement (+${c.reception.retardJ}j)` : 'Acheminement en cours'}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-rule-soft">
                        PO: {c.reception.po}
                      </span>
                    </div>

                    {/* Delivery Timeline Track */}
                    <div className="flex items-center gap-2 mt-1 px-1">
                      {/* Sourced */}
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="h-1.5 bg-emerald-500 rounded-full" />
                        <span className="text-[8px] font-extrabold text-emerald-600 uppercase">Commandé</span>
                      </div>
                      {/* In transit */}
                      <div className="flex-1 flex flex-col gap-1">
                        <div className={cn("h-1.5 rounded-full", c.reception.overdue ? 'bg-destructive/40' : 'bg-emerald-500')} />
                        <span className={cn("text-[8px] font-extrabold uppercase", c.reception.overdue ? 'text-destructive font-bold' : 'text-emerald-600')}>Transit</span>
                      </div>
                      {/* ETA */}
                      <div className="flex-1 flex flex-col gap-1">
                        <div className={cn("h-1.5 rounded-full", c.reception.overdue ? 'bg-destructive' : 'bg-secondary')} />
                        <span className={cn("text-[8px] font-extrabold uppercase", c.reception.overdue ? 'text-destructive font-bold' : 'text-muted-foreground')}>Arrivée ({c.reception.eta})</span>
                      </div>
                    </div>

                    <div className="text-[11px] mt-1 border-t border-rule-soft/60 pt-2 text-muted-foreground flex flex-col gap-0.5">
                      <div><span className="font-semibold text-foreground/80">Fournisseur :</span> {c.reception.supplier}</div>
                    </div>
                  </div>
                ) : !c.descente ? (
                  <div className="flex items-center gap-1 font-mono text-[10px] text-destructive/80 font-bold bg-destructive/5 px-2.5 py-1 rounded-lg w-fit border border-destructive/10">
                    <span className="material-symbols-outlined text-[13px] leading-none">event_busy</span>
                    Aucune réception d'achat de couverture prévue.
                  </div>
                ) : null}

                {/* Descente de Nomenclature (Niveau Cascade) */}
                {c.descente && (
                  <div className="rounded-xl border border-rule-soft bg-secondary/15 p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                      <span className="material-symbols-outlined text-[14px]">subdirectory_arrow_right</span>
                      <span>Nomenclature sous-ensemble</span>
                    </div>
                    {c.descente.statut === 'se_a_lancer' ? (
                      <div className="pl-3.5 text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Composants disponibles — OF du sous-ensemble prêt à lancer
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5 pl-3 border-l-2 border-dotted border-destructive/20 ml-2 mt-1">
                        <div className="text-[9.5px] font-extrabold text-destructive uppercase tracking-wide">Composants parents bloquants :</div>
                        {c.descente.par.map((p, pIdx) => (
                          <div key={pIdx} className="text-[11px] text-muted-foreground flex flex-col gap-1 relative pl-2">
                            <div className="absolute left-0 top-1.5 size-1.5 rounded-full bg-destructive/40 -translate-x-[15px]" />
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-foreground/80"><b className="font-mono font-bold text-destructive text-[11.5px]">{p.art}</b> <span className="text-[10px] opacity-80">({p.desc})</span></span>
                              <span className="font-mono font-bold text-destructive shrink-0">−{p.manque}</span>
                            </div>
                            {p.reception ? (
                              <div className="rounded bg-secondary/40 p-2.5 flex flex-col gap-0.5 text-[10px] mt-0.5 border border-rule-soft">
                                <div className={cn("flex items-center gap-1 font-semibold", p.reception.overdue ? 'text-destructive' : 'text-foreground/75')}>
                                  <span className="material-symbols-outlined text-[12px]">
                                    {p.reception.overdue ? 'warning' : 'local_shipping'}
                                  </span>
                                  <span>{p.reception.overdue ? `Retard +${p.reception.retardJ}j` : 'Livraison prévue'}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground mt-0.5">
                                  <span>PO: <span className="text-foreground/80">{p.reception.po}</span></span>
                                  <span>Arrivée: <span className="text-foreground/80">{p.reception.eta}</span></span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 text-[9.5px] text-destructive/80 font-bold bg-destructive/5 px-2 py-0.5 rounded w-fit">
                                <span className="material-symbols-outlined text-[11px] leading-none">event_busy</span>
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
        <div className="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
            Ordres de Fabrication ({proactiveRow.ofs.length})
          </h4>
          <div className="flex flex-col gap-4">
            {proactiveRow.ofs.map((of) => {
              const st = OF_STATUT[of.statutNum]
              const ofTone = OF_STATUT_PILL[of.statutNum] ?? { colorVariant: 'neutral' as const, fill: false }
              return (
                <div key={of.numOf} className="border border-rule-soft rounded-xl p-4 flex flex-col gap-3 bg-secondary/15 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-bold text-foreground bg-card border border-rule px-2.5 py-0.5 rounded shadow-sm">
                        {of.numOf}
                      </span>
                      {of.estDebuté && (
                        <span className="relative flex h-2 size-2 rounded-full bg-brand-soft/80" title="OF Débuté">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 size-2 bg-brand"></span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {of.estDebuté && (
                        <Pill size="S" colorVariant="information" fill={false} pillRole="status">En cours</Pill>
                      )}
                      {st && (
                        <Pill
                          size="S"
                          colorVariant={ofTone.colorVariant}
                          fill={ofTone.fill}
                          pillRole="status"
                          title={st.tag}
                        >
                          {st.tag}
                        </Pill>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground border-t border-rule-soft/60 pt-3">
                    <div>
                      <span className="text-foreground/60 font-semibold">Composant de tête :</span>
                      <div className="font-mono text-foreground font-semibold mt-0.5">{of.article}</div>
                    </div>
                    <div>
                      <span className="text-foreground/60 font-semibold">Quantité allouée :</span>
                      <div className="font-mono text-foreground font-semibold mt-0.5">{of.qteAllouee} u</div>
                    </div>
                    <div>
                      <span className="text-foreground/60 font-semibold">Fin planifiée :</span>
                      <div className="font-mono text-foreground font-semibold mt-0.5">{of.dateFin}</div>
                    </div>
                    <div>
                      <span className="text-foreground/60 font-semibold">État de faisabilité :</span>
                      <div className="mt-0.5">
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold", of.feasible ? 'text-emerald-600' : 'text-destructive')}>
                          <span className="material-symbols-outlined text-[13px] leading-none">
                            {of.feasible ? 'check_circle' : 'cancel'}
                          </span>
                          {of.feasible === null ? '—' : of.feasible ? 'Prêt à produire' : 'Bloqué'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {of.missingComponents.length > 0 && (
                    <div className="border-t border-rule-soft/60 pt-3 mt-1 flex flex-col gap-1.5">
                      <div className="text-[9.5px] font-bold text-destructive uppercase tracking-wide">Composants manquants :</div>
                      <div className="flex flex-wrap gap-1.5">
                        {of.missingComponents.map((mc, mcIdx) => (
                          <Pill
                            key={mcIdx}
                            size="S"
                            colorVariant="negative"
                            fill={false}
                            pillRole="status"
                          >
                            {`${mc.art} (−${mc.qty})`}
                          </Pill>
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
        <div className="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
            Emplacements & Palettes de Stock
          </h4>
          <div className="flex flex-col gap-2.5">
            {reactiveRow.emplacements.map((e, idx) => (
              <div key={idx} className="flex items-center justify-between border border-rule-soft/60 rounded-xl p-3 bg-secondary/5 hover:bg-secondary/15 transition-all">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground/75 border border-rule-soft">
                    <span className="material-symbols-outlined text-[18px]">
                      {e.source === 'STOALL' ? 'inventory' : 'shelves'}
                    </span>
                  </div>
                  <div>
                    <div className="font-mono text-[12px] font-bold text-foreground">{e.nom}</div>
                    <div className={cn("text-[9px] uppercase font-extrabold tracking-wider mt-0.5", e.source === 'STOALL' ? 'text-emerald-600' : 'text-amber-600')}>
                      {e.source === 'STOALL' ? 'Stock Alloué' : 'Stock Libre'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {e.hum && (
                    <span className="font-mono text-[10px] text-muted-foreground bg-secondary/55 px-2 py-0.5 rounded-lg border border-rule-soft">
                      HU: {e.hum}
                    </span>
                  )}
                  <span className="font-mono text-[12.5px] font-extrabold text-foreground bg-secondary/30 px-2 py-1 rounded border border-rule-soft">
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
