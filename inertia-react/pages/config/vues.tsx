/**
 * Configuration des vues (pages du menu + sous-vues) — préférences par
 * utilisateur, persistées en base (`users.view_prefs`).
 *
 * Deux zones, une seule surface :
 *  1. `MenuPreview` — le menu tel qu'il restera, en direct. Il ne montre que ce
 *     qui survivra (une entrée devenue vide disparaît), donc l'effet d'un
 *     réglage se lit sans l'imaginer.
 *  2. le réglage — sections dans l'ordre des menus, une page par ligne (un
 *     interrupteur, affordance standard pour un on/off), et ses sous-vues en
 *     puces : ce sont les onglets de la page, pas des réglages de même rang.
 *
 * Choix de conception :
 *  • on coche ce qu'on VEUT VOIR ; le défaut est tout visible, et une page
 *    ajoutée plus tard apparaît sans reparamétrage (on persiste les masqués) ;
 *  • le Tableau de bord est épinglé (page d'accueil) — non décochable ;
 *  • masquer une page la retire du menu ET de la route (le middleware renvoie
 *    vers une page visible) ; masquer une sous-vue retire son onglet et replie
 *    l'écran sur la première sous-vue visible ;
 *  • l'écriture est un PATCH debounce — retour visuel immédiat (store), un état
 *    d'enregistrement discret dit que c'est bien parti en base.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import ConfigNav from '@r/components/config/config-nav'
import { Switch } from '@r/components/ui/switch'
import { cn } from '@r/lib/utils'
import { PAGES, type PageDef, type PageKey } from '@r/lib/view-prefs/registry'
import { useViewPrefsStore } from '@r/lib/view-prefs/store'

/** Sections dans l'ordre du registre (donc l'ordre des menus). */
function groupPages(): { label: string; pages: PageDef[] }[] {
  const order: string[] = []
  const byGroup = new Map<string, PageDef[]>()
  for (const p of PAGES) {
    if (!byGroup.has(p.group)) {
      byGroup.set(p.group, [])
      order.push(p.group)
    }
    byGroup.get(p.group)!.push(p)
  }
  return order.map((label) => ({ label, pages: byGroup.get(label)! }))
}

const GROUPS = groupPages()

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Une entrée du menu, en pastille — l'aperçu et le réglage parlent le même. */
function MenuPill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium',
        muted
          ? 'border-dashed border-rule text-muted-foreground'
          : 'border-rule bg-card text-foreground'
      )}
    >
      {children}
    </span>
  )
}

/**
 * Aperçu du menu — la conséquence du réglage, en direct. Une section sans entrée
 * visible reste affichée, éteinte : masquer tout un menu doit se voir, pas se
 * déduire.
 */
function MenuPreview({ hiddenPages }: { hiddenPages: PageKey[] }) {
  return (
    <section className="rounded-xl border border-rule bg-secondary/30 p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Aperçu du menu
        </h2>
        <span className="text-[11px] text-muted-foreground">L'effet de vos choix, en direct.</span>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        {GROUPS.map((group) => {
          const visible = group.pages.filter((p) => !hiddenPages.includes(p.key))
          if (group.label === 'Accès directs') {
            return (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                {visible.map((p) => (
                  <MenuPill key={p.key}>{p.label}</MenuPill>
                ))}
                {visible.length === 0 && <MenuPill muted>barre sans accès direct</MenuPill>}
              </div>
            )
          }
          return (
            <div key={group.label} className="flex flex-col gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[12px] font-semibold',
                  visible.length > 0 ? 'text-foreground' : 'text-muted-foreground/70'
                )}
              >
                {group.label}
                <ChevronDown size={12} strokeWidth={2.25} className="text-muted-foreground" />
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {visible.map((p) => (
                  <MenuPill key={p.key}>{p.label}</MenuPill>
                ))}
                {visible.length === 0 && <MenuPill muted>aucune entrée</MenuPill>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Sous-vue : une puce qui *est* l'onglet — allumée = gardé. */
function SubviewChip({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string
  on: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border px-2.5 text-[11.5px] font-medium transition-colors',
        on
          ? 'border-transparent bg-secondary text-foreground hover:bg-secondary/70'
          : 'border-dashed border-rule text-muted-foreground line-through hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent'
      )}
    >
      {label}
    </button>
  )
}

