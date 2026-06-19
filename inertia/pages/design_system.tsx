import { createSignal, For, type Component } from 'solid-js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import { Board } from '@/components/board/papier-board'
import { BoardCard } from '@/components/board/board-card'
import { ChargeForecast, type ForecastLine } from '@/components/board/charge-forecast'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

/**
 * Design system « Papier » — showcase des VRAIS composants ui/* (shadcn-solid)
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
  { name: 'Terra', hex: '#a8431f', tok: 'primary', use: 'accent primaire', cls: 'text-terra' },
  { name: 'Ferme', hex: '#5b7d4e', tok: 'ferme', use: 'statut ferme', cls: 'text-ferme' },
  { name: 'Planifié', hex: '#2f4858', tok: 'planifie', use: 'statut planifié', cls: 'text-planifie' },
  { name: 'Suggéré', hex: '#b8862c', tok: 'suggere', use: 'statut suggéré', cls: 'text-suggere' },
  { name: 'Danger', hex: '#9a3320', tok: 'destructive', use: 'sans couverture', cls: 'text-destructive' },
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
  { code: 'DCP-01', name: 'Découpe Fan', tone: '#5b7d4e', weekLoads: [{ week: 25, ferme: 20, planifie: 8, suggere: 4 }, { week: 26, ferme: 14, planifie: 8, suggere: 6 }] },
  { code: 'SDR-02', name: 'Soudure Robot', tone: '#2f4858', weekLoads: [{ week: 25, ferme: 24, planifie: 10, suggere: 4 }, { week: 26, ferme: 20, planifie: 12, suggere: 4 }] },
  { code: 'PUD-03', name: 'Peinture Four', tone: '#b8862c', weekLoads: [{ week: 25, ferme: 12, planifie: 10, suggere: 8 }, { week: 26, ferme: 10, planifie: 8, suggere: 8 }] },
  { code: 'ASV-04', name: 'Assemblage VMC', tone: '#8b5cf6', weekLoads: [{ week: 25, ferme: 6, planifie: 4, suggere: 8 }, { week: 26, ferme: 4, planifie: 4, suggere: 6 }] },
  { code: 'CTL-05', name: 'Contrôlage Final', tone: '#8c7d66', weekLoads: [{ week: 25, ferme: 18, planifie: 10, suggere: 6 }, { week: 26, ferme: 14, planifie: 10, suggere: 6 }] },
]
const FORECAST_MONTHS = ['Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']
// par ligne, par mois : [ferme, planifie, suggéré] (heures)
const FORECAST_LINES: ForecastLine[] = [
  { id: 'dcp', code: 'DCP-01', name: 'Découpe Fan', color: '#5b7d4e', months: [[90, 30, 20], [70, 25, 15], [100, 50, 25], [90, 60, 40], [70, 55, 35], [40, 45, 35]] },
  { id: 'sdr', code: 'SDR-02', name: 'Soudure Robot', color: '#2f4858', months: [[100, 40, 25], [80, 30, 20], [110, 55, 35], [100, 70, 50], [80, 65, 40], [50, 50, 40]] },
  { id: 'pud', code: 'PUD-03', name: 'Peinture Four', color: '#b8862c', months: [[80, 25, 15], [60, 20, 15], [85, 40, 25], [75, 50, 40], [60, 50, 30], [40, 40, 25]] },
  { id: 'asv', code: 'ASV-04', name: 'Assemblage VMC', color: '#8b5cf6', months: [[60, 20, 10], [45, 15, 10], [70, 25, 15], [60, 35, 25], [45, 35, 20], [30, 30, 15]] },
  { id: 'ctl', code: 'CTL-05', name: 'Contrôlage Final', color: '#8c7d66', months: [[85, 30, 15], [65, 25, 10], [95, 40, 25], [85, 55, 35], [65, 55, 30], [45, 45, 25]] },
]

const DesignSystem: Component = () => {
  const [scope, setScope] = createSignal('poste')
  const [range, setRange] = createSignal<{ start: Date | null; end: Date | null }>({
    start: new Date(2026, 5, 16),
    end: new Date(2026, 5, 27),
  })
  const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  const rangeDays = (r: { start: Date | null; end: Date | null }) =>
    r.start && r.end ? Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000) + 1 : null
  const [flt, setFlt] = createSignal<string[]>(['MTS', 'MTO'])
  const toggleFlt = (t: string) =>
    setFlt((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  const [exclu, setExclu] = createSignal<'immediate' | 'sequential'>('immediate')

  return (
    <div class="theme-papier min-h-screen">
      <div class="mx-auto grid max-w-[1280px] grid-cols-[210px_1fr] gap-0">
        {/* ═══ TOC ═══ */}
        <aside class="sticky top-0 h-screen overflow-auto border-r border-rule-soft px-4 py-8 pl-8">
          <div class="font-fraunces text-[19px] font-black leading-none tracking-tight">
            Design <span class="italic font-medium text-terra">System</span>
          </div>
          <div class="mt-1 font-mono text-[10px] text-muted-foreground">Papier · v1.0</div>
          <nav class="mt-6 flex flex-col gap-0.5">
            <For each={NAV}>
              {(item) => (
                <a
                  href={`#${item.id}`}
                  class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span class="font-mono text-[9px] text-muted-foreground">{item.n}</span>
                  {item.label}
                </a>
              )}
            </For>
          </nav>
          <div class="mt-8 rounded-md border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
            Composants <span class="font-mono text-foreground">ui/*</span> réels du projet, thémés via{' '}
            <span class="font-mono text-foreground">.theme-papier</span>.
          </div>
        </aside>

        {/* ═══ Content ═══ */}
        <main class="min-w-0 px-12 pb-24 pt-10">
          {/* intro */}
          <div class="pb-4">
            <div class="font-mono text-[11px] uppercase tracking-[0.18em] text-terra">
              Supply Chain Board
            </div>
            <h1 class="mt-2 font-fraunces text-[40px] font-black leading-none tracking-tight">
              Design System <span class="font-medium italic text-terra">Papier</span>
            </h1>
            <p class="mt-3 max-w-[620px] text-[14.5px] leading-relaxed text-foreground/80">
              Les vrais composants du projet, thémés avec le nouveau design system. Chaque primitive
              ci-dessous est un <code class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">ui/*</code>{' '}
              réel — la couleur vient du scope{' '}
              <code class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">.theme-papier</code>.
            </p>
          </div>

          {/* ═══ 01 Couleurs ═══ */}
          <Section id="couleurs" n="01" title="Couleurs">
            <SwatchGroup label="Surfaces" items={SURFACES} />
            <SwatchGroup label="Encre" items={INKS} />
            <SwatchGroup label="Brand & statuts" items={BRAND} />
          </Section>

          {/* ═══ 02 Typographie ═══ */}
          <Section id="typo" n="02" title="Typographie">
            <div class="rounded-xl border border-border bg-card p-6">
              <TypeRow spec="Display XL · Fraunces 900 / 52">
                <span class="font-fraunces text-[52px] font-black leading-none tracking-tight">
                  Planification
                </span>
              </TypeRow>
              <TypeRow spec="Display · Fraunces 900 / 34">
                <span class="font-fraunces text-[34px] font-black tracking-tight">Semaine 25</span>
              </TypeRow>
              <TypeRow spec="H1 · Fraunces 700 / 26">
                <span class="font-fraunces text-[26px] font-bold tracking-tight">
                  Registre des ruptures
                </span>
              </TypeRow>
              <TypeRow spec="H3 · Inter 600 / 15">
                <span class="text-[15px] font-semibold">Nomenclature composants</span>
              </TypeRow>
              <TypeRow spec="Body · Inter 400 / 14">
                <span class="text-[14px]">
                  Sur la fenêtre du 16 au 27 juin, huit lignes sont freinées par des ruptures.
                </span>
              </TypeRow>
              <TypeRow spec="Overline · Mono 700 / 10">
                <span class="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Charge globale
                </span>
              </TypeRow>
              <TypeRow spec="Data · Mono 600 / 14 tabular" last>
                <span class="font-mono text-[14px] font-semibold">AR24518 · L2 · 6,0 h · 120 u</span>
              </TypeRow>
            </div>
          </Section>

          {/* ═══ 03 Boutons (vrais) ═══ */}
          <Section id="boutons" n="03" title="Boutons">
            <Frame>
              <FieldLabel>Variantes — composant <code class="font-mono">Button</code> réel</FieldLabel>
              <div class="flex flex-wrap items-center gap-3">
                <Button>
                  <span class="material-symbols-outlined text-[17px]">fact_check</span>Faisabilité
                </Button>
                <Button variant="secondary">
                  <span class="material-symbols-outlined text-[17px]">download</span>Exporter
                </Button>
                <Button variant="outline">Annuler</Button>
                <Button variant="ghost">
                  <span class="material-symbols-outlined text-[17px]">refresh</span>X3
                </Button>
                <Button variant="destructive">
                  <span class="material-symbols-outlined text-[17px]">delete</span>Supprimer
                </Button>
                <Button variant="link">Détail</Button>
              </div>

              <FieldLabel class="mt-6">Tailles</FieldLabel>
              <div class="flex flex-wrap items-center gap-3">
                <Button size="sm">Petit</Button>
                <Button>Moyen</Button>
                <Button size="lg">Grand</Button>
                <Button size="icon" variant="secondary">
                  <span class="material-symbols-outlined text-[18px]">tune</span>
                </Button>
                <Button size="icon-sm" variant="secondary">
                  <span class="material-symbols-outlined text-[16px]">refresh</span>
                </Button>
              </div>

              <FieldLabel class="mt-6">États</FieldLabel>
              <div class="flex flex-wrap items-center gap-3">
                <Button>Repos</Button>
                <Button disabled>Désactivé</Button>
              </div>
            </Frame>
          </Section>

          {/* ═══ 04 Champs (vrais) ═══ */}
          <Section id="champs" n="04" title="Champs & entrées">
            <Frame>
              <div class="grid grid-cols-2 gap-5">
                <div>
                  <FieldLabel>TextField</FieldLabel>
                  <TextField>
                    <TextFieldLabel>Désignation</TextFieldLabel>
                    <TextFieldInput placeholder="Caisse VMC D250" />
                  </TextField>
                </div>
                <div>
                  <FieldLabel>Select</FieldLabel>
                  <Select<string>
                    value={scope()}
                    onChange={(v) => v && setScope(v)}
                    options={['poste', 'commande', 'article', 'client']}
                    disallowEmptySelection
                    optionTextValue={(o) => o}
                    itemComponent={(itemProps) => (
                      <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
                    )}
                  >
                    <SelectTrigger class="w-full" aria-label="Portée">
                      <SelectValue<string>>
                        {(state) => state.selectedOption()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>
                <div>
                  <FieldLabel>Choix exclusif — segment raffiné</FieldLabel>
                  <div class="inline-flex rounded-md border border-border bg-card p-0.5">
                    <button
                      type="button"
                      onClick={() => setExclu('immediate')}
                      class={`rounded-[5px] px-3 py-1 text-[12px] font-bold transition-colors ${
                        exclu() === 'immediate'
                          ? 'bg-terra-soft text-terra'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Instantanée
                    </button>
                    <button
                      type="button"
                      onClick={() => setExclu('sequential')}
                      class={`rounded-[5px] px-3 py-1 text-[12px] font-medium transition-colors ${
                        exclu() === 'sequential'
                          ? 'bg-terra-soft text-terra'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Projetée
                    </button>
                  </div>
                </div>
                <div>
                  <FieldLabel>Filtres type (toggle)</FieldLabel>
                  <div class="flex items-center gap-1.5">
                    <For each={['MTS', 'MTO', 'NOR']}>
                      {(t) => (
                        <button
                          type="button"
                          class={`rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                            flt().includes(t)
                              ? 'border-terra/40 bg-terra-soft text-terra'
                              : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          }`}
                          onClick={() => toggleFlt(t)}
                        >
                          {t}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </div>
              <div class="mt-5">
                <FieldLabel>Separator</FieldLabel>
                <Separator class="my-2" />
                <span class="text-[12px] text-muted-foreground">filet plein largeur</span>
              </div>
            </Frame>
          </Section>

          {/* ═══ 05 Badges (vrais) ═══ */}
          <Section id="badges" n="05" title="Badges & statuts">
            <Frame>
              <FieldLabel>
                Badge — composant <code class="font-mono">Badge</code> réel (variantes)
              </FieldLabel>
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  <span class="material-symbols-outlined text-[13px]">check</span>Ferme
                </Badge>
                <Badge variant="secondary">Planifié</Badge>
                <Badge variant="warning">Suggéré</Badge>
                <Badge variant="destructive">
                  <span class="material-symbols-outlined text-[13px]">block</span>Sans couverture
                </Badge>
                <Badge variant="outline">Brouillon</Badge>
                <Badge variant="default">Default / primary</Badge>
              </div>

              <FieldLabel class="mt-6">Verdicts — petites capitales + point (sans boîte)</FieldLabel>
              <div class="flex flex-wrap items-center gap-5">
                <Verdot class="text-ferme">Couvert J−4</Verdot>
                <Verdot class="text-suggere">Retard +3 j</Verdot>
                <Verdot class="text-destructive">Sans couverture</Verdot>
              </div>

              <FieldLabel class="mt-6">Type · override · faisabilité</FieldLabel>
              <div class="flex flex-wrap items-center gap-4">
                <span class="rounded bg-terra-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-terra">
                  MTS
                </span>
                <span class="inline-flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-suggere">
                  <span class="material-symbols-outlined text-[12px]">edit</span>Modifié
                </span>
                <span class="flex size-4 items-center justify-center rounded-full bg-ferme text-[10px] font-bold text-card">
                  ✓
                </span>
                <span class="flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-card">
                  !
                </span>
              </div>
            </Frame>
          </Section>

          {/* ═══ 06 Carte board (unifiée) ═══ */}
          <Section id="carte" n="06" title="Carte board (unifiée)">
            <div class="rounded-xl border border-border bg-secondary/40 p-6">
              <FieldLabel>Variante commande — board planification</FieldLabel>
              <div class="grid grid-cols-[repeat(auto-fill,176px)] gap-4">
                <BoardCard variant="commande" status="ferme" article="XTR107842" ord="AR24518·L2" title="Caisse D250" client="AXION GUEVIN" type="MTS" hours="6,0" />
                <BoardCard variant="commande" status="planifie" article="XTR108120" ord="AR24601·L1" title="Caisse D350" client="CDC Habitat" type="MTO" hours="7,5" />
                <BoardCard variant="commande" status="planifie" mod feas="ok" article="VMC-310" ord="AR24610·L2" title="Caisson isolé" client="Bouygues" type="MTO" hours="5,5" />
                <BoardCard variant="commande" status="suggere" mod feas="bad" article="XTR106540" ord="AR24490·L4" title="Caisse D200" client="Bouygues" type="MTS" hours="3,0" />
              </div>
              <FieldLabel class="mt-6">Variante OF — board ordonnancement (statuts ferme → bloqué)</FieldLabel>
              <div class="grid grid-cols-[repeat(auto-fill,176px)] gap-4">
                <BoardCard variant="of" status="ferme" feas="ok" article="OF100245" title="Caisse D250" poste="DCP-01" progress={{ done: 120, total: 150 }} hours="6,0" />
                <BoardCard variant="of" status="planifie" article="OF100288" title="Double flux" poste="SDR-02" progress={{ done: 0, total: 120 }} hours="8,5" />
                <BoardCard variant="of" status="suggere" article="OF100312" title="Caisse D200" poste="PUD-03" progress={{ done: 0, total: 90 }} hours="4,0" />
                <BoardCard variant="of" status="cours" article="OF100198" title="Caisson isolé" poste="ASV-04" progress={{ done: 95, total: 100 }} hours="5,5" />
                <BoardCard variant="of" status="termine" article="OF100156" title="Échangeur D350" poste="CTL-05" progress={{ done: 60, total: 60 }} hours="3,0" />
                <BoardCard variant="of" status="bloque" feas="bad" article="OF100301" title="Caisse D200" poste="DCP-01" progress={{ done: 0, total: 120 }} alert="Rupture MOT-33012" hours="6,0" />
              </div>
            </div>
          </Section>

          {/* ═══ 07 Rangée rupture ═══ */}
          <Section id="rupture" n="07" title="Rangée rupture">
            <div class="overflow-hidden rounded-xl border border-border bg-card">
              <div class="grid grid-cols-[28px_1.6fr_70px_1.3fr_90px_1.5fr_120px] gap-4 border-b border-border bg-secondary px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>№</span><span>Composant</span><span class="text-right">Manq.</span><span>OF bloqué</span><span>Commande</span><span>Réception</span><span class="text-right">Verdict</span>
              </div>
              <RuptureRow rk="02" comp="MOT-33012" desc="Moteur VMC D250 220V" qty="42" of="OF100245" art="XTR106540 · Caisse D200" cmd="AR24490" cli="Bouygues" recId="BC-55821" recMeta="Mécapro · 60 u" verdict="warn" vlabel="Retard +3 j" />
              <RuptureRow rk="03" comp="ECP-55821" desc="Échangeur aluminium D350" qty="25" of="OF100288" art="VMC-220 · Double flux" cmd="AR24588" cli="AXION GUEVIN" none verdict="bad" vlabel="Sans couverture" />
            </div>
          </Section>

          {/* ═══ 08 Panneau détail / BOM ═══ */}
          <Section id="detail" n="08" title="Panneau de détail (D3 · bas)">
            <div class="overflow-hidden rounded-xl border-2 border-foreground bg-card shadow-md">
              <div class="flex items-center gap-3 border-b border-border bg-secondary px-4 py-2.5">
                <span class="font-fraunces text-[16px] font-bold">AR24490 · L4</span>
                <span class="font-mono text-[12px] font-bold text-terra">XTR106540</span>
                <span class="font-fraunces text-[12px] italic text-muted-foreground">Caisse VMC D200</span>
                <Badge variant="destructive" class="ml-1">
                  <span class="material-symbols-outlined text-[13px]">block</span>Bloquée · MOT-33012 −42
                </Badge>
                <span class="flex-1" />
                <Button size="sm">
                  <span class="material-symbols-outlined text-[15px]">swap_horiz</span>Replanifier
                </Button>
              </div>
              <div class="flex items-center gap-0 border-b border-rule-soft bg-card px-4">
                <Meta k="Client" v="Bouygues" />
                <Meta k="Quantité" v="120 u" mono />
                <Meta k="Livraison" v="24 juin" mono />
                <Meta k="Poste" v="DCP-01" />
                <Meta k="Charge" v="3,0 h" mono last />
              </div>
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b border-border bg-secondary font-mono text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th class="px-4 py-2 text-left">Article</th>
                    <th class="px-4 py-2 text-left">Désignation</th>
                    <th class="px-4 py-2 text-right">Besoin</th>
                    <th class="px-4 py-2 text-right">Dispo</th>
                    <th class="px-4 py-2 text-right">État</th>
                  </tr>
                </thead>
                <tbody class="font-mono text-[12px]">
                  <tr class="bg-destructive/5">
                    <td class="px-4 py-2 font-bold">MOT-33012</td>
                    <td class="px-4 py-2 font-sans font-normal text-foreground/80">Moteur VMC D250 220V</td>
                    <td class="px-4 py-2 text-right">120</td>
                    <td class="px-4 py-2 text-right">78</td>
                    <td class="px-4 py-2 text-right font-bold text-destructive">−42</td>
                  </tr>
                  <tr class="border-t border-rule-soft">
                    <td class="px-4 py-2 font-bold">TPS-55120</td>
                    <td class="px-4 py-2 font-sans font-normal text-foreground/80">Support caisson</td>
                    <td class="px-4 py-2 text-right">120</td>
                    <td class="px-4 py-2 text-right">120</td>
                    <td class="px-4 py-2 text-right font-bold text-ferme">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* ═══ 09 États ═══ */}
          <Section id="etats" n="09" title="États">
            <div class="grid grid-cols-3 gap-4">
              <StatePane tone="ferme" icon="check_circle" title="Aucune rupture" sub="Rien à signaler dans la fenêtre." />
              <StatePane tone="muted" spin title="Calcul…" sub="Analyse des besoins X3." />
              <StatePane tone="destructive" icon="cloud_off" title="X3 injoignable" sub="Données du cache (14:30)." />
            </div>
          </Section>

          {/* ═══ 10 Calendrier ═══ */}
          <Section id="calendrier" n="10" title="Calendrier">
            <div class="flex items-start gap-8">
              <Calendar mode="range" range={range()} onRangeChange={setRange} />
              <div class="pt-1">
                <div class="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Plage sélectionnée
                </div>
                <div class="mt-1 font-fraunces text-[22px] font-bold tracking-tight">
                  {range().start ? fmtDate(range().start!) : '—'}{' '}
                  <span class="text-muted-foreground">→</span>{' '}
                  {range().end ? fmtDate(range().end!) : '…'}
                </div>
                <div class="mt-1 font-mono text-[11px] text-muted-foreground">
                  {rangeDays(range())
                    ? `${rangeDays(range())} jours`
                    : 'Cliquez une seconde date pour fermer la plage'}
                </div>
                <p class="mt-4 max-w-[240px] text-[13px] leading-relaxed text-foreground/70">
                  Mode plage : 1er clic = début, survol = aperçu, 2e clic = fin (ordre auto). Barre
                  terra-soft continue entre les bornes, qui sont remplies terra. Existe aussi en mode
                  date unique (<code class="font-mono">mode=&quot;single&quot;</code>).
                </p>
              </div>
            </div>
          </Section>

          {/* ═══ 11 Board (vide) ═══ */}
          <Section id="board" n="11" title="Board (vide)">
            <Board days={BOARD_DAYS} weeks={BOARD_WEEKS} lines={BOARD_LINES} />
            <p class="mt-3 max-w-[560px] text-[13px] leading-relaxed text-foreground/70">
              Coquille du board Papier : semaines à l'horizontale, une rangée par poste, cellules
              vides sur fond quadrillé — prêtes à recevoir les cartes commande.
            </p>
          </Section>

          {/* ═══ 12 Charge long-terme ═══ */}
          <Section id="charge" n="12" title="Charge long-terme" last>
            Projection de charge sur 6 mois : barres empilées Ferme / Planifié / Suggéré, seul le
            sommet réel de la pile est arrondi (le segment Suggéré en base reste net). Sélecteur de
            ligne + granularité mois/semaine, moyenne mobile terra et pic repérés.
            <div class="mt-5">
              <ChargeForecast lines={FORECAST_LINES} monthLabels={FORECAST_MONTHS} />
            </div>
          </Section>

          <div class="mt-12 flex justify-between border-t border-rule-soft pt-5 font-fraunces text-[12px] italic text-muted-foreground">
            <span>
              Design System Papier · composants réels{' '}
              <code class="font-mono not-italic">inertia/components/ui/*</code>
            </span>
            <span>v1.0 · /design-system</span>
          </div>
        </main>
      </div>
    </div>
  )
}

/* ── helpers ── */
const Section: Component<{ id: string; n: string; title: string; last?: boolean; children: any }> = (
  props,
) => (
  <section
    id={props.id}
    class={`scroll-mt-6 ${props.last ? '' : 'border-t border-rule-soft'} py-9`}
  >
    <div class="mb-2 flex items-baseline gap-3">
      <span class="rounded-md bg-terra-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-terra">
        {props.n}
      </span>
      <h2 class="font-fraunces text-[24px] font-bold tracking-tight">{props.title}</h2>
    </div>
    <div class="mb-5 max-w-[680px] text-[13.5px] leading-relaxed text-foreground/70">{props.children}</div>
  </section>
)

const Frame: Component<{ children: any }> = (props) => (
  <div class="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(31,26,19,.05)]">
    {props.children}
  </div>
)

const FieldLabel: Component<{ children: any; class?: string }> = (props) => (
  <span class={`mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground ${props.class ?? ''}`}>
    {props.children}
  </span>
)

const TypeRow: Component<{ spec: string; last?: boolean; children: any }> = (props) => (
  <div class={`flex items-baseline gap-5 py-3 ${props.last ? '' : 'border-b border-rule-soft'}`}>
    <div class="w-56 shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
      {props.spec}
    </div>
    <div class="min-w-0">{props.children}</div>
  </div>
)

const SwatchGroup: Component<{ label: string; items: { name: string; hex: string; tok: string; use: string }[] }> = (
  props,
) => (
  <>
    <div class="mb-2 mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground first:mt-0">
      {props.label}
    </div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
      <For each={props.items}>
        {(s) => (
          <div class="overflow-hidden rounded-lg border border-rule-soft bg-card">
            <div class="h-16" style={{ background: s.hex }} />
            <div class="px-3 py-2">
              <div class="font-mono text-[11px] font-semibold">{s.name}</div>
              <div class="font-mono text-[10px] text-muted-foreground">{s.hex}</div>
              <div class="font-fraunces text-[10px] italic text-muted-foreground/80">{s.use}</div>
            </div>
          </div>
        )}
      </For>
    </div>
  </>
)

const Verdot: Component<{ class?: string; children: any }> = (props) => (
  <span class={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${props.class ?? ''}`}>
    <span class="size-1.5 rounded-full bg-current" />
    {props.children}
  </span>
)

const RuptureRow: Component<{
  rk: string; comp: string; desc: string; qty: string; of: string; art: string
  cmd: string; cli: string; recId?: string; recMeta?: string; none?: boolean
  verdict: 'ok' | 'warn' | 'bad'; vlabel: string
}> = (props) => {
  const vcls = { ok: 'text-ferme', warn: 'text-suggere', bad: 'text-destructive' }[props.verdict]
  return (
    <div class="grid grid-cols-[28px_1.6fr_70px_1.3fr_90px_1.5fr_120px] items-center gap-4 border-t border-rule-soft px-4 py-3 transition-colors hover:bg-terra-soft">
      <span class="font-fraunces text-[13px] text-muted-foreground/70">{props.rk}</span>
      <div>
        <div class="font-mono text-[14px] font-semibold">{props.comp}</div>
        <div class="font-fraunces text-[12px] italic text-muted-foreground">{props.desc}</div>
      </div>
      <div class="text-right font-fraunces text-[22px] font-bold text-destructive tabular-nums">{props.qty}</div>
      <div>
        <span class="cursor-pointer font-mono text-[13px] font-semibold text-terra hover:underline">{props.of}</span>
        <div class="font-fraunces text-[11px] italic text-muted-foreground">{props.art}</div>
      </div>
      <div>
        <div class="font-mono text-[13px] font-semibold">{props.cmd}</div>
        <div class="font-fraunces text-[12px] italic text-muted-foreground">{props.cli}</div>
      </div>
      <div>
        {props.none ? (
          <span class="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-destructive">
            <span class="material-symbols-outlined text-[13px]">block</span>Aucune couverture
          </span>
        ) : (
          <>
            <div class="font-mono text-[12px] font-semibold">{props.recId}</div>
            <div class="font-fraunces text-[11px] italic text-muted-foreground">{props.recMeta}</div>
          </>
        )}
      </div>
      <span class={`justify-self-end inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${vcls}`}>
        <span class="size-1.5 rounded-full bg-current" />
        {props.vlabel}
      </span>
    </div>
  )
}

const Meta: Component<{ k: string; v: string; mono?: boolean; last?: boolean }> = (props) => (
  <div class={`flex flex-col py-2 ${props.last ? '' : 'mr-4 border-r border-rule-soft pr-4'}`}>
    <span class="font-mono text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">{props.k}</span>
    <span class={`font-fraunces text-[13px] font-bold ${props.mono ? 'font-mono' : ''}`}>{props.v}</span>
  </div>
)

const StatePane: Component<{ tone: string; icon?: string; spin?: boolean; title: string; sub: string }> = (
  props,
) => {
  const toneCls: Record<string, string> = {
    ferme: 'bg-ferme/15 text-ferme',
    destructive: 'bg-destructive/10 text-destructive',
    muted: 'bg-secondary text-muted-foreground',
  }
  return (
    <div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-9 text-center">
      {props.spin ? (
        <div class="size-7 animate-spin rounded-full border-[3px] border-border border-t-terra" />
      ) : (
        <div class={`flex size-11 items-center justify-center rounded-full ${toneCls[props.tone]}`}>
          <span class="material-symbols-outlined text-[26px]">{props.icon}</span>
        </div>
      )}
      <div class="font-fraunces text-[15px] font-bold">{props.title}</div>
      <div class="font-fraunces text-[13px] italic text-muted-foreground">{props.sub}</div>
    </div>
  )
}

export default DesignSystem
