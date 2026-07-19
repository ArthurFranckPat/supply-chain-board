import { useState } from 'react'
import { Head, Link, usePage } from '@inertiajs/react'
import { toast } from 'sonner'

import { Button } from '@r/components/ui/button'

/**
 * Page témoin du socle dual-runtime (phase 0, plan react-shadcn §8).
 * Valide : Button shadcn thémé (thème shadcn de base), usePage(), toast
 * sonner, navigation inter-runtimes dans les deux sens.
 */
export default function ReactLab() {
  const page = usePage()
  const [count, setCount] = useState(0)

  return (
    <>
      <Head title="React Lab" />
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl space-y-8 p-8">
          <header className="space-y-1 border-b pb-4">
            <h1 className="text-2xl font-semibold tracking-tight">React Lab</h1>
            <p className="text-sm text-muted-foreground">
              Socle dual-runtime — React 19 + shadcn (thème de base) + Inertia officiel.
              Thème Papier/Aldes conservé en backup côté Solid.
            </p>
          </header>

          <section className="space-y-3 rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-medium text-muted-foreground">Button shadcn (variants)</h2>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setCount((c) => c + 1)}>Compteur : {count}</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-medium text-muted-foreground">Toast sonner</h2>
            <Button
              variant="outline"
              onClick={() =>
                toast.success('Runtime React opérationnel', {
                  description: 'Toaster monté dans inertia-react/app.tsx',
                })
              }
            >
              Déclencher un toast
            </Button>
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-medium text-muted-foreground">usePage()</h2>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify({ component: page.component, url: page.url }, null, 2)}
            </pre>
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-medium text-muted-foreground">
              Navigation inter-runtimes
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {/* Cross-runtime → <a> natif OBLIGATOIRE (hard visit) */}
              <a className="underline underline-offset-4 hover:text-muted-foreground" href="/">
                → Tableau (Solid, a natif)
              </a>
              <a
                className="underline underline-offset-4 hover:text-muted-foreground"
                href="/programme"
              >
                → Programme (Solid, a natif)
              </a>
              {/* Intra-runtime → Link Inertia (visite XHR) */}
              <Link
                className="underline underline-offset-4 hover:text-muted-foreground"
                href="/react-lab"
              >
                → React Lab (Link Inertia, XHR)
              </Link>
            </div>
          </section>

          <footer className="flex justify-between text-xs text-muted-foreground">
            <span>Runtime : React 19 — Compiler actif</span>
            <span>Thème : shadcn base (neutral)</span>
          </footer>
        </div>
      </div>
    </>
  )
}