export default function Vues() {
  const prefs = useViewPrefsStore((s) => s.prefs)
  const setPageHidden = useViewPrefsStore((s) => s.setPageHidden)
  const setSubviewHidden = useViewPrefsStore((s) => s.setSubviewHidden)
  const reset = useViewPrefsStore((s) => s.reset)

  const [saveState, setSaveState] = useState<SaveState>('idle')

  const isDefault = prefs.hiddenPages.length === 0 && prefs.hiddenSubviews.length === 0
  const hiddenCount = prefs.hiddenPages.length + prefs.hiddenSubviews.length

  // Persistance debounce. On saute le premier passage : il correspond au seed
  // depuis les props serveur, pas à une édition.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSaveState('saving')
    const timer = setTimeout(() => {
      fetch('/api/v1/user/view-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(prefs),
      })
        .then((r) => (r.ok ? undefined : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(() => setSaveState('saved'))
        .catch(() => {
          setSaveState('error')
          toast.error("Échec de l'enregistrement des préférences de vues")
        })
    }, 500)
    return () => clearTimeout(timer)
  }, [prefs])

  return (
    <AppLayout title="Vues" active="config" subtitle="Configuration · Vues" theme="airbnb">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-6">
        <ConfigNav active="vues" />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-fraunces text-[24px] font-extrabold leading-none tracking-tight">
              Vues
            </h1>
            <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
              Choisissez les pages et les vues que vous gardez. Le réglage est enregistré sur votre
              compte : il vous suit d'une machine à l'autre, et rien n'est définitif — vous le
              rétablissez ici.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <SaveBadge state={saveState} hiddenCount={hiddenCount} />
            {!isDefault && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
                title="Tout réafficher (pages et sous-vues)"
              >
                <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
                Tout réafficher
              </button>
            )}
          </div>
        </header>

        <MenuPreview hiddenPages={prefs.hiddenPages} />

        <div className="overflow-hidden rounded-xl border border-rule bg-card shadow-float">
          {GROUPS.map((group, gi) => {
            const visibleCount = group.pages.filter(
              (p) => !prefs.hiddenPages.includes(p.key)
            ).length
            return (
              <section key={group.label} className={cn(gi > 0 && 'border-t border-rule')}>
                <header className="flex items-baseline gap-2 bg-secondary/40 px-5 py-2">
                  <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    {group.label}
                  </h2>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                    {visibleCount}/{group.pages.length}
                  </span>
                </header>

                <div>
                  {group.pages.map((page) => {
                    const pageVisible = !prefs.hiddenPages.includes(page.key)
                    return (
                      <div
                        key={page.key}
                        className={cn(
                          'flex flex-col gap-2 border-b border-rule-soft px-5 py-3.5 transition-colors last:border-b-0 sm:flex-row sm:items-center sm:gap-4',
                          !pageVisible && 'bg-secondary/20'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'text-[13.5px] font-semibold',
                                pageVisible ? 'text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {page.label}
                            </span>
                            {page.pinned && (
                              <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                épinglé
                              </span>
                            )}
                          </div>

                          {page.subviews.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {page.subviews.map((sub) => {
                                const on =
                                  pageVisible &&
                                  !prefs.hiddenSubviews.includes(`${page.key}:${sub.key}`)
                                return (
                                  <SubviewChip
                                    key={sub.key}
                                    label={sub.label}
                                    on={on}
                                    disabled={!pageVisible}
                                    onClick={() => setSubviewHidden(page.key, sub.key, on)}
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <Switch
                          checked={pageVisible}
                          disabled={page.pinned}
                          onCheckedChange={(on) => setPageHidden(page.key, !on)}
                          aria-label={`Afficher la page ${page.label}`}
                          className="shrink-0"
                        />
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}

/** État d'enregistrement — discret, mais il dit que c'est bien parti en base. */
function SaveBadge({ state, hiddenCount }: { state: SaveState; hiddenCount: number }) {
  if (state === 'error') {
    return (
      <span className="text-[11px] font-semibold text-destructive">Enregistrement impossible</span>
    )
  }
  if (state === 'saving') {
    return <span className="text-[11px] text-muted-foreground">Enregistrement…</span>
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ferme">
        <Check size={12} strokeWidth={2.5} aria-hidden="true" />
        Enregistré
      </span>
    )
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      {hiddenCount === 0
        ? 'Tout est affiché'
        : `${hiddenCount} masqué${hiddenCount > 1 ? 's' : ''}`}
    </span>
  )
}
