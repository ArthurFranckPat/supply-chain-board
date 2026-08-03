/**
 * DettePoste — « la dette du poste » (#119, design V3).
 *
 * Les 7 familles d'anomalies du domaine (cockpit_anomalies.ts : AnomalieKind)
 * en grille auto-fit. Chaque famille expose sa RÈGLE de déclenchement — le
 * lecteur doit pouvoir contester le chiffre sans lire le code. Les familles
 * sans item s'affichent en fantôme (dashed) : une grille de « Aucun. » noierait
 * le signal, l'absence de signal est elle-même un signal.
 */

import { ArrowUpDown, CircleX, Clock, Copy, FileCheck2, Square, Timer } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { X3Link } from '@r/components/x3-link'

export type AnomalieKind =
  | 'jamais_pointe'
  | 'silence'
  | 'sans_heures'
  | 'heures_faibles'
  | 'doublon_declaration'
  | 'ecart_declaration'
  | 'of_a_solder'

export interface AnomalieVue {
  kind: AnomalieKind
  numOf: string
  article: string
  designation: string | null
  dateDebutIso: string | null
  dernierPointageIso: string | null
  jours: number | null
  qtyDeclaree: number | null
  heuresPointees: number | null
  heuresTheoriques: number | null
}

export interface DoublonVue {
  numOf: string
  openum: number
  iptdat: string
  nombre: number
}

export interface AnomaliesVue {
  jamaisPointes: AnomalieVue[]
  silences: AnomalieVue[]
  heures: AnomalieVue[]
  doublons: DoublonVue[]
}

export interface AnomaliesUsineVue {
  ecartsDeclaration: AnomalieVue[]
  ofsASolder: AnomalieVue[]
}

interface FamilleVue {
  kind: AnomalieKind
  cls: 'crit' | 'warn' | 'info' | 'zero'
  ic: typeof CircleX
  t: string
  regle: string
  items: { of: string; detail: string }[]
}

const fmtQty = (n: number | null | undefined): string =>
  n !== null && n !== undefined && Number.isFinite(n)
    ? `${Math.round(n).toLocaleString('fr-FR')} pc`
    : '—'

