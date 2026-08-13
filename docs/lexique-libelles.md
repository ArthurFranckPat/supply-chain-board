# Lexique — libellés UI vs vocabulaire du repo

Les libellés affichés (sidebar, titre de page, URL française) et les noms du
code (dossiers, types, routes Adonis, tables X3) **ne coïncident pas**. Chercher
le mot de l'écran dans le repo rate souvent le module. Ce document est la
carte, pas un plan de rename.

Convention : `libellé UI → vocabulaire code`. Une flèche = un écart réel, pas
un synonyme innocent.

## 1. Collisions à connaître

Lire cette section avant de grep.

### Programme → vision

La page s'appelle **Programme**, l'URL est `/programme`, le contrôleur
`SchedulerController.programme` charge via `loadProgrammeData`. Le module
front, lui, s'appelle encore **vision** (issue #21, ex-URL `/vision`) :

| Couche | Nom réel |
| ------ | -------- |
| Sidebar / `<title>` | Programme / Programme de fabrication |
| URL / route | `/programme` · `scheduler.programme` |
| Page Inertia | `scheduler/programme` |
| Types / géométrie | `inertia-react/lib/vision/*` (`VisionMode`, `VisionCommande`, `VisionLink`…) |
| Composants | `inertia-react/components/vision/*` |
| Contrôleur (types internes) | `VisionCommande`, `VisionLink` dans `scheduler_controller.ts` |
| Commentaire périmé | `lib/vision/types.ts` cite encore `loadVisionData()` — la méthode s'appelle `loadProgrammeData` |
| PRD | `docs/prd-23-impacts-programme.md` : « `/programme` (ex-`/vision`) » |

`docs/vision-scenarios-impacts.md` parle d'une **vision produit** (étude
d'impact) — autre sens du mot, sans rapport avec le dossier `lib/vision/`.

### Planification — trois objets distincts

Le même mot français désigne trois choses. Les confondre envoie sur la
mauvaise page.

| Sens | Où | Code |
| ---- | -- | ---- |
| **Nav « Planification »** | sidebar, section Suivi | URL `/charge` · route `load.index` · page `scheduler/load` · `lib/load/` · `LoadController` |
| **Mode « planification »** du Programme | chip « Cmdes » sur `/programme` | `VisionMode = 'planification'` · query `?mode=planification` · `orderBoard` / `lib/orders/` |
| **Ancienne URL `/planification`** | redirect | route nommée `planning` → `/programme?mode=planification` |

Conséquences :

- Grep `planification` tombe sur le **mode commandes** du Programme, pas sur
  la page Charge.
- Grep `load` tombe sur la page dont le libellé est **Planification**.
- L'API JSON de presque tout le board vit sous `/api/v1/planning` — troisième
  « planning », anglais, fourre-tout (OF, ruptures, scénarios, cockpit…).

Le titre de la page `/charge` n'est d'ailleurs ni « Planification » ni
« Charge » seul : `<title>` = « Charge · Projection », fil d'Ariane =
« Charge / Capacité ».

### Suivi commandes → tracking + status

| Couche | Nom |
| ------ | --- |
| Sidebar | Suivi commandes |
| `<title>` / fil | Suivi / Suivi Commandes |
| URL | `/suivi` |
| Route page | `suivi.board` |
| NavKey | `tracking` |
| Page | `pages/scheduler/tracking.tsx` |
| Composants | `components/tracking/` |
| Lib | `lib/suivi/` **et** `lib/orders/` (store des lignes) |
| API | `/api/v1/status/*` (`suivi.rows`, `suivi.proactive_rows`…) |
| Domaine | `app/domain/suivi.ts` |

Deux vues internes, libellés FR / fichiers EN :

- **Réactif** → `reactive-view.tsx` / `reactive-columns.tsx` (as-is allocation)
- **Proactif** → `proactive-view.tsx` / `proactive-columns.tsx` (réalisabilité)

### Ruptures → shortage

| Couche | Nom |
| ------ | --- |
| Sidebar | Ruptures composants |
| Fil | Ruptures · Couverture composants |
| URL | `/ruptures` |
| Route | `scheduler.shortage_tracker` |
| Page | `scheduler/shortages` |
| Lib / composants | `lib/shortages/`, `components/shortages/` |
| API | `/api/v1/planning/shortages/rows` |
| Domaine | `shortages.ts` **et** `rupture_engine.ts` (moteur unique, consommé aussi par le board et le proactif) |

### Copilote → agent

Sidebar / URL `/copilote` · page `copilote.tsx` · `lib/copilote/` ·
`components/copilote/`. Contrôleur et routes : `AgentController`,
`agent.show`, `/api/v1/agent/*`.

