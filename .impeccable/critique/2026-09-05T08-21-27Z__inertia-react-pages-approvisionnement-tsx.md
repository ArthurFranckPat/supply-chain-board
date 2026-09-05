---
target: Page Approvisionnement (capture + code approvisionnement.tsx)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-05T08-21-27Z
slug: inertia-react-pages-approvisionnement-tsx
---
# Critique UX/UI — page « Approvisionnement » (inertia-react/pages/approvisionnement.tsx)

Méthode : dual-agent — A revue design (sous-agent isolé), B détecteur déterministe (sous-agent isolé), recoupées par le parent avec le code source.

## Score de santé design (heuristiques de Nielsen) — 23/40 (Acceptable)

| # | Heuristique | Score | Problème clé |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Re-fetch réduit à un chrono mono 12 px ; plan périmé ni filigrané ni daté (`computedAt` jamais affiché) |
| 2 | Correspondance au métier | 3 | « Reste à couvrir » / « Manques seuls » / « 205 manques » : trois noms pour un concept |
| 3 | Contrôle et liberté | 2 | URL sans cran/tri/filtres ; ni export ni vue sauvegardée |
| 4 | Consistance | 2 | Trois bleus pour trois concepts ; langue mixte FR/EN (« Settings », « Quick Search ») |
| 5 | Prévention des erreurs | 3 | Plafond 14 périodes bien traité avant fetch ; fenêtre libre accepte des dates passées sans avertissement |
| 6 | Reconnaissance | 2 | État de 6 filtres résumé par un point 1,5 px ; tri courant invisible sans rouvrir le menu |
| 7 | Flexibilité/efficacité | 1 | Zéro raccourci clavier, zéro export, zéro vue nommée |
| 8 | Esthétique/minimalisme | 3 | Colonne Type : « ● Acheté » × 1118 (~110 px) ; badge « net » redondant avec le segment actif |
| 9 | Récupération d'erreur | 2 | `x3Error` mono brut au-dessus d'un plan peut-être périmé ; ⟳ hors champ (bas de sidebar) |
| 10 | Aide | 2 | Sémantique des crans, normalisation « par ligne » de la chaleur, PMP : tout au survol |

Heuristiques n/a : aucune (mode Operate, dashboard data-heavy — 7 et 10 applicables).

## Verdict de spécificité design

Spécifique là où elle lit (en-têtes Ferme/Prév. deux rangées, crans Brut/Net/Reste, chaleur par ligne, drawer « appelé par » avec chemin nomenclature), générique là où elle agit (aucune sortie : export, demande d'achat, lien Ruptures). Scan déterministe : 0 finding (exit 0) — les faiblesses sont structurelles, pas des anti-patterns de markup. Overlays navigateur : non tentés (aucun outil d'injection web ; Playwright interdit par AGENTS.md) ; vérité visuelle = capture utilisateur recoupée avec le code.

## Problèmes prioritaires

1. **P1 — La page observe mais ne permet rien.** Ni export XLSX, ni demande d'achat, ni lien Ruptures. Fix : « Exporter » épinglé toolbar (filtres + cran courants, totaux inclus) ; drawer : « Créer une demande X3 » pré-remplie + « Voir dans Ruptures ».
2. **P1 — La vue par défaut répond à la mauvaise question.** Tri « Valorisation » = valeur du stock → zéros en tête, 205 manques dispersés, « Manques seuls » à deux clics, chip rose non cliquable. Fix : tri défaut « reste à couvrir décroissant » (ou manque valorisé reste × PMP), « Manques seuls » en toggle près de la chip, chip cliquable.
3. **P1 — Formatage des nombres détruit la confiance.** Footer Stock « 19167288,200000003 » (float brut, `fr()` ligne 230 = simple replace '.'→','), « 892436,93 » sans grouping, stocks sans séparateurs. Fix : `Intl.NumberFormat('fr-FR')` partout, totaux arrondis, bannir `toString()`.
4. **P2 — Drill-down inaccessible au clavier.** Drawer « appelé par » ouvert uniquement par `<tr onClick>` (data-table.tsx), ⚠ span non focusable, PMP en `title`. Fix : bouton sur le code article, `aria-selected`, focusables.
5. **P2 — Plan périmé non identifiable.** Hors plafond/re-fetch : ancien plan plein écran sous toolbar énonçant la nouvelle sélection ; `computedAt`/`truncated` dans le payload, jamais rendus. Fix : tampon « plan du … » + désaturation quand plan ≠ sélection.

## Ce qui marche

1. En-têtes de périodes à deux rangées (groupe fusionné, sous-colonnes Ferme/Prév. triables, filet de groupe).
2. Carte de chaleur normalisée par ligne, plafonnée 18 % — quand sans écrasement des gros volumes.
3. Doctrine du plafond 14 périodes : désactivation avant fetch, maille effective en ambre + raison au survol, bandeau « dernier plan affiché ».

## Red flags par personna

- **Alex (expert clavier)** : zéros en tête de sa question ; copier-coller manuel vers Excel ; nombres sans séparateurs ; URL ne partageant pas l'état ; aucun raccourci malgré ⌘L affiché.
- **Sam (accessibilité)** : drawer central hors clavier ; manque signalé par la seule couleur rose ; ⚠ muet au focus/lecteur d'écran.
- **Riley (stress)** : deux vérités contradictoires hors plafond ; tri qui disparaît silencieusement au repli des périodes vides ; colonne coupée au bord droit lue « 1 » pour « 1 xxx » sans fade.

## Observations mineures

Trois bleus concurrents (accent-500, status-blue, indigo) ; « Settings »/« Quick Search » en dur en anglais (dashboard-sidebar.tsx) ; « Total net » non figé à gauche ; périmètre du pied « Total » non étiqueté (lignes filtrées) ; « 1118 composants » devrait dire « achetés » ; légende de chaleur sans explication de la normalisation ; Ferme 88 px / Prév. 72 px asymétriques ; aucun H1 visible (hideMasthead) ; triptyque KPI du drawer à trois traitements différents.

## Questions à considérer

- Après « 205 manques », le doigt du planificateur atterrit où ?
- Pourquoi le tri par défaut fait-il lire d'abord ce qui ne manque pas ?
- Quelle confiance pour un achat à 300 k€ sur un écran dont le pied affiche « 19167288,200000003 » ?
- Le vrai format de sortie est-il la vue partagée + export, ou le screenshot Slack ?
