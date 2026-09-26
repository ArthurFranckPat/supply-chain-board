/**
 * Configuration des vues (pages du menu + sous-vues) — préférences par
 * utilisateur, persistées en base (`users.view_prefs`).
 *
 * Choix de conception :
 *  • on coche ce qu'on VEUT VOIR ; le défaut est tout visible, et une page
 *    ajoutée plus tard apparaît sans reparamétrage (on persiste les masqués) ;
 *  • le Tableau de bord est épinglé (page d'accueil) — non décochable ;
 *  • masquer une page la retire du menu ET de la route (le middleware renvoie
 *    vers une page visible) ; masquer une sous-vue retire son onglet et replie
 *    l'écran sur la première sous-vue visible ;
 *  • l'écriture est un PATCH debounce — retour visuel immédiat (store), le
 *    serveur reste la vérité.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import ConfigNav from '@r/components/config/config-nav'
import { Switch } from '@r/components/ui/switch'
import { cn } from '@r/lib/utils'
import { PAGES, type PageDef, type PageKey } from '@r/lib/view-prefs/registry'
import { useViewPrefsStore } from '@r/lib/view-prefs/store'

/** Une ligne de réglage : libellé (+ explication) à gauche, interrupteur à droite. */
function SettingRow(props: {
  id: string
  title: string
  description?: string
  checked: boolean
  disabled?: boolean
  indent?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-6 border-b border-rule-soft px-5 py-4 last:border-b-0',
        props.indent && 'bg-secondary/20 pl-11'
      )}
    >
      <div className="min-w-0">
        <label
          htmlFor={props.id}
          className={cn(
            'text-[13px] font-bold text-foreground',
            props.disabled ? 'cursor-default opacity-60' : 'cursor-pointer'
          )}
        >
          {props.title}
        </label>
        {props.description ? (
          <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>
      <Switch
        id={props.id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}

export default function Vues() {
  const prefs = useViewPrefsStore((s) => s.prefs)
  const setPageHidden = useViewPrefsStore((s) => s.setPageHidden)
  const setSubviewHidden = useViewPrefsStore((s) => s.setSubviewHidden)
  const reset = useViewPrefsStore((s) => s.reset)

  const [saveError, setSaveError] = useState(false)

  // Les sections gardent l'ordre du registre (et non l'ordre alphabétique).
  const groups = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, PageDef[]>()
    for (const p of PAGES) {
      if (!byGroup.has(p.group)) {
        byGroup.set(p.group, [])
        order.push(p.group)
      }
      byGroup.get(p.group)!.push(p)
    }
    return order.map((group) => ({ group, pages: byGroup.get(group)! }))
  }, [])

  const isDefault = prefs.hiddenPages.length === 0 && prefs.hiddenSubviews.length === 0

  // Persistance debounce. On saute le premier passage : il correspond au seed
  // depuis les props serveur, pas à une édition.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const timer = setTimeout(() => {
      fetch('/api/v1/user/view-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(prefs),
      })
        .then((r) => (r.ok ? undefined : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(() => setSaveError(false))
        .catch(() => {
          setSaveError(true)
          toast.error('Échec de la sauvegarde des préférences de vues')
        })
    }, 500)
    return () => clearTimeout(timer)
  }, [prefs])

  return (
    <AppLayout title="Vues" active="config" subtitle="Configuration · Vues" theme="airbnb">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6">
        <ConfigNav active="vues" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 font-fraunces text-[24px] font-extrabold tracking-tight">Vues</h1>
            <p className="text-[13px] text-muted-foreground">
              Choisissez les pages et les vues que vous voulez dans l'application. Ce réglage est
              enregistré <b className="text-foreground">sur votre compte</b> (en base) et suit votre
              identité d'une machine à l'autre. Masquer une page la retire du menu et rend son
              adresse inaccessible ; vous la rétablissez ici à tout moment.
            </p>
          </div>
          {!isDefault && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
              title="Tout réafficher (menu et sous-vues)"
            >
              <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
              Tout réafficher
            </button>
          )}
        </div>

        {saveError && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-[12.5px] font-medium text-destructive">
            La dernière modification n'a pas pu être enregistrée. Réessayez.
          </p>
        )}

        {groups.map(({ group, pages }) => (
          <section
            key={group}
            className="overflow-hidden rounded-xl border border-rule bg-card shadow-float"
          >
            <header className="border-b border-rule bg-secondary px-5 py-2.5">
              <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {group}
              </h2>
            </header>

            {pages.map((page) => {
              const pageVisible = !prefs.hiddenPages.includes(page.key)
              return (
                <div key={page.key}>
                  <SettingRow
                    id={`vue-page-${page.key}`}
                    title={page.label}
                    description={
                      page.pinned
                        ? "Page d'accueil : toujours visible."
                        : page.subviews.length > 0
                          ? `La masquer retire aussi ses ${page.subviews.length} vues.`
                          : undefined
                    }
                    checked={page.pinned ? true : pageVisible}
                    disabled={page.pinned}
                    onChange={(on) => setPageHidden(page.key as PageKey, !on)}
                  />
                  {page.subviews.map((sub) => (
                    <SettingRow
                      key={sub.key}
                      id={`vue-sub-${page.key}-${sub.key}`}
                      title={sub.label}
                      indent
                      checked={
                        pageVisible && !prefs.hiddenSubviews.includes(`${page.key}:${sub.key}`)
                      }
                      disabled={!pageVisible}
                      onChange={(on) => setSubviewHidden(page.key as PageKey, sub.key, !on)}
                    />
                  ))}
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </AppLayout>
  )
}