### Promesse → promise

Sidebar / URL `/promesse` · page `promesse.tsx` · `lib/promesse/`.
Contrôleur : `PromiseController`. Sous-titre UI : « Capable-to-Promise —
date au plus tôt » (CTP, anglais métier).

### Affermir → firm

L'atelier dit **affermir** (suggestion CBN → OF ferme). Le code dit `firm` :
`suggestion_firm_controller`, routes `planning.order_firm` /
`planning.suggestion_firm`, `BatchFirmBar`, `sequenceur-firm-bar`,
`isFirm()`, champ `firm?: boolean` sur une réception. Statut d'OF **Ferme**
(WIPSTA=1) ≠ verbe affermir, mais le code mélange les deux (`firm` partout).

## 2. Surfaces — table de correspondance

NavKey = clé `active` du layout = `MastheadTab` (deux types, même ensemble).

### Socle (`master`)

| Sidebar | Fil d'Ariane | URL | Route Adonis | Page Inertia | Module front | Contrôleur |
| ------- | ------------ | --- | ------------ | ------------ | ------------ | ---------- |
| Tableau de bord | Tableau de bord | `/` | `dashboard` | `dashboard` | `lib/dashboard/` | `DashboardController` |
| Programme | Programme de fabrication | `/programme` | `scheduler.programme` | `scheduler/programme` | `lib/vision/` + `lib/board/` | `SchedulerController` |
| Séquenceur | Séquenceur | `/sequenceur` | `sequenceur.index` | `scheduler/sequenceur` | `lib/sequenceur/` | `SchedulerController` |
| Ruptures composants | Ruptures · Couverture composants | `/ruptures` | `scheduler.shortage_tracker` | `scheduler/shortages` | `lib/shortages/` | `SchedulerController` |
| Suivi commandes | Suivi Commandes | `/suivi` | `suivi.board` | `scheduler/tracking` | `lib/suivi/` | `SuiviController` |
| Planification | Charge / Capacité | `/charge` | `load.index` | `scheduler/load` | `lib/load/` | `LoadController` |
| Config | Calendrier usine · YYYY | `/configuration/calendrier` | `calendar_config.index` | `config/calendrier` | — | `CalendarConfigController` |
| (sous-nav Config) | Routage des impressions d'OF | `/configuration/impressions` | `print_config.index` | `config/impressions` | — | `PrintConfigController` |
| (journal) | Journal des tirages | `/impressions` | `print_journal` | `impressions` | — | `PrintJournalController` |
| (scénarios) | Programme · Scénarios | `/programme/scenarios/comparer` | `scenarios.compare` | `scheduler/comparer` | `lib/scenario/` + `lib/scenarios/` | `ScenarioController` |

`lib/scenario/` (store) et `lib/scenarios/` (types) : deux dossiers pour le
même objet.

### Hors socle (`dev`)

| Sidebar | Fil d'Ariane | URL | Route | Page | Module | Contrôleur |
| ------- | ------------ | --- | ----- | ---- | ------ | ---------- |
| Contrôle prod | Erreurs déclarations OF | `/controle-prod` | `controle_prod.index` | `scheduler/controle-prod` | — | `ControleProdController` |
| Cockpit poste | Production constatée et engagement… | `/cockpit` | `cockpit.index` | `cockpit/poste` | `components/cockpit/` | `CockpitController` |
| Expéditions | Expéditions · Livraisons client | `/expeditions` | *(auto)* | `expeditions` | `lib` absent, `components/expeditions/` | `ExpeditionsController` |
| Réceptions | Réceptions · Commandes fournisseurs | `/receptions` | `receptions.index` | `receptions` | `lib/receptions/` | `ReceptionsController` |
| Approvisionnements | Approvisionnements · Suggestions du CBN | `/approvisionnements` | `approvisionnements.index` | `approvisionnements` | `components/appro/` | `ApproController` |
| Évolution des besoins | Évolution des besoins | `/besoins/evolution` | `besoins.evolution` | `besoins-evolution` | — | `ApproController.evolution` |
| Conditionnements | Conditionnements · Rattrapage référentiel | `/conditionnements` | `conditionnements.index` | `conditionnements` | `lib/conditionnements/` | `ConditionnementsController` |
| Promesse | Capable-to-Promise — date au plus tôt | `/promesse` | `promesse.show` | `promesse` | `lib/promesse/` | `PromiseController` |
| Copilote | Copilote supply — lecture seule | `/copilote` | `agent.show` | `copilote` | `lib/copilote/` | `AgentController` |

