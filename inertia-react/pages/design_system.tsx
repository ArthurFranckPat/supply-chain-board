import { useEffect, useMemo, useState } from 'react'
import { Head } from '@inertiajs/react'

import { TooltipProvider } from '@r/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import { useThemeBody } from '@r/lib/theme-body'
import { cn } from '@r/lib/utils'

import { useScrollSpy } from '@r/components/design-system/kit'
import { ClerkMosaicSection } from '@r/components/design-system/clerk'
import {
  CouleursSection,
  DensiteSection,
  ElevationSection,
  EspacementSection,
  EtatsInteractifsSection,
  IconesSection,
  MotionSection,
  RayonsSection,
  TypographieSection,
} from '@r/components/design-system/foundations'
import {
  BadgesSection,
  BoutonsSection,
  CalendrierSection,
  ChampsSection,
  ConversationSection,
  EtatsSection,
  NavigationSection,
  OverlaysSection,
  SurfacesSection,
} from '@r/components/design-system/primitives'
import {
  BoardCardSection,
  KpiSection,
  LiensSection,
  MigrationSection,
  StatutsSection,
} from '@r/components/design-system/patterns'
import { GraphiquesSection } from '@r/components/design-system/graphiques'
import { TableRowSection } from '@r/components/design-system/table-row'
import { ToolbarSection } from '@r/components/design-system/toolbar'

/**
 * Design system — catalogue complet de l'interface.
 *
 * Trois parties : les fondations (ce dont tout dérive), les primitives
 * `ui/*` (rendues réellement, jamais répliquées) et les motifs applicatifs.
 * Le sélecteur de thème pose `.theme-cursor` | `.theme-airbnb` | `.theme-clerk`
 * sur la page et sur <body> (portails Base UI).
 *
 * Route : GET /design-system
 */

type ThemeId = 'cursor' | 'airbnb' | 'clerk'

const STORAGE_KEY = 'design-system-theme'

const THEMES: Record<
  ThemeId,
  {
    className: string
    label: string
    slug: string
    kicker: string
    title: string
    intro: string
    chips: { k: string; v: string }[]
  }
> = {
  cursor: {
    className: 'theme-cursor',
    label: 'Cursor',
    slug: '.theme-cursor',
    kicker: 'Supply Chain Board',
    title: 'Le langage visuel de l’application',
    intro:
      'Trente primitives, leurs fondations et les motifs métier qui les assemblent — tous rendus sous le scope .theme-cursor. Le thème est appliqué progressivement : chaque fiche porte son état de migration, et la dernière section en fait le récapitulatif.',
    chips: [
      { k: 'Surfaces', v: '#f3f3f3 · #f8f8f8 · #fcfcfc' },
      { k: 'Encre', v: '#212126 · CTA #372f35' },
      { k: 'Contrôles', v: '32 / 24 px' },
      { k: 'Rayon contrôle', v: '6 px' },
      { k: 'Rayon surface', v: '12 px' },
    ],
  },
  airbnb: {
    className: 'theme-airbnb',
    label: 'Airbnb',
    slug: '.theme-airbnb',
    kicker: 'Grammaire d’origine',
    title: 'Rausch, 48 px, rayon 8',
    intro:
      'Thème :root / .theme-airbnb. Boutons 48 / 40 / 56 px, primary #ff385c, ombres réservées aux overlays. C’est encore la grammaire de quelques pages hors migration Cursor.',
    chips: [
      { k: 'Surfaces', v: '#ffffff · #f7f7f7 · #f2f2f2' },
      { k: 'Encre', v: '#222222' },
      { k: 'Primary', v: '#ff385c' },
      { k: 'Bouton', v: '48 px' },
      { k: 'Rayon contrôle', v: '8 px' },
    ],
  },
  clerk: {
    className: 'theme-clerk',
    label: 'Clerk Mosaic',
    slug: '.theme-clerk',
    kicker: 'Kit community',
    title: 'Chrome tactile, 32 px, #372f35',
    intro:
      'Skin Clerk Mosaic posé sur les primitives ui/*. Primary charcoal #372f35, contrôles 32 / 24 px, rayon 6, ombre + dégradé + inset. Aperçu uniquement — aucune page métier.',
    chips: [
      { k: 'Surfaces', v: '#f7f7f7 · #ffffff' },
      { k: 'Encre', v: '#212126' },
      { k: 'Primary', v: '#372f35' },
      { k: 'Bouton', v: '32 / 24 px' },
      { k: 'Rayon', v: '6 px' },
    ],
  },
}

