// inertia-react/pages/astryx_lab.tsx
//
// Laboratoire Astryx (spike Lot 0, issue #90).
//
// Comparaison side-by-side shadcn/ui vs Astryx natif sous <Theme>, pour
// valider visuellement la coexistence cascade (Q1) + parité thème Airbnb
// (Q2) + comportement des portals Base UI sous le reset Astryx (Q4).
//
// Trois colonnes :
//  1. shadcn actuel (référence avant migration).
//  2. Astryx natif (Button + Card) sous <Theme theme={airbnbTheme}>.
//  3. Tableau de parité tokens + trigger Sheet (portal body-level).
//
// À RETIRER à la décision NO-GO ou au démarrage du Lot 1.

import { Theme } from '@astryxdesign/core/theme'
import { Button as AstryxButton } from '@astryxdesign/core/Button'
import { Card as AstryxCard } from '@astryxdesign/core/Card'

import AppLayout from '@r/layouts/app'
import { airbnbTheme } from '@r/styles/astryx-airbnb-theme'
import { Badge } from '@r/components/ui/badge'
import { Button as ShadcnButton } from '@r/components/ui/button'
import {
  Card as ShadcnCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@r/components/ui/card'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@r/components/ui/sheet'

/** Tokens à inspecter pour la parité thème (Q2). */
const TOKEN_PROBE: Array<{ key: string; expected: string; source: string }> = [
  { key: '--color-accent', expected: '#ff385c', source: 'defineTheme() tokens' },
  { key: '--color-on-accent', expected: '#ffffff', source: 'defineTheme() tokens' },
  { key: '--color-text-primary', expected: '#222222', source: 'defineTheme() tokens' },
  { key: '--color-border', expected: '#dddddd', source: 'defineTheme() tokens' },
  { key: '--color-error', expected: '#c13515', source: 'defineTheme() tokens' },
  { key: '--color-success', expected: '#008049', source: 'defineTheme() tokens' },
  { key: '--color-warning', expected: '#fc642d', source: 'defineTheme() tokens' },
  { key: '--color-ferme', expected: '#008049', source: '[data-astryx-theme] CSS' },
  { key: '--color-planifie', expected: '#00a699', source: '[data-astryx-theme] CSS' },
  { key: '--color-suggere', expected: '#fc642d', source: '[data-astryx-theme] CSS' },
  { key: '--color-rausch', expected: '#ff385c', source: '[data-astryx-theme] CSS' },
  { key: '--color-rausch-active', expected: '#e00b41', source: '[data-astryx-theme] CSS' },
  { key: '--shadow-low', expected: '0 6px 20px …', source: 'defineTheme() tokens' },
  { key: '--shadow-med', expected: '0 18px 50px …', source: 'defineTheme() tokens' },
]

export default function AstryxLab() {
  return (
    <AppLayout
      active="dashboard"
      subtitle="ASTRYX SPIKE LOT 0"
      title="Astryx Lab — issue #90"
    >
      {/* Provider Astryx scopé à la page lab — n'affecte aucune page prod. */}
      <Theme theme={airbnbTheme} mode="light">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr_360px]">
          {/* ── Colonne 1 : shadcn actuel (référence) ── */}
          <section className="space-y-4 rounded-lg border bg-card p-5">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">shadcn/ui actuel</h2>
              <Badge variant="outline">référence</Badge>
            </header>
            <div className="flex flex-wrap gap-2">
              <ShadcnButton variant="default">Default</ShadcnButton>
              <ShadcnButton variant="secondary">Secondary</ShadcnButton>
              <ShadcnButton variant="outline">Outline</ShadcnButton>
              <ShadcnButton variant="ghost">Ghost</ShadcnButton>
              <ShadcnButton variant="destructive">Destructive</ShadcnButton>
            </div>
            <ShadcnCard>
              <CardHeader>
                <CardTitle>Card shadcn</CardTitle>
                <CardDescription>Référence avant migration.</CardDescription>
              </CardHeader>
              <CardContent>
                Tokens lus via <code className="font-mono text-xs">var(--primary)</code> etc.
              </CardContent>
            </ShadcnCard>
          </section>

          {/* ── Colonne 2 : Astryx natif ── */}
          <section className="space-y-4 rounded-lg border bg-card p-5">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Astryx natif</h2>
              <Badge variant="outline">&lt;Theme&gt;</Badge>
            </header>
            <div className="flex flex-wrap gap-2">
              <AstryxButton label="Primary" variant="primary" />
              <AstryxButton label="Secondary" variant="secondary" />
              <AstryxButton label="Ghost" variant="ghost" />
              <AstryxButton label="Destructive" variant="destructive" />
            </div>
            <AstryxCard>
              <div className="space-y-1 p-4">
                <h3 className="text-base font-semibold leading-tight">Astryx Card</h3>
                <p className="text-sm text-muted-foreground">
                  Parité visuelle attendue avec shadcn Card (Rausch accent, ink, hairline).
                </p>
              </div>
            </AstryxCard>
          </section>

          {/* ── Colonne 3 : parité tokens + portal Base UI ── */}
          <section className="space-y-3 rounded-lg border bg-card p-5">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Parité tokens (Q2)</h2>
            </header>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1 font-medium">Token</th>
                  <th className="py-1 font-medium">Attendu</th>
                  <th className="py-1 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {TOKEN_PROBE.map((row) => (
                  <tr key={row.key} className="border-b">
                    <td className="py-1 font-mono">{row.key}</td>
                    <td className="py-1 text-right font-mono">{row.expected}</td>
                    <td className="py-1 text-muted-foreground">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr />

            <header className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Portal Base UI (Q4)
              </h3>
            </header>
            <Sheet>
              <SheetTrigger render={<ShadcnButton variant="outline">Ouvrir Sheet</ShadcnButton>} />
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Sheet toujours stylé</SheetTitle>
                  <SheetDescription>
                    Valide que le reset Astryx ne casse pas les portals body-level.
                  </SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
          </section>
        </div>
      </Theme>
    </AppLayout>
  )
}