Pages de lab (pas dans la sidebar) : `/design-system`, `/react-lab`,
`/print-test`, write-back test, diagnostic test.

### Redirects hérités (toujours montés)

| URL morte | Route nommée | Destination |
| --------- | ------------ | ----------- |
| `/ordonnancement` | `scheduling` | `/programme` |
| `/planification` | `planning` | `/programme?mode=planification` |

Le commentaire au-dessus de ces routes dans `start/routes.ts` liste encore
`/vision` comme page courante. Ce n'est plus une route.

## 3. Modes et vues internes

### Programme — trois modes, cinq noms

`VisionMode` : `'ordonnancement' | 'combined' | 'planification'`.

| Valeur code | Chip UI | Tooltip | Raccourci | Contenu |
| ----------- | ------- | ------- | --------- | ------- |
| `ordonnancement` | OF | Mode Ordonnancement — OF seuls | `1` | board OF, sans liens |
| `combined` | Combiné | Mode Combiné — OF + liens commandes + impacts | `2` | calques vision (marqueurs + overlay) |
| `planification` | Cmdes | Mode Commandes — planification par ligne de commande | `3` | `orderBoard`, pas le board OF |

« Ordonnancement » est **aussi** le libellé de la **section** sidebar qui
groupe Programme, Séquenceur, Ruptures (et sur `dev` Contrôle prod + Cockpit).
Le mode `ordonnancement` n'est pas cette section.

### Charge — deux vues, mêmes lettres de série

Chips `OF` / (demande). Segments OF : Ferme / Planifié / Suggéré (`f`/`p`/`s`).
Segments demande : Commande / Prévision — **mêmes clés** `f`/`s`, libellés
différents (`chart-math.ts`). Filtrer « Prévision » doit retirer l'induit
`si`, sinon charge orpheline.

### Ruptures — deux vues d'une même donnée

Registre (une ligne composant × OF) · Par composant (agrégation dégâts).

## 4. Couches de nommage — le pattern

Cinq strates, souvent cinq mots :

```
libellé FR  →  URL FR  →  route Adonis (EN/FR mixte)  →  dossier héritage EN  →  X3
Programme   →  /programme  →  scheduler.programme  →  lib/vision + pages/scheduler  →  MFGHEAD / ORDERS WIPTYP=5
Planification (nav) → /charge → load.index → lib/load → WORKSTATIO + ORDERS
Suivi commandes → /suivi → suivi.board → pages/scheduler/tracking + /api/v1/status → SORDER / ORDERS WIPTYP=1
```

Le dossier `pages/scheduler/` est un fourre-tout d'avant la fusion des vues
(programme, sequenceur, shortages, tracking, load, comparer, controle-prod).
Ce n'est plus un module « scheduler » unique — `SchedulerController` sert
Programme, Séquenceur et Ruptures, pas le Suivi ni la Charge.

`NavKey` et `MastheadTab` sont le même union type sous deux noms (le masthead
horizontal n'est plus le chrome principal ; la sidebar l'a remplacé).

## 5. Objets métier ↔ X3 ↔ code

| UI / métier | Code courant | X3 (tables / champs) | Piège |
| ----------- | ------------ | -------------------- | ----- |
| OF | `of`, `ofs`, `numOf` | `MFGHEAD` / `ORDERS` WIPTYP=5, `VCRNUM` | `orders` dans X3 = file unique, pas « commandes » |
| Commande (ligne) | `commande`, `order`, `order-lines` | `SORDER`/`SORDERQ`, `ORDERS` WIPTYP=1 WIPSTA=1 | `nature: 'commande' \| 'prevision'` ; le board émet parfois `COMMANDE` (casse) |
| Prévision | `prevision`, `forecast` | `ORDERS` WIPTYP=1 WIPSTA=3, `VCRLIN=0` | pas de `SORDER` derrière → pas de lien X3 GESSOH |
| Suggestion CBN (OF) | `suggere`, `sugNum` | OF WIPSTA=3 | affermissement → `planning.suggestion_firm` |
| Suggestion d'achat | file `/approvisionnements` | `ORDERS` WIPTYP=2 WIPSTA=3 | `ApproController`, API `/api/v1/appro` |
| Commande d'achat / réception | `reception`, PO | `PORDER`/`PORDERQ`, `ORDERS` WIPTYP=2 | page Réceptions ≠ Approvisionnements |
| Poste | `poste`, `wst`, `workstation` | `WORKSTATIO.WST_0` | modèle Lucid `workstatio.ts` (troncature X3) |
| Atelier | `atelier`, `stoloc` | `WORKSTATIO.STOLOC_0` | l'atelier est un **emplacement**, pas une entité X3 |
| Article / PF / SF | `article`, `pf`, `ITM` | `ITMMASTER` ; catégorie `PF*` / `SF*` | nature de poste dérivée des catégories d'articles de gamme |
| Nomenclature | `bom`, `nomenclature` | `BOM` / `BOMD` | `descendreBOM` (copilote) garde l'anglais |
| Gamme | `gamme`, `rou` | `ROUOPE` | |
| Besoin matière | `component`, `mfgmat` | `MFGMAT`, `ORDERS` WIPTYP=6 | |
| Stock | `stock`, `stoall` | `STOCK` / `STOALL` | statuts Q (CQ) vs A (accepté) |
| Peg / contremarque | `peg`, `method: 'peg'` | lien X3 OF↔commande | le matcher maison (`CommandeOFMatcher`) est la source de vérité du board ; le peg est un repli |
| Flow | — (pas de libellé UI) | — | modèle central domaine : tout mouvement est un `Flow` supply/demand |

