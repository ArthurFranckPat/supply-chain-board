import { Head } from '@inertiajs/react'

import { TooltipProvider } from '@r/components/ui/tooltip'
import { cn } from '@r/lib/utils'

import { useScrollSpy } from '@r/components/design-system/kit'
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

/**
 * Design system — catalogue complet de l'interface, rendu sous `.theme-cursor`.
 *
 * Trois parties : les fondations (ce dont tout dérive), les primitives
 * `ui/*` (rendues réellement, jamais répliquées) et les motifs applicatifs.
 * La dernière section suit la migration Airbnb → Cursor, composant par
 * composant.
 *
 * Route : GET /design-system
 */

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
      { id: 'overlays', n: '15', label: 'Overlays' },
      { id: 'navigation', n: '16', label: 'Navigation' },
      { id: 'etats', n: '17', label: 'États' },
      { id: 'conversation', n: '18', label: 'Conversation' },
    ],
  },
  {
    titre: 'Motifs',
    items: [
      { id: 'statuts', n: '19', label: 'Alphabets de statut' },
      { id: 'board-card', n: '20', label: 'Carte de board' },
      { id: 'kpi', n: '21', label: 'Indicateurs' },
      { id: 'graphiques', n: '22', label: 'Graphiques' },
      { id: 'liens', n: '23', label: 'Liens externes' },
      { id: 'migration', n: '24', label: 'État de la migration' },
    ],
  },
]

const IDS = NAV.flatMap((g) => g.items.map((i) => i.id))

export default function DesignSystem() {
  const active = useScrollSpy(IDS)

  return (
    <>
      <Head title="Design System · Cursor" />
      <TooltipProvider>
        <div className="theme-cursor min-h-screen">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 md:grid-cols-[232px_1fr]">
            {/* Rail de navigation */}
            <aside className="sticky top-0 z-20 h-fit border-b border-[color-mix(in_oklab,#141414_8%,transparent)] bg-[#f3f3f3] px-4 py-5 md:h-screen md:overflow-auto md:border-b-0 md:border-r md:px-4 md:py-7">
              <div className="text-[13px] font-medium tracking-[-0.08px] text-[#141414]">
                Design System
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                .theme-cursor
              </div>

              <nav className="mt-5 flex flex-col gap-4">
                {NAV.map((groupe) => (
                  <div key={groupe.titre}>
                    <div className="mb-1 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[color-mix(in_oklab,#141414_36%,transparent)]">
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
                              ? 'bg-[color-mix(in_oklab,#141414_16%,transparent)] font-medium text-[#141414]'
                              : 'text-[color-mix(in_oklab,#141414_74%,transparent)] hover:bg-[color-mix(in_oklab,#141414_8%,transparent)] hover:text-[#141414]'
                          )}
                        >
                          <span className="font-mono text-[9px] tabular-nums text-[color-mix(in_oklab,#141414_36%,transparent)]">
                            {item.n}
                          </span>
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>

              <p className="mt-6 hidden px-2 text-[11px] leading-[15px] text-[color-mix(in_oklab,#141414_60%,transparent)] md:block">
                Les composants sont rendus réellement, jamais répliqués. Source de vérité des
                valeurs : <code className="font-mono text-[#141414]">DESIGN.md</code>.
              </p>
            </aside>

            {/* Contenu */}
            <main className="min-w-0 bg-[#f8f8f8] px-5 pb-28 pt-8 md:px-10 md:pt-12">
              <header className="max-w-[720px] pb-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f54e00]">
                  Supply Chain Board
                </div>
                <h1
                  className="mt-3 text-[32px] font-medium leading-[34px] tracking-[-0.46px] text-[#141414]"
                  style={{ textWrap: 'balance' }}
                >
                  Le langage visuel de l’application
                </h1>
                <p className="mt-4 text-[14px] leading-[22px] tracking-[-0.15px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
                  Vingt-neuf primitives, leurs fondations et les motifs métier qui les assemblent —
                  tous rendus sous le scope{' '}
                  <code className="rounded-[4px] bg-[color-mix(in_oklab,#141414_6%,transparent)] px-1.5 py-0.5 font-mono text-[12px] text-[#141414]">
                    .theme-cursor
                  </code>
                  . Le thème est appliqué progressivement : chaque fiche porte son état de
                  migration, et la dernière section en fait le récapitulatif.
                </p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                  <span>
                    Surfaces <span className="text-[#141414]">#f3f3f3 · #f8f8f8 · #fcfcfc</span>
                  </span>
                  <span>
                    Encre <span className="text-[#141414]">#141414</span>
                  </span>
                  <span>
                    Base <span className="text-[#141414]">13 / 18 px</span>
                  </span>
                  <span>
                    Rayon contrôle <span className="text-[#141414]">6 px</span>
                  </span>
                  <span>
                    Rayon surface <span className="text-[#141414]">12 px</span>
                  </span>
                </div>
              </header>

              {/* Fondations */}
              <CouleursSection />
              <TypographieSection />
              <EspacementSection />
              <RayonsSection />
              <ElevationSection />
              <MotionSection />
              <DensiteSection />
              <EtatsInteractifsSection />
              <IconesSection />

              {/* Primitives */}
              <BoutonsSection />
              <BadgesSection />
              <ChampsSection />
              <CalendrierSection />
              <SurfacesSection />
              <OverlaysSection />
              <NavigationSection />
              <EtatsSection />
              <ConversationSection />

              {/* Motifs */}
              <StatutsSection />
              <BoardCardSection />
              <KpiSection />
              <GraphiquesSection />
              <LiensSection />
              <MigrationSection />

              <footer className="mt-12 flex flex-wrap justify-between gap-3 border-t border-[color-mix(in_oklab,#141414_4%,transparent)] pt-5 text-[12px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                <span>
                  <code className="font-mono text-[#141414]">inertia-react/components/ui/*</code> ·{' '}
                  <code className="font-mono text-[#141414]">
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
