import { useState, type JSX } from 'react'
import { Head } from '@inertiajs/react'
import { Button } from '@r/components/ui/button'
import { Badge } from '@r/components/ui/badge'
import { TextField, TextFieldInput, TextFieldLabel } from '@r/components/ui/text-field'
import { Separator } from '@r/components/ui/separator'
import { Calendar } from '@r/components/ui/calendar'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@r/components/ui/select'
import { Board } from '@r/components/board/papier-board'
import { BoardCard } from '@r/components/board/board-card'
import { ChargeForecast, type ForecastLine } from '@r/components/board/charge-forecast'
import { ClipboardCheck, Download, RefreshCw, Trash2, SlidersHorizontal, Check, Ban, Pencil, ArrowLeftRight } from 'lucide-react'
import { DynamicIcon } from '../components/ui/dynamic-icon'

/**
 * Design system « Papier » — showcase des VRAIS composants ui/* (shadcn/Base UI)
 * thémés via le scope .theme-papier (retargeting des tokens sémantiques dans
 * resources/css/app.css). Route : GET /design-system.
 *
 * Chaque section utilise un composant réel du projet ; les patterns app
 * (carte commande, rangée rupture, BOM) sont composés en utilities Tailwind
 * sous le scope Papier.
 */

const SURFACES = [
  { name: 'Paper', hex: '#f3ece0', tok: 'background', use: 'fond de l’app' },
  { name: 'Panel', hex: '#fbf8ef', tok: 'card', use: 'cartes, surfaces' },
  { name: 'Panel-2', hex: '#efe7d6', tok: 'secondary / muted', use: 'surfaces recces.' },
  { name: 'Rule', hex: '#cdbfa0', tok: 'border', use: 'bordure par défaut' },
]
const INKS = [
  { name: 'Ink', hex: '#1f1a13', tok: 'foreground', use: 'texte primaire' },
  { name: 'Ink-2', hex: '#4a4135', tok: 'secondary-foreground', use: 'texte secondaire' },
  { name: 'Muted', hex: '#8c7d66', tok: 'muted-foreground', use: 'texte atténué' },
]
const BRAND = [
  { name: 'Terra', hex: '#a8431f', tok: 'primary', use: 'accent primaire', cls: 'text-brand' },
  { name: 'Ferme', hex: '#5b7d4e', tok: 'ferme', use: 'statut ferme', cls: 'text-ferme' },
  {
    name: 'Planifié',
    hex: '#2f4858',
    tok: 'planifie',
    use: 'statut planifié',
    cls: 'text-planifie',
  },
  { name: 'Suggéré', hex: '#b8862c', tok: 'suggere', use: 'statut suggéré', cls: 'text-suggere' },
  {
    name: 'Danger',
    hex: '#9a3320',
    tok: 'destructive',
    use: 'sans couverture',
    cls: 'text-destructive',
  },
]

/* ── Palette Navy (exploration, palette officielle Aereco/Aldes) ── */
const SURFACES_NAVY = [
  { name: 'Light', hex: '#f0f0ed', tok: 'background', use: 'fond de l’app' },
  { name: 'Card', hex: '#ffffff', tok: 'card', use: 'cartes, surfaces' },
  { name: 'Muted', hex: '#e7e5de', tok: 'secondary / muted', use: 'surfaces recces.' },
  { name: 'Border', hex: '#d9d6cb', tok: 'border', use: 'bordure par défaut' },
]
const INKS_NAVY = [
  { name: 'Ink', hex: '#12142c', tok: 'foreground', use: 'texte primaire' },
  {
    name: 'Ink-2',
    hex: '#202d09',
    tok: 'secondary-foreground',
    use: 'texte secondaire (sur lime)',
  },
  { name: 'Gray', hex: '#6c757d', tok: 'muted-foreground', use: 'texte atténué' },
]
const BRAND_NAVY = [
  {
    name: 'Navy',
    hex: '#081061',
    tok: 'primary',
    use: 'accent primaire (marque)',
    cls: 'text-brand',
  },
  {
    name: 'Ferme',
    hex: '#28a745',
    tok: 'ferme',
    use: 'statut ferme (--success)',
    cls: 'text-ferme',
  },
  {
    name: 'Planifié',
    hex: '#17a2b8',
    tok: 'planifie',
    use: 'statut planifié (--info, réassigné)',
    cls: 'text-planifie',
  },
  {
    name: 'Suggéré',
    hex: '#ffc107',
    tok: 'suggere',
    use: 'statut suggéré (--warning)',
    cls: 'text-suggere',
  },
  { name: 'Lime', hex: '#b0d138', tok: 'secondary', use: 'CTA / actif — ponctuel', cls: '' },
  {
    name: 'Danger',
    hex: '#dc3545',
    tok: 'destructive',
    use: 'sans couverture (--danger)',
    cls: 'text-destructive',
  },
]