type NavGroupe = { titre: string; items: { id: string; n: string; label: string }[] }

const NAV: NavGroupe[] = [
  {
    titre: 'Fondations',
    items: [
      { id: 'couleurs', n: '01', label: 'Couleurs' },
      { id: 'typo', n: '02', label: 'Typographie' },
      { id: 'espacement', n: '03', label: 'Espacement' },
      { id: 'rayons', n: '04', label: 'Rayons' },
      { id: 'elevation', n: '05', label: 'Élévation' },
      { id: 'motion', n: '06', label: 'Motion' },
      { id: 'densite', n: '07', label: 'Densité' },
      { id: 'focus', n: '08', label: 'Focus & états' },
      { id: 'icones', n: '09', label: 'Iconographie' },
    ],
  },
  {
    titre: 'Primitives',
    items: [
      { id: 'boutons', n: '10', label: 'Boutons' },
      { id: 'badges', n: '11', label: 'Badges & pills' },
      { id: 'champs', n: '12', label: 'Champs' },
      { id: 'calendrier', n: '13', label: 'Calendrier' },
      { id: 'surfaces', n: '14', label: 'Surfaces & tableaux' },
      { id: 'table-row', n: '15', label: 'Rangée de tableau' },
      { id: 'overlays', n: '16', label: 'Overlays' },
      { id: 'navigation', n: '17', label: 'Navigation' },
      { id: 'toolbar', n: '18', label: "Barre d'outils" },
      { id: 'etats', n: '19', label: 'États' },
      { id: 'conversation', n: '20', label: 'Conversation' },
    ],
  },
  {
    titre: 'Motifs',
    items: [
      { id: 'statuts', n: '21', label: 'Alphabets de statut' },
      { id: 'board-card', n: '22', label: 'Carte de board' },
      { id: 'kpi', n: '23', label: 'Indicateurs' },
      { id: 'graphiques', n: '24', label: 'Graphiques' },
      { id: 'liens', n: '25', label: 'Liens externes' },
      { id: 'migration', n: '26', label: 'État de la migration' },
    ],
  },
]

const MOSAIC_ITEM = { id: 'mosaic', n: '00', label: 'Mosaic' }

function isThemeId(v: string): v is ThemeId {
  return v === 'cursor' || v === 'airbnb' || v === 'clerk'
}

