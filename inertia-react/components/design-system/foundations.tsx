import { useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  Factory,
  Package,
  Play,
  Search,
  Truck,
} from 'lucide-react'

import { cn } from '@r/lib/utils'
import { Caption, Demo, Grid, Panel, Rule, Section, SpecTable, Sub, Tok } from './kit'

/**
 * Fondations du design system : ce dont tout le reste dérive.
 * Valeurs issues de DESIGN.md (extrait `:root` produit Cursor light).
 */

/* ── 01 Couleurs ────────────────────────────────────────────── */

type Swatch = { name: string; value: string; token: string; use: string; ink?: string }

const SURFACES: Swatch[] = [
  { name: 'Sidebar', value: '#f3f3f3', token: '--bg-sidebar', use: 'rail de navigation' },
  { name: 'Chrome', value: '#f8f8f8', token: '--bg-chrome', use: 'fond de page, TopBar' },
  { name: 'Elevated', value: '#fcfcfc', token: '--bg-elevated', use: 'cards, panneaux, popovers' },
  {
    name: 'Neutral',
    value: '#141414',
    token: '--bg-neutral',
    use: 'CTA plein',
    ink: '#fcfcfc',
  },
]

const WASHES: Swatch[] = [
  {
    name: 'Quaternary',
    value: 'color-mix(in oklab, #141414 6%, transparent)',
    token: '--bg-quaternary',
    use: 'hover de ligne, card wash',
  },
  {
    name: 'Tertiary',
    value: 'color-mix(in oklab, #141414 8%, transparent)',
    token: '--bg-tertiary',
    use: 'hover chrome, bouton secondaire',
  },
  {
    name: 'Active',
    value: 'color-mix(in oklab, #141414 16%, transparent)',
    token: '--bg-active',
    use: 'item de nav actif',
  },
  {
    name: 'Scrim',
    value: '#0006',
    token: '--bg-scrim',
    use: 'voile derrière un overlay',
  },
]

const INKS: Swatch[] = [
  { name: 'Primary', value: '#141414', token: '--text-primary', use: 'titres, valeur en emphase' },
  {
    name: 'Secondary',
    value: 'color-mix(in oklab, #141414 74%, transparent)',
    token: '--text-secondary',
    use: 'corps de texte, cellules',
  },
  {
    name: 'Tertiary',
    value: 'color-mix(in oklab, #141414 60%, transparent)',
    token: '--text-tertiary',
    use: 'en-têtes de colonne, légendes',
  },
  {
    name: 'Quaternary',
    value: 'color-mix(in oklab, #141414 36%, transparent)',
    token: '--text-quaternary',
    use: 'numérotation, texte désactivé',
  },
]

const SEMANTIC: Swatch[] = [
  { name: 'Brand', value: '#f54e00', token: '--brand', use: 'marque — usage rare', ink: '#fff' },
  {
    name: 'Accent',
    value: '#2778c1',
    token: '--accent / --focus',
    use: 'focus, liens',
    ink: '#fff',
  },
  { name: 'Success', value: '#007041', token: '--success', use: 'ferme, couvert', ink: '#fff' },
  { name: 'Warn', value: '#a46700', token: '--warn', use: 'suggéré, à surveiller', ink: '#fff' },
  { name: 'Danger', value: '#be1744', token: '--danger', use: 'rupture, destructif', ink: '#fff' },
  { name: 'Cyan', value: '#176c74', token: '--cyan', use: 'catégorie neutre', ink: '#fff' },
  { name: 'Purple', value: '#7565cc', token: '--purple', use: 'catégorie neutre', ink: '#fff' },
  { name: 'Magenta', value: '#92156a', token: '--magenta', use: 'catégorie neutre', ink: '#fff' },
]

const BORDERS = [
  { name: 'Quaternary', mix: '4 %', token: '--border-quaternary', use: 'filet de card, de ligne' },
  { name: 'Tertiary', mix: '8 %', token: '--border-tertiary', use: 'bordure par défaut' },
  { name: 'Secondary', mix: '12 %', token: '--border-secondary', use: 'champ de saisie' },
  { name: 'Primary', mix: '20 %', token: '--border-primary', use: 'bordure appuyée' },
]