const NAV = [
  { id: 'couleurs', n: '01', label: 'Couleurs' },
  { id: 'typo', n: '02', label: 'Typographie' },
  { id: 'boutons', n: '03', label: 'Boutons' },
  { id: 'champs', n: '04', label: 'Champs' },
  { id: 'badges', n: '05', label: 'Badges & statuts' },
  { id: 'carte', n: '06', label: 'Carte board' },
  { id: 'rupture', n: '07', label: 'Rangée rupture' },
  { id: 'detail', n: '08', label: 'Panneau détail / BOM' },
  { id: 'etats', n: '09', label: 'États' },
  { id: 'calendrier', n: '10', label: 'Calendrier' },
  { id: 'board', n: '11', label: 'Board' },
  { id: 'charge', n: '12', label: 'Charge long-terme' },
]

const BOARD_DAYS: { short: string; num: string; today?: boolean; hours: number }[] = [
  { short: 'Lun', num: '16', hours: 28 },
  { short: 'Mar', num: '17', hours: 34, today: true },
  { short: 'Mer', num: '18', hours: 38 },
  { short: 'Jeu', num: '19', hours: 22 },
  { short: 'Ven', num: '20', hours: 30 },
  { short: 'Lun', num: '23', hours: 26 },
  { short: 'Mar', num: '24', hours: 32 },
  { short: 'Mer', num: '25', hours: 28 },
  { short: 'Jeu', num: '26', hours: 24 },
  { short: 'Ven', num: '27', hours: 24 },
]
const BOARD_WEEKS = [
  { label: 'Semaine 25 · 16–20 juin', span: 5 },
  { label: 'Semaine 26 · 23–27 juin', span: 5 },
]
const BOARD_LINES = [
  {
    code: 'DCP-01',
    name: 'Découpe Fan',
    tone: '#5b7d4e',
    weekLoads: [
      { week: 25, ferme: 20, planifie: 8, suggere: 4, induit: 0 },
      { week: 26, ferme: 14, planifie: 8, suggere: 6, induit: 0 },
    ],
  },
  {
    code: 'SDR-02',
    name: 'Soudure Robot',
    tone: '#2f4858',
    weekLoads: [
      { week: 25, ferme: 24, planifie: 10, suggere: 4, induit: 0 },
      { week: 26, ferme: 20, planifie: 12, suggere: 4, induit: 0 },
    ],
  },
  {
    code: 'PUD-03',
    name: 'Peinture Four',
    tone: '#b8862c',
    weekLoads: [
      { week: 25, ferme: 12, planifie: 10, suggere: 8, induit: 0 },
      { week: 26, ferme: 10, planifie: 8, suggere: 8, induit: 0 },
    ],
  },
  {
    code: 'ASV-04',
    name: 'Assemblage VMC',
    tone: '#8b5cf6',
    weekLoads: [
      { week: 25, ferme: 6, planifie: 4, suggere: 8, induit: 0 },
      { week: 26, ferme: 4, planifie: 4, suggere: 6, induit: 0 },
    ],
  },
  {
    code: 'CTL-05',
    name: 'Contrôlage Final',
    tone: '#8c7d66',
    weekLoads: [
      { week: 25, ferme: 18, planifie: 10, suggere: 6, induit: 0 },
      { week: 26, ferme: 14, planifie: 10, suggere: 6, induit: 0 },
    ],
  },
]
const FORECAST_MONTHS = ['Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']
// par ligne, par mois : [ferme, planifie, suggéré] (heures)
const FORECAST_LINES: ForecastLine[] = [
  {
    id: 'dcp',
    code: 'DCP-01',
    name: 'Découpe Fan',
    color: '#5b7d4e',
    months: [
      [90, 30, 20],
      [70, 25, 15],
      [100, 50, 25],
      [90, 60, 40],
      [70, 55, 35],
      [40, 45, 35],
    ],
  },
  {
    id: 'sdr',
    code: 'SDR-02',
    name: 'Soudure Robot',
    color: '#2f4858',
    months: [
      [100, 40, 25],
      [80, 30, 20],
      [110, 55, 35],
      [100, 70, 50],
      [80, 65, 40],
      [50, 50, 40],
    ],
  },
  {
    id: 'pud',
    code: 'PUD-03',
    name: 'Peinture Four',
    color: '#b8862c',
    months: [
      [80, 25, 15],
      [60, 20, 15],
      [85, 40, 25],
      [75, 50, 40],
      [60, 50, 30],
      [40, 40, 25],
    ],
  },
  {
    id: 'asv',
    code: 'ASV-04',
    name: 'Assemblage VMC',
    color: '#8b5cf6',
    months: [
      [60, 20, 10],
      [45, 15, 10],
      [70, 25, 15],
      [60, 35, 25],
      [45, 35, 20],
      [30, 30, 15],
    ],
  },
  {
    id: 'ctl',
    code: 'CTL-05',
    name: 'Contrôlage Final',
    color: '#8c7d66',
    months: [
      [85, 30, 15],
      [65, 25, 10],
      [95, 40, 25],
      [85, 55, 35],
      [65, 55, 30],
      [45, 45, 25],
    ],
  },
]