## 6. Statuts X3

`WIPTYP` = nature de ligne dans `ORDERS`. `WIPSTA` = statut.

| WIPTYP | Métier | UI |
| ------ | ------ | -- |
| 1 | demande client | Commande / Prévision |
| 2 | achat (réception / suggestion) | Réceptions, Approvisionnements |
| 5 | OF (article) | Programme, Séquenceur |
| 6 | besoin matière d'OF | diagnostic, ruptures, expl. appro |

| WIPSTA (sur OF, WIPTYP=5) | UI | Code |
| ------------------------- | -- | ---- |
| 1 | Ferme | `ferme`, `isFirm()`, `firm` |
| 2 | Planifié | `planifie`, `planned` |
| 3 | Suggéré | `suggere`, `suggested` |

`isPlannable` = {1,2,3} — « plannable » ici = visible au board, pas « en
mode planification ».

Sur une demande (WIPTYP=1) : WIPSTA=1 → Commande, WIPSTA=3 → Prévision.
Même entier, autre libellé.

## 7. Verbes et objets transverses

| UI | Code | Notes |
| -- | ---- | ----- |
| Faisabilité | `feasibility`, `of_feasibility`, `board-feasibility` | moteur unique `rupture_engine.ts` |
| Impact (retard OF↔cmd) | `lib/vision/impact.ts`, `order_impacts.ts` | issue #23, verdict `ok` / `limite` / `retard` |
| Scénario | `scenario` / `scenarios` (deux dossiers front) | vision étage 3, mutations non appliquées |
| Override | `OfOverride`, `OrderLineOverride` | SQLite locale, fusionnée sur X3 |
| Engagement (poste) | `posteEngagement`, `engagement-format` | OF fermes du poste + commandes liées |
| Charge | `charge`, `load`, `charge_explosion` | heures poste ; distinct de « charge en retard » (KPI dashboard) |
| Capacité | `capacity.ts`, `weekCaps` | nette, calendrier usine |
| Replica | `REPLICA_READS`, `replica_sync` | architecture, pas un libellé UI |
| Board | `lib/board/`, `BoardGrid`, `papier-board` | « board » = grille poste × jour, pas le nom de la page |
| Go to… | TopBar, non branché | décoratif (`quietChrome` le masque sur les boards) |
| Operate / Pulse / Airbnb / Cursor | commentaires de thème | noms de maquettes, pas de routes |

## 8. Identifiants périmés (ne plus suivre)

- Commentaire `start/routes.ts` : « `/vision` : vue unifiée » — la route n'existe
  plus ; c'est `/programme`.
- `lib/vision/types.ts` : `SchedulerController.loadVisionData()` — renommé
  `loadProgrammeData`.
- `papier-board.tsx` : coquille de grille vide, pas le board OF réel
  (`board-grid.tsx`).
- `components/vision/toolbar.tsx` : encore importé par le dashboard
  (`Segment`, `DateWindowPill`) ; le Programme ne l'utilise plus
  (`Toolbar*` du design system).
- Issue #23 à la rédaction citait `inertia/pages/scheduler/vision.tsx` et
  `/vision?mode=planification` — les deux ont bougé (PRD §2 à jour).

## 9. Ce que ce document n'est pas

Pas un chantier de rename. Aligner `lib/vision` → `lib/programme` toucherait
types exportés, tests (`vision_impact.test.ts`), imports du dashboard, et le
double sens « vision produit » des PRD. Aligner nav « Planification » sur
« Charge » est une décision métier, pas un grep.

Pour un agent : **chercher d'abord dans cette table**, ensuite dans le code.
Le mot de l'écran est le dernier endroit où le module s'appelle comme ça.