function SwatchCard({ s }: { s: Swatch }) {
  return (
    <div className="overflow-hidden rounded-[8px] bg-[#fcfcfc] shadow-[0_0_0_1px_color-mix(in_oklab,#141414_4%,transparent)]">
      <div
        className="flex h-14 items-end justify-end p-2"
        style={{ background: s.value }}
        aria-hidden
      >
        {s.ink ? (
          <span className="font-mono text-[10px]" style={{ color: s.ink }}>
            Aa
          </span>
        ) : null}
      </div>
      <div className="border-t border-[color-mix(in_oklab,#141414_4%,transparent)] px-3 py-2">
        <div className="text-[13px] font-medium leading-[18px] text-[#141414]">{s.name}</div>
        <div className="truncate font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
          {s.token}
        </div>
        <div className="mt-1 text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
          {s.use}
        </div>
      </div>
    </div>
  )
}

export function CouleursSection() {
  return (
    <Section
      id="couleurs"
      n="01"
      title="Couleurs"
      intro={
        <>
          Trois plans opaques portent la hiérarchie — sidebar, chrome, élevé. Tout le reste est un{' '}
          <em>wash</em> d’encre <Tok>#141414</Tok> posé en <Tok>color-mix</Tok>, ce qui garantit que
          les nuances restent cohérentes quel que soit le fond.
        </>
      }
    >
      <Sub title="Surfaces opaques" hint="les seuls fonds pleins de l’interface" />
      <Grid min={200}>
        {SURFACES.map((s) => (
          <SwatchCard key={s.name} s={s} />
        ))}
      </Grid>

      <Sub title="Washes d’encre" hint="états et fonds transparents" className="mt-8" />
      <Grid min={200}>
        {WASHES.map((s) => (
          <SwatchCard key={s.name} s={s} />
        ))}
      </Grid>

      <Sub title="Encre" hint="quatre niveaux, jamais un gris arbitraire" className="mt-8" />
      <Grid min={200}>
        {INKS.map((s) => (
          <SwatchCard key={s.name} s={s} />
        ))}
      </Grid>

      <Sub title="Sémantique" hint="couleur = sens, pas décoration" className="mt-8" />
      <Grid min={160}>
        {SEMANTIC.map((s) => (
          <SwatchCard key={s.name} s={s} />
        ))}
      </Grid>

      <Sub title="Filets" hint="quatre opacités de la même encre" className="mt-8" />
      <Panel>
        <div className="flex flex-col gap-3">
          {BORDERS.map((b) => (
            <div key={b.name} className="flex flex-wrap items-center gap-4">
              <div
                className="h-8 w-28 shrink-0 rounded-[6px]"
                style={{
                  boxShadow: `0 0 0 1px color-mix(in oklab, #141414 ${b.mix.replace(' %', '%')}, transparent)`,
                }}
              />
              <span className="w-24 shrink-0 font-mono text-[11px] text-[#141414]">{b.name}</span>
              <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {b.mix}
              </span>
              <span className="text-[13px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
                {b.use}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Séparer deux zones par un <strong>changement de surface</strong> ; ajouter un filet
          seulement si le contraste ne suffit pas.
        </Rule>
        <Rule kind="dont">
          Remplir une surface en <Tok>--brand</Tok>. L’orange est un accent de marque, il ne peint
          jamais un fond de bloc.
        </Rule>
      </div>
    </Section>
  )
}

/* ── 02 Typographie ─────────────────────────────────────────── */

const TYPE_SCALE = [
  {
    role: 'xs',
    size: 11,
    lh: 14,
    ls: '+0.07px',
    use: 'badge, kbd, note de bas de cellule',
  },
  { role: 'sm', size: 12, lh: 16, ls: '0px', use: 'en-tête de colonne, légende' },
  { role: 'base', size: 13, lh: 18, ls: '−0.08px', use: 'texte d’interface par défaut' },
  { role: 'lg', size: 14, lh: 22, ls: '−0.15px', use: 'texte long, intro' },
]

const TYPE_DISPLAY = [
  { role: 'Titre de section', size: 20, lh: 24, ls: '−0.26px', weight: 500 },
  { role: 'Valeur KPI', size: 28, lh: 32, ls: '−0.46px', weight: 500 },
  { role: 'Titre de page', size: 32, lh: 34, ls: '−0.46px', weight: 500 },
]

export function TypographieSection() {
  return (
    <Section
      id="typo"
      n="02"
      title="Typographie"
      intro={
        <>
          Une seule famille système, quatre tailles d’interface, deux graisses utiles. La densité
          vient de la taille de base à <strong>13 px / 18 px</strong> — pas d’un texte rétréci au
          cas par cas. Le crénage se resserre quand la taille monte.
        </>
      }
    >
      <Sub title="Familles" />
      <Grid min={280}>
        <Panel>
          <Caption className="mb-2">Sans — interface</Caption>
          <div className="text-[20px] font-medium tracking-[-0.26px] text-[#141414]">
            Planification atelier
          </div>
          <div className="mt-2 font-mono text-[10px] leading-[14px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
            -apple-system, BlinkMacSystemFont, &apos;Segoe UI&apos;, &apos;Inter Variable&apos;,
            sans-serif
          </div>
        </Panel>
        <Panel>
          <Caption className="mb-2">Mono — codes, quantités, tokens</Caption>
          <div className="font-mono text-[20px] font-medium tabular-nums text-[#141414]">
            OF F126-44429
          </div>
          <div className="mt-2 font-mono text-[10px] leading-[14px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
          </div>
        </Panel>
      </Grid>

      <Sub title="Échelle d’interface" hint="les quatre tailles autorisées" className="mt-8" />
      <Panel padding="none">
        <div className="divide-y divide-[color-mix(in_oklab,#141414_4%,transparent)]">
          {TYPE_SCALE.map((t) => (
            <div
              key={t.role}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <div className="w-40 shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {t.role} · {t.size}/{t.lh} · {t.ls}
              </div>
              <div
                className="min-w-0 flex-1 text-[#141414]"
                style={{
                  fontSize: `${t.size}px`,
                  lineHeight: `${t.lh}px`,
                  letterSpacing: t.ls.replace('−', '-').replace('px', 'px'),
                }}
              >
                Huit lignes sont freinées par une rupture composant
              </div>
              <div className="w-56 shrink-0 text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {t.use}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Sub
        title="Titres et chiffres"
        hint="au-delà de 14 px, le crénage se resserre"
        className="mt-8"
      />
      <Panel padding="none">
        <div className="divide-y divide-[color-mix(in_oklab,#141414_4%,transparent)]">
          {TYPE_DISPLAY.map((t) => (
            <div
              key={t.role}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <div className="w-40 shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {t.size}/{t.lh} · {t.ls} · {t.weight}
              </div>
              <div
                className="min-w-0 flex-1 text-[#141414]"
                style={{
                  fontSize: `${t.size}px`,
                  lineHeight: `${t.lh}px`,
                  letterSpacing: t.ls.replace('−', '-'),
                  fontWeight: t.weight,
                }}
              >
                {t.role}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-3">
        <Rule kind="do">
          La hiérarchie des titres se fait par la <strong>taille et le crénage</strong>, pas par la
          graisse : le crénage passe de <Tok>+0,07px</Tok> à 11 px à <Tok>−0,46px</Tok> à 32 px. Un
          titre reste en 400–500 — jamais en 700.
        </Rule>
      </div>

      <Sub
        title="Graisses"
        hint="418 est la normale du produit ; 500 porte l’emphase"
        className="mt-8"
      />
      <Panel>
        <div className="flex flex-wrap gap-6">
          {[
            { w: 418, n: 'regular' },
            { w: 500, n: 'medium' },
            { w: 600, n: 'semibold' },
            { w: 700, n: 'bold' },
          ].map((g) => (
            <div key={g.w}>
              <div
                className="text-[20px] tracking-[-0.26px] text-[#141414]"
                style={{ fontWeight: g.w }}
              >
                Semaine 32
              </div>
              <div className="mt-1 font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {g.w} · {g.n}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
          Le <Tok>418</Tok> vient d’une fonte variable ; avec la pile système il retombe sur 400. En
          pratique, l’interface n’utilise que <strong>regular</strong> et <strong>medium</strong> :
          600 et 700 sont réservés au hors-interface.
        </p>
      </Panel>

      <Sub
        title="Chiffres tabulaires"
        hint="obligatoire dès qu’une colonne s’aligne"
        className="mt-8"
      />
      <Grid min={260}>
        <Demo label="tabular-nums" spec="font-feature-settings: 'tnum' 1 — actif sur .theme-cursor">
          <div className="font-mono text-[13px] tabular-nums leading-[20px] text-[#141414]">
            <div>1 240 u</div>
            <div>98 u</div>
            <div>11 007 u</div>
          </div>
        </Demo>
        <Demo label="Proportionnel — à éviter en colonne">
          <div
            className="text-[13px] leading-[20px] text-[color-mix(in_oklab,#141414_74%,transparent)]"
            style={{ fontVariantNumeric: 'proportional-nums' }}
          >
            <div>1 240 u</div>
            <div>98 u</div>
            <div>11 007 u</div>
          </div>
        </Demo>
      </Grid>
    </Section>
  )
}

/* ── 03 Espacement ──────────────────────────────────────────── */

const SPACING = [1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80]

const SPACING_USE = [
  ['Gap icône ↔ label', '6 px', 'bouton, item de nav, badge'],
  ['Padding bouton (base)', '0 12 px', 'hauteur 28 px, radius 6'],
  ['Padding cellule de table', '12 px 16 px', 'th et td, identiques'],
  ['Padding card', '16 px', 'recette KPI Cursor'],
  ['Padding panneau documenté', '20 px', 'blocs de cette page'],
  ['Gouttière de grille', '16 px', 'cards KPI côte à côte'],
  ['Rythme entre sections', '40 px', 'py-10 + filet quaternary'],
]

export function EspacementSection() {
  return (
    <Section
      id="espacement"
      n="03"
      title="Espacement"
      intro={
        <>
          Unité de base <strong>4 px</strong>, avec des quarts de pas à 1 px pour les ajustements
          optiques. Toute valeur d’espacement de l’interface est un multiple de 4 — les 1, 2, 3 px
          servent uniquement à recaler un filet ou une icône.
        </>
      }
    >
      <Sub title="Échelle" />
      <Panel>
        <div className="flex flex-col gap-2">
          {SPACING.map((n) => (
            <div key={n} className="flex items-center gap-4">
              <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {n}
              </span>
              <div
                className="h-3 rounded-[2px] bg-[color-mix(in_oklab,#141414_20%,transparent)]"
                style={{ width: `${n}px` }}
              />
              <span className="font-mono text-[10px] text-[color-mix(in_oklab,#141414_36%,transparent)]">
                --cursor-spacing-
                {n / 4 === Math.floor(n / 4) ? n / 4 : (n / 4).toString().replace('.', '-')}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Sub title="Où va quelle valeur" className="mt-8" />
      <Panel padding="none">
        <SpecTable
          head={['Contexte', 'Valeur', 'Note']}
          rows={SPACING_USE.map(([a, b, c]) => [
            <span className="text-[#141414]">{a}</span>,
            <span className="font-mono text-[12px] tabular-nums text-[#141414]">{b}</span>,
            c,
          ])}
        />
      </Panel>
    </Section>
  )
}

/* ── 04 Rayons ──────────────────────────────────────────────── */

const RADII = [
  { r: 2, token: '--cursor-radius-xs', use: 'barre de progression, pastille' },
  { r: 4, token: '--cursor-radius-sm', use: 'jeton mono, chip' },
  { r: 6, token: '--cursor-radius-base', use: 'bouton, input, item de nav' },
  { r: 8, token: '--cursor-radius-lg', use: 'panneau interne, encadré' },
  { r: 12, token: '--cursor-radius-xl', use: 'card, dialog, popover' },
  { r: 14, token: '--cursor-radius-2xl', use: 'sheet, grande surface' },
  { r: 16, token: '--cursor-radius-3xl', use: 'conteneur pleine largeur' },
  { r: 9999, token: '--cursor-radius-full', use: 'pill, avatar, switch' },
]

export function RayonsSection() {
  return (
    <Section
      id="rayons"
      n="04"
      title="Rayons"
      intro={
        <>
          Le rayon indique la taille de l’objet, pas son style : 6 px pour les contrôles, 12 px pour
          les surfaces, plein rond pour ce qui est circulaire par nature. Un rayon de 10 px n’existe
          pas.
        </>
      }
    >
      <Grid min={150}>
        {RADII.map((x) => (
          <div key={x.token} className="min-w-0">
            <div
              className="flex h-16 items-center justify-center bg-[#fcfcfc] shadow-[0_0_0_1px_color-mix(in_oklab,#141414_8%,transparent)]"
              style={{ borderRadius: x.r === 9999 ? 9999 : x.r }}
            >
              <span className="font-mono text-[11px] tabular-nums text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {x.r === 9999 ? 'full' : `${x.r}px`}
              </span>
            </div>
            <div className="mt-2 truncate font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
              {x.token}
            </div>
            <div className="text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
              {x.use}
            </div>
          </div>
        ))}
      </Grid>
    </Section>
  )
}

/* ── 05 Élévation ───────────────────────────────────────────── */

const ELEVATIONS = [
  {
    name: 'Filet seul',
    token: '--border-quaternary en ring',
    css: '0 0 0 1px color-mix(in oklab, #141414 4%, transparent)',
    use: 'card, panneau posé sur le chrome',
  },
  {
    name: 'sm',
    token: '--cursor-box-shadow-sm',
    css: '0 2px 8px 0 #00000009',
    use: 'élément légèrement détaché',
  },
  {
    name: 'soft',
    token: '--cursor-box-shadow-soft',
    css: '0 0 8px 2px #00000005',
    use: 'halo diffus, sans direction',
  },
  {
    name: 'base',
    token: '--cursor-box-shadow-base',
    css: '0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 4px 0 #00000009, 0 8px 24px -2px #00000009',
    use: 'panneau flottant, menu',
  },
  {
    name: 'card / workbench',
    token: '--color-theme-shadow-card',
    css: '0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f',
    use: 'card détachée du fond',
  },
  {
    name: 'popup',
    token: '--cursor-box-shadow-popup',
    css: '0 8px 16px 0 rgba(20, 20, 20, 0.12)',
    use: 'popover, dropdown',
  },
  {
    name: 'popover',
    token: '--color-theme-shadow-popover',
    css: '0 10px 15px -3px #0000001a, 0 4px 6px -2px #0000000d',
    use: 'surcouche courte',
  },
  {
    name: 'dialog',
    token: '--color-theme-shadow-dialog',
    css: '0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f',
    use: 'modale',
  },
  {
    name: 'command',
    token: '--color-theme-shadow-command',
    css: '0 25px 50px -12px #00000040, 0 12px 24px -8px #00000026',
    use: 'palette de commande — le niveau le plus haut',
  },
]

export function ElevationSection() {
  return (
    <Section
      id="elevation"
      n="05"
      title="Élévation"
      intro={
        <>
          L’élévation par défaut n’est pas une ombre : c’est un{' '}
          <strong>filet de 1 px posé en box-shadow</strong>. Il ne consomme pas de place dans la
          boîte, donc il ne décale rien. Les ombres portées ne servent qu’aux surfaces qui flottent
          réellement au-dessus du contenu.
        </>
      }
    >
      <Grid min={230}>
        {ELEVATIONS.map((e) => (
          <div key={e.name} className="min-w-0">
            <div className="rounded-[8px] bg-[#f8f8f8] p-5">
              <div
                className="flex h-16 items-center justify-center rounded-[12px] bg-[#fcfcfc]"
                style={{ boxShadow: e.css }}
              >
                <span className="text-[13px] font-medium text-[#141414]">{e.name}</span>
              </div>
            </div>
            <div className="mt-2 truncate font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
              {e.token}
            </div>
            <div className="text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
              {e.use}
            </div>
          </div>
        ))}
      </Grid>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Filet en <Tok>box-shadow: 0 0 0 1px …</Tok> : la hauteur de la card reste exactement celle
          de son contenu.
        </Rule>
        <Rule kind="dont">
          Empiler <Tok>border</Tok> et ombre sur la même surface — le filet double et la carte
          paraît sale.
        </Rule>
      </div>
    </Section>
  )
}

/* ── 06 Motion ──────────────────────────────────────────────── */

const DURATIONS = [
  { name: 'instant', ms: 50, use: 'retour de pression, changement d’état immédiat' },
  { name: 'fast', ms: 100, use: 'hover, focus' },
  { name: 'normal', ms: 150, use: 'ouverture de popover, tooltip' },
  { name: 'slow', ms: 200, use: 'dialog, sheet' },
  { name: 'slower', ms: 300, use: 'transition de layout, repli de sidebar' },
]

const EASINGS = [
  { name: 'default', css: 'ease', use: 'par défaut' },
  { name: 'out', css: 'ease-out', use: 'entrée d’élément' },
  { name: 'in', css: 'ease-in', use: 'sortie d’élément' },
  { name: 'in-out', css: 'ease-in-out', use: 'aller-retour' },
  { name: 'out-quint', css: 'cubic-bezier(0.16, 1, 0.3, 1)', use: 'ouverture d’overlay' },
  { name: 'out-strong', css: 'cubic-bezier(0.165, 0.84, 0.44, 1)', use: 'glissement de panneau' },
  { name: 'in-strong', css: 'cubic-bezier(0.895, 0.03, 0.685, 0.22)', use: 'fermeture' },
  { name: 'in-out-strong', css: 'cubic-bezier(0.77, 0, 0.175, 1)', use: 'déplacement long' },
]

function MotionLab() {
  const [on, setOn] = useState(false)
  const [ms, setMs] = useState(300)

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOn((v) => !v)}
          className="inline-flex h-7 items-center gap-1.5 rounded-[6px] bg-[#141414] px-3 text-[13px] font-medium tracking-[-0.08px] text-[#fcfcfc] transition-colors duration-100 hover:bg-[color-mix(in_oklab,#f8f8f8_10%,#141414)]"
        >
          <Play className="size-3.5" />
          Rejouer
        </button>
        <div className="flex items-center gap-1">
          {DURATIONS.map((d) => (
            <button
              key={d.ms}
              type="button"
              onClick={() => setMs(d.ms)}
              className={cn(
                'h-7 rounded-[6px] px-2.5 font-mono text-[11px] tabular-nums transition-colors duration-100',
                ms === d.ms
                  ? 'bg-[color-mix(in_oklab,#141414_16%,transparent)] text-[#141414]'
                  : 'text-[color-mix(in_oklab,#141414_60%,transparent)] hover:bg-[color-mix(in_oklab,#141414_8%,transparent)]'
              )}
            >
              {d.ms}ms
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {EASINGS.map((e) => (
          <div key={e.name} className="flex items-center gap-4">
            <span className="w-32 shrink-0 font-mono text-[11px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
              {e.name}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-[6px] bg-[color-mix(in_oklab,#141414_4%,transparent)]">
              <div
                className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-[#141414]"
                style={{
                  left: on ? 'calc(100% - 18px)' : '6px',
                  transition: `left ${ms}ms ${e.css}`,
                }}
              />
            </div>
            <span className="hidden w-44 shrink-0 text-[12px] text-[color-mix(in_oklab,#141414_60%,transparent)] sm:block">
              {e.use}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function MotionSection() {
  return (
    <Section
      id="motion"
      n="06"
      title="Motion"
      intro={
        <>
          Le mouvement confirme une action, il ne la met pas en scène. Cinq durées, huit courbes ;
          la valeur par défaut est <strong>150 ms</strong>, et au-delà de 300 ms l’interface donne
          l’impression de traîner. Aucun rebond, aucun ressort. Rien ne bouge en continu en dehors
          des indicateurs de chargement — rotation à 1 s linéaire, pulsation de squelette à 2 s.
        </>
      }
    >
      <MotionLab />

      <Sub title="Durées" className="mt-8" />
      <Panel padding="none">
        <SpecTable
          head={['Token', 'Durée', 'Usage']}
          rows={DURATIONS.map((d) => [
            <span className="font-mono text-[12px] text-[#141414]">
              --cursor-duration-{d.name}
            </span>,
            <span className="font-mono text-[12px] tabular-nums text-[#141414]">{d.ms} ms</span>,
            d.use,
          ])}
        />
      </Panel>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Animer <Tok>opacity</Tok> et <Tok>transform</Tok>. Ce sont les seules propriétés qui ne
          déclenchent pas de recalcul de layout.
        </Rule>
        <Rule kind="dont">
          Animer une hauteur de tableau ou un <Tok>width</Tok> de colonne : la page saute pendant
          toute la durée.
        </Rule>
      </div>
    </Section>
  )
}

/* ── 07 Densité ─────────────────────────────────────────────── */

const HEIGHTS = [
  { name: 'xs', h: 20, token: '--cursor-height-xs', use: 'badge, chip de filtre' },
  { name: 'sm', h: 24, token: '--cursor-height-sm', use: 'bouton compact, item de menu' },
  { name: 'base', h: 28, token: '--cursor-height-base', use: 'bouton, input, select — défaut' },
  { name: 'lg', h: 32, token: '--cursor-height-lg', use: 'CTA principal, barre de recherche' },
]

export function DensiteSection() {
  return (
    <Section
      id="densite"
      n="07"
      title="Densité"
      intro={
        <>
          Quatre hauteurs de contrôle, pas une de plus. La hauteur par défaut est{' '}
          <strong>28 px</strong> : assez compact pour aligner huit filtres sur une barre d’outils,
          assez grand pour rester cliquable. Une ligne de tableau fait 42 px (12 px de padding
          vertical + 18 px de texte).
        </>
      }
    >
      <Panel>
        <div className="flex flex-wrap items-end gap-6">
          {HEIGHTS.map((x) => (
            <div key={x.name}>
              <div
                className="flex items-center justify-center rounded-[6px] bg-[color-mix(in_oklab,#141414_8%,transparent)] px-3 text-[13px] text-[#141414]"
                style={{ height: x.h }}
              >
                {x.h} px
              </div>
              <div className="mt-2 font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {x.name}
              </div>
              <div className="max-w-[160px] text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {x.use}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Section>
  )
}

/* ── 08 Focus & états ───────────────────────────────────────── */

function EtatDemo({
  label,
  spec,
  className,
  children,
}: {
  label: string
  spec: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <Caption className="mb-2">{label}</Caption>
      <div className="rounded-[8px] bg-[#f8f8f8] p-4 shadow-[0_0_0_1px_color-mix(in_oklab,#141414_4%,transparent)]">
        <div
          className={cn(
            'inline-flex h-7 items-center rounded-[6px] px-3 text-[13px] text-[#141414]',
            className
          )}
        >
          {children ?? 'Poste MONT-2'}
        </div>
      </div>
      <div className="mt-2 break-words font-mono text-[10px] leading-[14px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
        {spec}
      </div>
    </div>
  )
}

export function EtatsInteractifsSection() {
  return (
    <Section
      id="focus"
      n="08"
      title="Focus & états"
      intro={
        <>
          Un seul canal par état : le <strong>fond</strong> pour le survol et la sélection, l’
          <strong>anneau</strong> pour le focus clavier, l’<strong>opacité</strong> pour le
          désactivé. La couleur du filet ne change jamais au survol — c’est la règle qui distingue
          le plus nettement cette grammaire d’une grammaire à bordures.
        </>
      }
    >
      <Grid min={200}>
        <EtatDemo
          label="Repos"
          spec="bg transparent"
          className="bg-transparent shadow-[0_0_0_1px_color-mix(in_oklab,#141414_8%,transparent)]"
        />
        <EtatDemo
          label="Survol"
          spec="bg mix(#141414 8%) — le filet ne bouge pas"
          className="bg-[color-mix(in_oklab,#141414_8%,transparent)] shadow-[0_0_0_1px_color-mix(in_oklab,#141414_8%,transparent)]"
        />
        <EtatDemo
          label="Sélectionné"
          spec="bg mix(#141414 16%) — --bg-active"
          className="bg-[color-mix(in_oklab,#141414_16%,transparent)] shadow-[0_0_0_1px_color-mix(in_oklab,#141414_8%,transparent)]"
        />
        <EtatDemo
          label="Focus clavier"
          spec="ring 3px accent 50% + bordure accent pleine"
          className="bg-transparent shadow-[0_0_0_1px_#2778c1,0_0_0_4px_color-mix(in_oklab,#2778c1_50%,transparent)]"
        />
        <EtatDemo
          label="Invalide"
          spec="bordure danger pleine + ring 20 %"
          className="bg-transparent shadow-[0_0_0_1px_#be1744,0_0_0_4px_color-mix(in_oklab,#be1744_20%,transparent)]"
        />
        <EtatDemo
          label="Désactivé"
          spec="opacity .5 + pointer-events-none"
          className="bg-[color-mix(in_oklab,#141414_8%,transparent)] opacity-50 shadow-[0_0_0_1px_color-mix(in_oklab,#141414_8%,transparent)]"
        />
      </Grid>

      <Sub title="Règles" className="mt-8" />
      <Panel padding="none">
        <SpecTable
          head={['État', 'Canal', 'Valeur']}
          rows={[
            [
              'Survol',
              'fond',
              <span className="font-mono text-[12px] text-[#141414]">
                mix(#141414 8 %) — jamais la bordure
              </span>,
            ],
            [
              'Sélection',
              'fond',
              <span className="font-mono text-[12px] text-[#141414]">
                mix(#141414 16 %) — réutilise la mécanique du survol
              </span>,
            ],
            [
              'Focus clavier',
              'anneau',
              <span className="font-mono text-[12px] text-[#141414]">
                ring 3 px · accent #2778c1 à 50 %
              </span>,
            ],
            [
              'Focus non standard',
              'anneau + offset',
              <span className="font-mono text-[12px] text-[#141414]">
                ring 2 px pleine + offset 2 px (carte, image cliquable)
              </span>,
            ],
            [
              'Invalide',
              'bordure + anneau',
              <span className="font-mono text-[12px] text-[#141414]">
                bordure danger pleine · ring 20 %
              </span>,
            ],
            [
              'Désactivé',
              'opacité',
              <span className="font-mono text-[12px] text-[#141414]">
                opacity .5 · pointer-events: none
              </span>,
            ],
          ]}
        />
      </Panel>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          <Tok>:focus-visible</Tok> et non <Tok>:focus</Tok> — l’anneau apparaît au clavier, pas
          après un clic à la souris.
        </Rule>
        <Rule kind="dont">
          Supprimer l’<Tok>outline</Tok> sans le remplacer. Un contrôle sans état de focus est
          inutilisable au clavier.
        </Rule>
      </div>
    </Section>
  )
}

/* ── 09 Iconographie ────────────────────────────────────────── */

const ICON_SIZES = [
  { px: 12, cls: 'size-3', use: 'chevron dans un badge, indicateur de tri' },
  { px: 14, cls: 'size-3.5', use: 'icône de bouton, item de menu' },
  { px: 16, cls: 'size-4', use: 'nav, barre d’outils — taille par défaut' },
  { px: 20, cls: 'size-5', use: 'état vide, en-tête de panneau' },
]

export function IconesSection() {
  return (
    <Section
      id="icones"
      n="09"
      title="Iconographie"
      intro={
        <>
          <Tok>lucide-react</Tok> exclusivement, trait <Tok>stroke-width=2</Tok> (le défaut, non
          modifié), jamais de remplissage. L’icône accompagne un mot — elle ne le remplace que dans
          une barre d’outils, et alors elle porte un <Tok>aria-label</Tok> et un tooltip. Une icône
          qui n’est pas l’objet principal se rend en <Tok>text-muted-foreground</Tok>.
        </>
      }
    >
      <Sub title="Tailles" />
      <Panel>
        <div className="flex flex-wrap items-end gap-8">
          {ICON_SIZES.map((s) => (
            <div key={s.px}>
              <div className="flex h-10 items-center gap-2 text-[#141414]">
                <Package className={s.cls} />
                <Factory className={s.cls} />
                <Truck className={s.cls} />
              </div>
              <div className="font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {s.px} px · {s.cls}
              </div>
              <div className="max-w-[170px] text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {s.use}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Sub
        title="Alignement avec le texte"
        hint="l’icône se cale sur la hauteur d’x, pas sur la ligne"
        className="mt-8"
      />
      <Grid min={240}>
        <Demo label="Correct" spec="inline-flex items-center gap-1.5 · size-3.5">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-[#141414]">
            <Check className="size-3.5 text-[#007041]" />
            Couvert jusqu’au 22/08/2026
          </span>
        </Demo>
        <Demo label="Icône seule — tooltip obligatoire" spec="aria-label + TooltipContent">
          <span className="inline-flex size-7 items-center justify-center rounded-[6px] bg-[color-mix(in_oklab,#141414_8%,transparent)] text-[#141414]">
            <Search className="size-4" />
          </span>
        </Demo>
      </Grid>

      <Sub
        title="Vocabulaire métier"
        hint="une icône = un objet, stable sur toute l’application"
        className="mt-8"
      />
      <Panel padding="none">
        <SpecTable
          head={['Objet', 'Icône', 'Ne pas confondre avec']}
          rows={[
            [
              'Ordre de fabrication',
              <span className="inline-flex items-center gap-2 text-[#141414]">
                <Factory className="size-4" /> Factory
              </span>,
              'la charge atelier (Gauge)',
            ],
            [
              'Article / composant',
              <span className="inline-flex items-center gap-2 text-[#141414]">
                <Package className="size-4" /> Package
              </span>,
              'le stock (Boxes)',
            ],
            [
              'Stock',
              <span className="inline-flex items-center gap-2 text-[#141414]">
                <Boxes className="size-4" /> Boxes
              </span>,
              'l’article (Package)',
            ],
            [
              'Expédition / réception',
              <span className="inline-flex items-center gap-2 text-[#141414]">
                <Truck className="size-4" /> Truck
              </span>,
              'la commande (ClipboardList)',
            ],
            [
              'Rupture',
              <span className="inline-flex items-center gap-2 text-[#141414]">
                <AlertTriangle className="size-4" /> AlertTriangle
              </span>,
              'le retard (Clock)',
            ],
            [
              'Ouvrir dans X3',
              <span className="inline-flex items-center gap-2 text-[#141414]">
                <ArrowUpRight className="size-4" /> ArrowUpRight
              </span>,
              'la navigation interne (ChevronRight)',
            ],
            [
              'Navigation interne',
              <span className="inline-flex items-center gap-2 text-[#141414]">
                <ChevronRight className="size-4" /> ChevronRight
              </span>,
              'le lien externe (ArrowUpRight)',
            ],
          ]}
        />
      </Panel>
    </Section>
  )
}