export default function DesignSystem() {
  const [theme, setTheme] = useState<ThemeId>('cursor')

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && isThemeId(stored)) setTheme(stored)
  }, [])

  const meta = THEMES[theme]
  useThemeBody(meta.className)

  const nav = useMemo<NavGroupe[]>(() => {
    if (theme !== 'clerk') return NAV
    return [{ titre: 'Clerk', items: [MOSAIC_ITEM] }, ...NAV]
  }, [theme])

  const ids = useMemo(() => nav.flatMap((g) => g.items.map((i) => i.id)), [nav])
  const active = useScrollSpy(ids)

  const onThemeChange = (val: string | null) => {
    if (!val || !isThemeId(val)) return
    setTheme(val)
    window.localStorage.setItem(STORAGE_KEY, val)
  }

  return (
    <>
      <Head title={`Design System · ${meta.label}`} />
      <TooltipProvider>
        <div className={cn(meta.className, 'min-h-screen bg-background text-foreground')}>
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 md:grid-cols-[232px_1fr]">
            <aside className="sticky top-0 z-20 h-fit border-b border-sidebar-border bg-sidebar px-4 py-5 md:h-screen md:overflow-auto md:border-b-0 md:border-r md:px-4 md:py-7">
              <div className="text-[13px] font-medium tracking-[-0.08px] text-sidebar-foreground">
                Design System
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta.slug}</div>

              <div className="mt-4">
                <Select value={theme} onValueChange={onThemeChange}>
                  <SelectTrigger size="sm" className="w-full" aria-label="Thème">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cursor">{THEMES.cursor.label}</SelectItem>
                    <SelectItem value="airbnb">{THEMES.airbnb.label}</SelectItem>
                    <SelectItem value="clerk">{THEMES.clerk.label}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <nav className="mt-5 flex flex-col gap-4">
                {nav.map((groupe) => (
                  <div key={groupe.titre}>
                    <div className="mb-1 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                      {groupe.titre}
                    </div>
                    <div className="flex flex-row flex-wrap gap-0.5 md:flex-col">
                      {groupe.items.map((item) => (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          aria-current={active === item.id ? 'true' : undefined}
                          className={cn(
                            'flex items-center gap-2 rounded-[6px] px-2 py-1 text-[12.5px] transition-colors duration-100',
                            active === item.id
                              ? 'bg-[color-mix(in_oklab,var(--foreground)_16%,transparent)] font-medium text-sidebar-foreground'
                              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                          )}
                        >
                          <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                            {item.n}
                          </span>
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>

              <p className="mt-6 hidden px-2 text-[11px] leading-[15px] text-muted-foreground md:block">
                Les composants sont rendus réellement, jamais répliqués. Source de vérité des
                valeurs : <code className="font-mono text-foreground">DESIGN.md</code>
                {theme === 'clerk' ? ' + Figma Clerk Mosaic.' : '.'}
              </p>
            </aside>

            <main className="min-w-0 bg-background px-5 pb-28 pt-8 md:px-10 md:pt-12">
              <header className="max-w-[720px] pb-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand">
                  {meta.kicker}
                </div>
                <h1
                  className="mt-3 text-[32px] font-medium leading-[34px] tracking-[-0.46px] text-foreground"
                  style={{ textWrap: 'balance' }}
                >
                  {meta.title}
                </h1>
                <p className="mt-4 text-[14px] leading-[22px] tracking-[-0.15px] text-muted-foreground">
                  {meta.intro}
                </p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-muted-foreground">
                  {meta.chips.map((c) => (
                    <span key={c.k}>
                      {c.k} <span className="text-foreground">{c.v}</span>
                    </span>
                  ))}
                </div>
              </header>

              {theme === 'clerk' ? <ClerkMosaicSection /> : null}

              <CouleursSection />
              <TypographieSection />
              <EspacementSection />
              <RayonsSection />
              <ElevationSection />
              <MotionSection />
              <DensiteSection />
              <EtatsInteractifsSection />
              <IconesSection />

              <BoutonsSection />
              <BadgesSection />
              <ChampsSection />
              <CalendrierSection />
              <SurfacesSection />
              <TableRowSection />
              <OverlaysSection />
              <NavigationSection />
              <ToolbarSection />
              <EtatsSection />
              <ConversationSection />

              <StatutsSection />
              <BoardCardSection />
              <KpiSection />
              <GraphiquesSection />
              <LiensSection />
              <MigrationSection />

              <footer className="mt-12 flex flex-wrap justify-between gap-3 border-t border-border pt-5 text-[12px] text-muted-foreground">
                <span>
                  <code className="font-mono text-foreground">inertia-react/components/ui/*</code> ·{' '}
                  <code className="font-mono text-foreground">
                    inertia-react/components/design-system/*
                  </code>
                </span>
                <span className="font-mono">/design-system</span>
              </footer>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </>
  )
}