type ThemeName = 'papier' | 'navy'

export default function DesignSystem() {
  // Toggle Papier ↔ Navy — les DEUX scopes coexistent dans app.css (.theme-papier
  // n'est pas touché). Bascule purement client, aucun composant n'est dupliqué :
  // seule la classe racine change, tous les composants ui/* réagissent au scope.
  const [theme, setTheme] = useState<ThemeName>('papier')
  const [scope, setScope] = useState('poste')
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>({
    start: new Date(2026, 5, 16),
    end: new Date(2026, 5, 27),
  })
  const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  const rangeDays = (r: { start: Date | null; end: Date | null }) =>
    r.start && r.end ? Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000) + 1 : null
  const [flt, setFlt] = useState<string[]>(['MTS', 'MTO'])
  const toggleFlt = (t: string) =>
    setFlt((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  const [exclu, setExclu] = useState<'immediate' | 'sequential'>('immediate')

  return (
    <>
      <Head title="Design System" />
      <div className="theme-airbnb min-h-screen">
        <div className="mx-auto grid max-w-[1280px] grid-cols-[210px_1fr] gap-0">
          {/* ═══ TOC ═══ */}
          <aside className="sticky top-0 h-screen overflow-auto border-r border-rule-soft px-4 py-8 pl-8">
            <div className="font-fraunces text-[19px] font-black leading-none tracking-tight">
              Design <span className="italic font-medium text-brand">System</span>
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              {theme === 'navy' ? 'Navy · v0.1 (exploration)' : 'Papier · v1.0'}
            </div>
            {/* Toggle thème — les composants ui/* ci-dessous sont réels, seul le
                scope racine change. */}
            <div className="mt-4 inline-flex rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setTheme('papier')}
                className={`rounded-[5px] px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  theme === 'papier'
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Papier
              </button>
              <button
                type="button"
                onClick={() => setTheme('navy')}
                className={`rounded-[5px] px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  theme === 'navy'
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Navy
              </button>
            </div>
            <nav className="mt-6 flex flex-col gap-0.5">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span className="font-mono text-[9px] text-muted-foreground">{item.n}</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-8 rounded-md border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
              Composants <span className="font-mono text-foreground">ui/*</span> réels du projet, thémés
              via{' '}
              <span className="font-mono text-foreground">
                {theme === 'navy' ? '.theme-navy' : '.theme-papier'}
              </span>
              .
            </div>
          </aside>

          {/* ═══ Content ═══ */}
          <main className="min-w-0 px-12 pb-24 pt-10">
            {/* intro */}
            <div className="pb-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">
                Supply Chain Board
              </div>
              <h1 className="mt-2 font-fraunces text-[40px] font-black leading-none tracking-tight">
                Design System{' '}
                <span className="font-medium italic text-brand">
                  {theme === 'navy' ? 'Navy' : 'Papier'}
                </span>
              </h1>
              <p className="mt-3 max-w-[620px] text-[14.5px] leading-relaxed text-foreground/80">
                Les vrais composants du projet, thémés avec le nouveau design system. Chaque primitive
                ci-dessous est un{' '}
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">ui/*</code>{' '}
                réel — la couleur vient du scope{' '}
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">
                  {theme === 'navy' ? '.theme-navy' : '.theme-papier'}
                </code>
                {theme === 'navy' && (
                  <>
                    {' '}
                    · palette officielle Aereco/Aldes (exploration, cf.{' '}
                    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">
                      design/mockups/theme-aereco-navy.html
                    </code>
                    ).
                  </>
                )}
              </p>
            </div>

            {/* ═══ 01 Couleurs ═══ */}
            <Section id="couleurs" n="01" title="Couleurs">
              <SwatchGroup label="Surfaces" items={theme === 'navy' ? SURFACES_NAVY : SURFACES} />
              <SwatchGroup label="Encre" items={theme === 'navy' ? INKS_NAVY : INKS} />
              <SwatchGroup label="Brand & statuts" items={theme === 'navy' ? BRAND_NAVY : BRAND} />
            </Section>

            {/* ═══ 02 Typographie ═══ */}
            <Section id="typo" n="02" title="Typographie">
              <div className="rounded-lg border border-border bg-card p-6">
                <TypeRow spec="Display XL · Fraunces 900 / 52">
                  <span className="font-fraunces text-[52px] font-black leading-none tracking-tight">
                    Planification
                  </span>
                </TypeRow>
                <TypeRow spec="Display · Fraunces 900 / 34">
                  <span className="font-fraunces text-[34px] font-black tracking-tight">Semaine 25</span>
                </TypeRow>
                <TypeRow spec="H1 · Fraunces 700 / 26">
                  <span className="font-fraunces text-[26px] font-bold tracking-tight">
                    Registre des ruptures
                  </span>
                </TypeRow>
                <TypeRow spec="H3 · Inter 600 / 15">
                  <span className="text-[15px] font-semibold">Nomenclature composants</span>
                </TypeRow>
                <TypeRow spec="Body · Inter 400 / 14">
                  <span className="text-[14px]">
                    Sur la fenêtre du 16 au 27 juin, huit lignes sont freinées par des ruptures.
                  </span>
                </TypeRow>
                <TypeRow spec="Overline · Mono 700 / 10">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    Charge globale
                  </span>
                </TypeRow>
                <TypeRow spec="Data · Mono 600 / 14 tabular" last>
                  <span className="font-mono text-[14px] font-semibold">
                    AR24518 · L2 · 6,0 h · 120 u
                  </span>
                </TypeRow>
              </div>
            </Section>

            {/* ═══ 03 Boutons (vrais) ═══ */}
            <Section id="boutons" n="03" title="Boutons">
              <Frame>
                <FieldLabel>
                  Variantes — composant <code className="font-mono">Button</code> réel
                </FieldLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <Button>
                    <ClipboardCheck size={17} />Faisabilité
                  </Button>
                  <Button variant="secondary">
                    <Download size={17} />Exporter
                  </Button>
                  <Button variant="outline">Annuler</Button>
                  <Button variant="ghost">
                    <RefreshCw size={17} />X3
                  </Button>
                  <Button variant="destructive">
                    <Trash2 size={17} />Supprimer
                  </Button>
                  <Button variant="link">Détail</Button>
                </div>

                <FieldLabel className="mt-6">Tailles</FieldLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Petit</Button>
                  <Button>Moyen</Button>
                  <Button size="lg">Grand</Button>
                  <Button size="icon" variant="secondary">
                    <SlidersHorizontal size={18} />
                  </Button>
                  <Button size="icon-sm" variant="secondary">
                    <RefreshCw size={16} />
                  </Button>
                </div>

                <FieldLabel className="mt-6">États</FieldLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <Button>Repos</Button>
                  <Button disabled>Désactivé</Button>
                </div>
              </Frame>
            </Section>

            {/* ═══ 04 Champs (vrais) ═══ */}
            <Section id="champs" n="04" title="Champs & entrées">
              <Frame>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <FieldLabel>TextField</FieldLabel>
                    <TextField value="" onChange={() => {}}>
                      <TextFieldLabel>Désignation</TextFieldLabel>
                      <TextFieldInput placeholder="Caisse VMC D250" />
                    </TextField>
                  </div>
                  <div>
                    <FieldLabel>Select</FieldLabel>
                    <Select value={scope} onValueChange={(v) => v && setScope(v)}>
                      <SelectTrigger className="w-full" aria-label="Portée">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['poste', 'commande', 'article', 'client'].map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Choix exclusif — segment raffiné</FieldLabel>
                    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
                      <button
                        type="button"
                        onClick={() => setExclu('immediate')}
                        className={`rounded-[5px] px-3 py-1 text-[12px] font-bold transition-colors ${
                          exclu === 'immediate'
                            ? 'bg-brand-soft text-brand'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Instantanée
                      </button>
                      <button
                        type="button"
                        onClick={() => setExclu('sequential')}
                        className={`rounded-[5px] px-3 py-1 text-[12px] font-medium transition-colors ${
                          exclu === 'sequential'
                            ? 'bg-brand-soft text-brand'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Projetée
                      </button>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Filtres type (toggle)</FieldLabel>
                    <div className="flex items-center gap-1.5">
                      {(['MTS', 'MTO', 'NOR'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                            flt.includes(t)
                              ? 'border-brand/40 bg-brand-soft text-brand'
                              : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          }`}
                          onClick={() => toggleFlt(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <FieldLabel>Separator</FieldLabel>
                  <Separator className="my-2" />
                  <span className="text-[12px] text-muted-foreground">filet plein largeur</span>
                </div>
              </Frame>
            </Section>

            {/* ═══ 05 Badges (vrais) ═══ */}
            <Section id="badges" n="05" title="Badges & statuts">
              <Frame>
                <FieldLabel>
                  Badge — composant <code className="font-mono">Badge</code> réel (variantes)
                </FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">
                    <Check size={13} />Ferme
                  </Badge>
                  <Badge variant="secondary">Planifié</Badge>
                  <Badge variant="warning">Suggéré</Badge>
                  <Badge variant="destructive">
                    <Ban size={13} />Sans couverture
                  </Badge>
                  <Badge variant="outline">Brouillon</Badge>
                  <Badge variant="default">Default / primary</Badge>
                </div>

                <FieldLabel className="mt-6">
                  Verdicts — petites capitales + point (sans boîte)
                </FieldLabel>
                <div className="flex flex-wrap items-center gap-5">
                  <Verdot className="text-ferme">Couvert J−4</Verdot>
                  <Verdot className="text-suggere">Retard +3 j</Verdot>
                  <Verdot className="text-destructive">Sans couverture</Verdot>
                </div>

                <FieldLabel className="mt-6">Type · override · faisabilité</FieldLabel>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand">
                    MTS
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-suggere">
                    <Pencil size={12} />Modifié
                  </span>
                  <span className="flex size-4 items-center justify-center rounded-full bg-ferme text-[10px] font-bold text-card">
                    ✓
                  </span>
                  <span className="flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-card">
                    !
                  </span>
                </div>
              </Frame>
            </Section>

            {/* ═══ 06 Carte board (unifiée) ═══ */}
            <Section id="carte" n="06" title="Carte board (unifiée)">
              <div className="rounded-lg border border-border bg-secondary/40 p-6">
                <FieldLabel>Variante commande — board planification</FieldLabel>
                <div className="grid grid-cols-[repeat(auto-fill,176px)] gap-4">
                  <BoardCard
                    variant="commande"
                    status="ferme"
                    article="XTR107842"
                    ord="AR24518·L2"
                    title="Caisse D250"
                    client="AXION GUEVIN"
                    type="MTS"
                    hours="6,0"
                  />
                  <BoardCard
                    variant="commande"
                    status="planifie"
                    article="XTR108120"
                    ord="AR24601·L1"
                    title="Caisse D350"
                    client="CDC Habitat"
                    type="MTO"
                    hours="7,5"
                  />
                  <BoardCard
                    variant="commande"
                    status="planifie"
                    mod
                    feas="ok"
                    article="VMC-310"
                    ord="AR24610·L2"
                    title="Caisson isolé"
                    client="Bouygues"
                    type="MTO"
                    hours="5,5"
                  />
                  <BoardCard
                    variant="commande"
                    status="suggere"
                    mod
                    feas="bad"
                    article="XTR106540"
                    ord="AR24490·L4"
                    title="Caisse D200"
                    client="Bouygues"
                    type="MTS"
                    hours="3,0"
                  />
                </div>
                <FieldLabel className="mt-6">
                  Variante OF — board ordonnancement (statuts ferme → bloqué)
                </FieldLabel>
                <div className="grid grid-cols-[repeat(auto-fill,176px)] gap-4">
                  <BoardCard
                    variant="of"
                    status="ferme"
                    feas="ok"
                    article="OF100245"
                    title="Caisse D250"
                    poste="DCP-01"
                    progress={{ done: 120, total: 150 }}
                    hours="6,0"
                  />
                  <BoardCard
                    variant="of"
                    status="planifie"
                    article="OF100288"
                    title="Double flux"
                    poste="SDR-02"
                    progress={{ done: 0, total: 120 }}
                    hours="8,5"
                  />
                  <BoardCard
                    variant="of"
                    status="suggere"
                    article="OF100312"
                    title="Caisse D200"
                    poste="PUD-03"
                    progress={{ done: 0, total: 90 }}
                    hours="4,0"
                  />
                  <BoardCard
                    variant="of"
                    status="cours"
                    article="OF100198"
                    title="Caisson isolé"
                    poste="ASV-04"
                    progress={{ done: 95, total: 100 }}
                    hours="5,5"
                  />
                  <BoardCard
                    variant="of"
                    status="termine"
                    article="OF100156"
                    title="Échangeur D350"
                    poste="CTL-05"
                    progress={{ done: 60, total: 60 }}
                    hours="3,0"
                  />
                  <BoardCard
                    variant="of"
                    status="bloque"
                    feas="bad"
                    article="OF100301"
                    title="Caisse D200"
                    poste="DCP-01"
                    progress={{ done: 0, total: 120 }}
                    alert="Rupture MOT-33012"
                    hours="6,0"
                  />
                </div>
              </div>
            </Section>

            {/* ═══ 07 Rangée rupture ═══ */}
            <Section id="rupture" n="07" title="Rangée rupture">
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="grid grid-cols-[28px_1.6fr_70px_1.3fr_90px_1.5fr_120px] gap-4 border-b border-border bg-secondary px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>№</span>
                  <span>Composant</span>
                  <span className="text-right">Manq.</span>
                  <span>OF bloqué</span>
                  <span>Commande</span>
                  <span>Réception</span>
                  <span className="text-right">Verdict</span>
                </div>
                <RuptureRow
                  rk="02"
                  comp="MOT-33012"
                  desc="Moteur VMC D250 220V"
                  qty="42"
                  of="OF100245"
                  art="XTR106540 · Caisse D200"
                  cmd="AR24490"
                  cli="Bouygues"
                  recId="BC-55821"
                  recMeta="Mécapro · 60 u"
                  verdict="warn"
                  vlabel="Retard +3 j"
                />
                <RuptureRow
                  rk="03"
                  comp="ECP-55821"
                  desc="Échangeur aluminium D350"
                  qty="25"
                  of="OF100288"
                  art="VMC-220 · Double flux"
                  cmd="AR24588"
                  cli="AXION GUEVIN"
                  none
                  verdict="bad"
                  vlabel="Sans couverture"
                />
              </div>
            </Section>

            {/* ═══ 08 Panneau détail / BOM ═══ */}
            <Section id="detail" n="08" title="Panneau de détail (D3 · bas)">
              <div className="overflow-hidden rounded-lg border-2 border-foreground bg-card shadow-md">
                <div className="flex items-center gap-3 border-b border-border bg-secondary px-4 py-2.5">
                  <span className="font-fraunces text-[16px] font-bold">AR24490 · L4</span>
                  <span className="font-mono text-[12px] font-bold text-brand">XTR106540</span>
                  <span className="font-fraunces text-[12px] italic text-muted-foreground">
                    Caisse VMC D200
                  </span>
                  <Badge variant="destructive" className="ml-1">
                    <Ban size={13} />Bloquée ·
                    MOT-33012 −42
                  </Badge>
                  <span className="flex-1" />
                  <Button size="sm">
                    <ArrowLeftRight size={15} />Replanifier
                  </Button>
                </div>
                <div className="flex items-center gap-0 border-b border-rule-soft bg-card px-4">
                  <Meta k="Client" v="Bouygues" />
                  <Meta k="Quantité" v="120 u" mono />
                  <Meta k="Livraison" v="24 juin" mono />
                  <Meta k="Poste" v="DCP-01" />
                  <Meta k="Charge" v="3,0 h" mono last />
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-secondary font-mono text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 text-left">Article</th>
                      <th className="px-4 py-2 text-left">Désignation</th>
                      <th className="px-4 py-2 text-right">Besoin</th>
                      <th className="px-4 py-2 text-right">Dispo</th>
                      <th className="px-4 py-2 text-right">État</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[12px]">
                    <tr className="bg-destructive/5">
                      <td className="px-4 py-2 font-bold">MOT-33012</td>
                      <td className="px-4 py-2 font-sans font-normal text-foreground/80">
                        Moteur VMC D250 220V
                      </td>
                      <td className="px-4 py-2 text-right">120</td>
                      <td className="px-4 py-2 text-right">78</td>
                      <td className="px-4 py-2 text-right font-bold text-destructive">−42</td>
                    </tr>
                    <tr className="border-t border-rule-soft">
                      <td className="px-4 py-2 font-bold">TPS-55120</td>
                      <td className="px-4 py-2 font-sans font-normal text-foreground/80">
                        Support caisson
                      </td>
                      <td className="px-4 py-2 text-right">120</td>
                      <td className="px-4 py-2 text-right">120</td>
                      <td className="px-4 py-2 text-right font-bold text-ferme">✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>

            {/* ═══ 09 États ═══ */}
            <Section id="etats" n="09" title="États">
              <div className="grid grid-cols-3 gap-4">
                <StatePane
                  tone="ferme"
                  icon="check_circle"
                  title="Aucune rupture"
                  sub="Rien à signaler dans la fenêtre."
                />
                <StatePane tone="muted" spin title="Calcul…" sub="Analyse des besoins X3." />
                <StatePane
                  tone="destructive"
                  icon="cloud_off"
                  title="X3 injoignable"
                  sub="Données du cache (14:30)."
                />
              </div>
            </Section>

            {/* ═══ 10 Calendrier ═══ */}
            <Section id="calendrier" n="10" title="Calendrier">
              <div className="flex items-start gap-8">
                <Calendar
                  mode="range"
                  selected={range.start && range.end ? { from: range.start, to: range.end } : undefined}
                  onSelect={(r) =>
                    setRange({ start: r?.from ?? null, end: r?.to ?? null })
                  }
                  disabled={{ after: new Date() }}
                  numberOfMonths={1}
                />
                <div className="pt-1">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Plage sélectionnée
                  </div>
                  <div className="mt-1 font-fraunces text-[22px] font-bold tracking-tight">
                    {range.start ? fmtDate(range.start) : '—'}{' '}
                    <span className="text-muted-foreground">→</span>{' '}
                    {range.end ? fmtDate(range.end) : '…'}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {rangeDays(range)
                      ? `${rangeDays(range)} jours`
                      : 'Cliquez une seconde date pour fermer la plage'}
                  </div>
                  <p className="mt-4 max-w-[240px] text-[13px] leading-relaxed text-foreground/70">
                    Mode plage : 1er clic = début, survol = aperçu, 2e clic = fin (ordre auto). Barre
                    brand-soft continue entre les bornes, qui sont remplies terra. Existe aussi en
                    mode date unique (<code className="font-mono">mode="single"</code>).
                  </p>
                </div>
              </div>
            </Section>

            {/* ═══ 11 Board (vide) ═══ */}
            <Section id="board" n="11" title="Board (vide)">
              <Board days={BOARD_DAYS} weeks={BOARD_WEEKS} lines={BOARD_LINES} />
              <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-foreground/70">
                Coquille du board Papier : semaines à l'horizontale, une rangée par poste, cellules
                vides sur fond quadrillé — prêtes à recevoir les cartes commande.
              </p>
            </Section>

            {/* ═══ 12 Charge long-terme ═══ */}
            <Section id="charge" n="12" title="Charge long-terme" last>
              Projection de charge sur 6 mois : barres empilées Ferme / Planifié / Suggéré, seul le
              sommet réel de la pile est arrondi (le segment Suggéré en base reste net). Sélecteur de
              ligne + granularité mois/semaine, moyenne mobile terra et pic repérés.
              <div className="mt-5">
                <ChargeForecast lines={FORECAST_LINES} monthLabels={FORECAST_MONTHS} />
              </div>
            </Section>

            <div className="mt-12 flex justify-between border-t border-rule-soft pt-5 font-fraunces text-[12px] italic text-muted-foreground">
              <span>
                Design System {theme === 'navy' ? 'Navy' : 'Papier'} · composants réels{' '}
                <code className="font-mono not-italic">inertia-react/components/ui/*</code>
              </span>
              <span>{theme === 'navy' ? 'v0.1' : 'v1.0'} · /design-system</span>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

/* ── helpers ── */
function Section({
  id,
  n,
  title,
  last,
  children,
}: {
  id: string
  n: string
  title: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-6 ${last ? '' : 'border-t border-rule-soft'} py-9`}
    >
      <div className="mb-2 flex items-baseline gap-3">
        <span className="rounded-md bg-brand-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-brand">
          {n}
        </span>
        <h2 className="font-fraunces text-[24px] font-bold tracking-tight">{title}</h2>
      </div>
      <div className="mb-5 max-w-[680px] text-[13.5px] leading-relaxed text-foreground/70">
        {children}
      </div>
    </section>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      {children}
    </div>
  )
}

function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground ${className ?? ''}`}
    >
      {children}
    </span>
  )
}

function TypeRow({
  spec,
  last,
  children,
}: {
  spec: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex items-baseline gap-5 py-3 ${last ? '' : 'border-b border-rule-soft'}`}>
      <div className="w-56 shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {spec}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SwatchGroup({
  label,
  items,
}: {
  label: string
  items: { name: string; hex: string; tok: string; use: string }[]
}) {
  return (
    <>
      <div className="mb-2 mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground first:mt-0">
        {label}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {items.map((s) => (
          <div key={s.name} className="overflow-hidden rounded-lg border border-rule-soft bg-card">
            <div className="h-16" style={{ background: s.hex }} />
            <div className="px-3 py-2">
              <div className="font-mono text-[11px] font-semibold">{s.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{s.hex}</div>
              <div className="font-fraunces text-[10px] italic text-muted-foreground/80">{s.use}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function Verdot({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${className ?? ''}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

function RuptureRow(props: {
  rk: string
  comp: string
  desc: string
  qty: string
  of: string
  art: string
  cmd: string
  cli: string
  recId?: string
  recMeta?: string
  none?: boolean
  verdict: 'ok' | 'warn' | 'bad'
  vlabel: string
}) {
  const vcls = { ok: 'text-ferme', warn: 'text-suggere', bad: 'text-destructive' }[props.verdict]
  return (
    <div className="grid grid-cols-[28px_1.6fr_70px_1.3fr_90px_1.5fr_120px] items-center gap-4 border-t border-rule-soft px-4 py-3 transition-colors hover:bg-brand-soft">
      <span className="font-fraunces text-[13px] text-muted-foreground/70">{props.rk}</span>
      <div>
        <div className="font-mono text-[14px] font-semibold">{props.comp}</div>
        <div className="font-fraunces text-[12px] italic text-muted-foreground">{props.desc}</div>
      </div>
      <div className="text-right font-fraunces text-[22px] font-bold text-destructive tabular-nums">
        {props.qty}
      </div>
      <div>
        <span className="cursor-pointer font-mono text-[13px] font-semibold text-brand hover:underline">
          {props.of}
        </span>
        <div className="font-fraunces text-[11px] italic text-muted-foreground">{props.art}</div>
      </div>
      <div>
        <div className="font-mono text-[13px] font-semibold">{props.cmd}</div>
        <div className="font-fraunces text-[12px] italic text-muted-foreground">{props.cli}</div>
      </div>
      <div>
        {props.none ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-destructive">
            <Ban size={13} />Aucune couverture
          </span>
        ) : (
          <>
            <div className="font-mono text-[12px] font-semibold">{props.recId}</div>
            <div className="font-fraunces text-[11px] italic text-muted-foreground">
              {props.recMeta}
            </div>
          </>
        )}
      </div>
      <span
        className={`justify-self-end inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${vcls}`}
      >
        <span className="size-1.5 rounded-full bg-current" />
        {props.vlabel}
      </span>
    </div>
  )
}

function Meta(props: { k: string; v: string; mono?: boolean; last?: boolean }) {
  return (
    <div className={`flex flex-col py-2 ${props.last ? '' : 'mr-4 border-r border-rule-soft pr-4'}`}>
      <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
        {props.k}
      </span>
      <span className={`font-fraunces text-[13px] font-bold ${props.mono ? 'font-mono' : ''}`}>
        {props.v}
      </span>
    </div>
  )
}

function StatePane(props: {
  tone: string
  icon?: string
  spin?: boolean
  title: string
  sub: string
}) {
  const toneCls: Record<string, string> = {
    ferme: 'bg-ferme/15 text-ferme',
    destructive: 'bg-destructive/10 text-destructive',
    muted: 'bg-secondary text-muted-foreground',
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-5 py-9 text-center">
      {props.spin ? (
        <div className="size-7 animate-spin rounded-full border-[3px] border-border border-t-brand" />
      ) : (
        <div className={`flex size-11 items-center justify-center rounded-full ${toneCls[props.tone]}`}>
          <DynamicIcon name={props.icon} size={26} />
        </div>
      )}
      <div className="font-fraunces text-[15px] font-bold">{props.title}</div>
      <div className="font-fraunces text-[13px] italic text-muted-foreground">{props.sub}</div>
    </div>
  )
}
