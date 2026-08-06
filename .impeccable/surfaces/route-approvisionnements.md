---
version: 1
slug: "route-approvisionnements"
primary_target: "route:/approvisionnements"
related_targets: ["inertia-react/pages/approvisionnements.tsx"]
---

# Surface brief — /approvisionnements

<!-- impeccable:surface-brief 1 -->

## Scope & mode

- Cible primaire : route `/approvisionnements` (`inertia-react/pages/approvisionnements.tsx`).
- Mode visiteur : **Operate** — l'acheteur/planificateur complète une tâche de triage.
- Monde visuel : hérite la grammaire Airbnb établie (DESIGN.md). Refonte de la
  structure de la page, pas du système visuel du produit.

## Audience & job

Acheteurs / ordonnancement du site AE1. Écran consulté en continu dans la
journée : ce que le CBN de X3 propose côté achat doit être trié vite —
suggestions d'achat à commander, et messages de replanification sur commandes
déjà passées (avancer / retarder / inutile).

## Task & actions

- Lire le verdict du moteur déterministe (`appro_triage.ts` : passer /
  surveiller / regrouper / replanifier / investiguer) avec sa preuve sourcée.
- Décider par ligne : Vu / Ignorer / À passer (ledger append-only #134,
  POST `/api/v1/appro/decision`).
- Filtrer par nature (tout / à commander / à replanifier) — les compteurs des
  segments restent globaux.
- Basculer l'horizon : dérivé du délai de réappro (#114, défaut) ou fenêtres
  fixes 30 / 60 / 90 j (navigation serveur).

## Content & proof

Verdicts + preuves du moteur ; échéance + jours ; date proposée + décalage ;
délai de réappro OFS_0 (non renseigné = signal danger, repli 14 j). Les labels
de verdicts restent une hypothèse de travail à valider en atelier acheteurs :
l'échéance brute est toujours affichée à côté.

## Constraints

- Le **fournisseur est la maille métier** : une commande est réellement passée
  à ce niveau — le groupement n'est pas cosmétique.
- Dates jj/mm/aaaa, jamais d'ISO brut ; chiffres en tabular-nums.
- Un POST de décision refusé doit se voir (« non enregistré — réessayer »).
- Rausch absent de cette page : aucun CTA ; les micro-décisions actives sont
  en encre pleine, les segments de toolbar suivent la grammaire vision/toolbar.
- Tri d'affichage seulement (échéance croissante) : jamais de mutation de la
  donnée serveur.

## Direction choisie

**Feuille de préparation fournisseur** (seed 69c2b364, mode operate, candidat 7
de la liste ordonnée). Pile de feuilles blanches toujours ouvertes sur champ
surface-soft, la plus urgente en premier ; chaque feuille porte ses sections
« À commander » / « À replanifier », ses verdicts en pastille + petites
capitales, et un pied « Décisions x/y enregistrées ». Moment mémorable : un
dossier entièrement décidé quitte la pile et descend dans l'index repliable
« Dossiers traités » — la file se vide à vue.

## Open questions

- Labels de verdicts à valider en atelier acheteurs (#103).
- Impression A3 non demandée sur cette surface (board et ruptures seulement).
