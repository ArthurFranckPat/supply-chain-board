import type { Component } from 'solid-js'
import { Masthead } from '@/components/masthead'

/**
 * Issue #26 — Tableau de bord (landing par défaut après login).
 *
 * Page d'atterrissage post-authentification : remplace l'ancienne page `home`
 * (squelette « Infra SolidJS + Inertia opérationnelle » perçu comme vide).
 * Pour l'heure c'est un placeholder thémé ; l'overview avec KPI sera construit
 * dans une issue dédiée.
 */
const Tableau: Component = () => {
  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead subtitle="Tableau de bord · Overview" active="tableau" />
      <div class="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <span class="material-symbols-outlined text-[40px] text-muted-foreground/60">dashboard</span>
        <h1 class="font-fraunces text-[20px] font-black tracking-tight text-foreground">
          Overview KPI
        </h1>
        <p class="max-w-md font-fraunces text-[13px] italic text-muted-foreground">
          Tableau de bord à venir — indicateurs de pilotage (OF, commandes, ruptures, postes).
        </p>
      </div>
    </div>
  )
}

export default Tableau