export function DettePoste(props: {
  anomalies: AnomaliesVue
  usine: AnomaliesUsineVue | null
  usineLoading: boolean
  onSelectOf: (numOf: string) => void
}) {
  const { anomalies, onSelectOf } = props
  const ecartsDeclaration = props.usine?.ecartsDeclaration ?? []
  const ofsASolder = props.usine?.ofsASolder ?? []
  const heuresFaibles = anomalies.heures.filter((a) => a.kind === 'heures_faibles')
  const sansHeures = anomalies.heures.filter((a) => a.kind === 'sans_heures')

  const familles: FamilleVue[] = [
    {
      kind: 'jamais_pointe',
      cls: 'crit',
      ic: CircleX,
      t: 'Lancés, jamais pointés',
      regle: 'OF ferme démarré depuis plus de 5 j, zéro pointage sur le poste',
      items: anomalies.jamaisPointes.map((a) => ({
        of: a.numOf,
        detail: a.jours !== null ? `${a.jours} j` : a.article,
      })),
    },
    {
      kind: 'ecart_declaration',
      cls: 'warn',
      ic: ArrowUpDown,
      t: 'Écarts de déclaration',
      regle: "Qté PF déclarée > qté pointée à l'opération de ce poste",
      items: ecartsDeclaration.map((a) => ({
        of: a.numOf,
        detail: fmtQty(a.qtyDeclaree),
      })),
    },
    {
      kind: 'silence',
      cls: 'warn',
      ic: Clock,
      t: 'Silences',
      regle: 'Opération en cours, aucun pointage depuis plus de 5 j',
      items: anomalies.silences.map((a) => ({
        of: a.numOf,
        detail: a.jours !== null ? `${a.jours} j` : a.article,
      })),
    },
    {
      kind: 'of_a_solder',
      cls: 'warn',
      ic: FileCheck2,
      t: 'OF à solder',
      regle: 'Gamme soldée sur MFGOPE, reste à produire non nul',
      items: ofsASolder.map((a) => ({
        of: a.numOf,
        detail: a.jours !== null ? `${a.jours} j` : a.article,
      })),
    },
    {
      kind: 'heures_faibles',
      cls: 'info',
      ic: Timer,
      t: 'Heures anormalement faibles',
      regle: 'Heures pointées < 50 % du temps de gamme pour la qté déclarée',
      items: heuresFaibles.map((a) => ({
        of: a.numOf,
        detail:
          a.heuresPointees !== null && a.heuresTheoriques !== null && a.heuresTheoriques > 0
            ? `${(a.heuresPointees / a.heuresTheoriques).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} × std`
            : a.article,
      })),
    },
    {
      kind: 'sans_heures',
      cls: 'info',
      ic: Square,
      t: 'Pointés sans heures',
      regle: 'Quantité déclarée, CPLOPETIM et CPLSETTIM à zéro',
      items: sansHeures.map((a) => ({
        of: a.numOf,
        detail: fmtQty(a.qtyDeclaree),
      })),
    },
    {
      kind: 'doublon_declaration',
      cls: 'info',
      ic: Copy,
      t: 'Déclarations en double',
      regle: 'Même OF, même opération, même jour, pointé N fois',
      items: anomalies.doublons.map((d) => ({
        of: d.numOf,
        detail: `×${d.nombre}`,
      })),
    },
  ]

  const total = familles.reduce((a, f) => a + f.items.length, 0)
  const crit = familles.filter((f) => f.cls === 'crit').reduce((a, f) => a + f.items.length, 0)

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold tracking-tight text-foreground">
          La dette du poste
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {total} OF concernés sur 7 familles · {crit} bloquant{crit > 1 ? 's' : ''}
          {props.usineLoading && ' · écarts et OF à solder en lecture…'}
        </span>
        <a
          href="/controle-prod"
          className="ml-auto text-[11px] font-semibold text-brand hover:underline"
        >
          Tout ouvrir sur /controle-prod →
        </a>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
        {familles.map((f) => {
          const FIcon = f.ic
          const zero = f.items.length === 0
          return (
            <div
              key={f.kind}
              className={cn(
                'flex flex-col gap-2 rounded-xl border p-3.5',
                zero
                  ? 'border-dashed border-rule bg-secondary shadow-none'
                  : 'border-rule bg-card shadow-float'
              )}
            >
              <div className="flex items-center gap-1.5">
                <FIcon
                  size={15}
                  strokeWidth={1.75}
                  className={cn(
                    'shrink-0',
                    zero ? 'text-muted-foreground/55' : f.cls === 'crit' && 'text-destructive',
                    !zero && f.cls === 'warn' && 'text-suggere',
                    !zero && f.cls === 'info' && 'text-planifie'
                  )}
                />
                <span className="text-[10px] font-bold leading-tight">{f.t}</span>
                <span
                  className={cn(
                    'ml-auto text-[22px] font-extrabold leading-none tracking-tight',
                    zero ? 'text-muted-foreground/55' : f.cls === 'crit' && 'text-destructive',
                    !zero && f.cls === 'warn' && 'text-suggere',
                    !zero && f.cls === 'info' && 'text-planifie'
                  )}
                >
                  {f.items.length}
                </span>
              </div>
              <span className="text-[9px] leading-snug text-muted-foreground">{f.regle}</span>
              {!zero && (
                <div className="flex flex-col gap-1">
                  {f.items.slice(0, 3).map((it) => (
                    <div
                      key={`${f.kind}-${it.of}`}
                      className="flex items-center gap-1.5 rounded-md border border-rule-soft bg-secondary px-2 py-1 text-[10px]"
                    >
                      <button
                        type="button"
                        className="cursor-pointer font-bold text-brand hover:underline"
                        onClick={() => onSelectOf(it.of)}
                      >
                        {it.of}
                      </button>
                      <X3Link
                        fonction="GESMFG"
                        cle={it.of}
                        iconOnly
                        title={`Ouvrir ${it.of} dans Sage X3`}
                      />
                      <span className="ml-auto text-[9px] font-bold text-muted-foreground">
                        {it.detail}
                      </span>
                    </div>
                  ))}
                  {f.items.length > 3 && (
                    <span className="cursor-pointer text-[9px] font-bold text-brand hover:underline">
                      + {f.items.length - 3} autres →
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
