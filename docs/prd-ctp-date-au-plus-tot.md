# PRD — Capable-to-Promise : date de mise à disposition au plus tôt

_Rédigé le 2026-07-15 — état du repo : branche `master` (+ `feat/kpi-valorisation-stock`), moteur de rupture unique (`rupture-engine.ts`, issue #73) en place._

_Issue GitHub à créer (candidate : #78). Ce document est la spécification ; l'issue en sera le résumé._

---

## 1. Le problème, en une scène

La demand planner a un client au téléphone. Le client demande : « votre article `PP_830_X`, 200 pièces, vous me le livrez quand au plus tôt ? ».

Aujourd'hui, pour répondre, elle doit **à la main** :

1. ouvrir la nomenclature de l'article,
2. pour chaque composant, aller regarder le stock, les réceptions attendues, le délai fournisseur,
3. descendre dans les sous-ensembles fabriqués (nomenclature de la nomenclature),
4. prendre le **maximum** des délais de la branche la plus lente,
5. ajouter le délai de fabrication du produit fini.

C'est **long** (10-20 min par article), **fragile** (elle oublie un niveau, une réception, une allocation déjà posée) et le résultat est un **délai peu réaliste** : soit trop optimiste (elle oublie qu'une PO composant est déjà en retard), soit trop conservateur (elle prend le pire délai théorique catalogue au lieu du délai réel observé).

**Ce calcul est exactement un algorithme.** Tous les ingrédients sont déjà chargés dans l'app. Il manque un moteur qui le fait en 200 ms et, surtout, qui **explique** sa réponse (« c'est le composant X qui contraint, appro 45 j, aucune réception en vue »).

---

## 2. Inverser la question — de « cette date tient-elle ? » à « quelle est la première date qui tient ? »

La feature commande virtuelle (#58) existante répond à : _« si je promets pour le JJ/MM, ça passe ? »_ → verdict oui/non/retard à date **fixée**. C'est de l'**ATP fixé** (Available-to-Promise à une date donnée).

La demand planner pose la question **inverse** : _« quelle est la première date à laquelle je peux promettre ? »_ → c'est un problème de **recherche de date**, pas de vérification. Le nom industriel (APICS/CPIM) : **CTP — Capable-to-Promise**.

| | Question | Réponse | Existant ? |
| --- | --- | --- | --- |
| **ATP fixé** | « la date D tient-elle ? » | oui / non / retard +N j | ✅ #58 (commande virtuelle) |
| **CTP** | « quelle est la première date qui tient ? » | **date au plus tôt** + chemin critique | ❌ cette feature |

Les deux sont complémentaires : le CTP **propose** une date, l'ATP la **valide** contre le carnet réel (qui perd quoi si on accepte). On garde les deux, on ne les fusionne pas.

---

## 3. Vocabulaire de sortie (ce que la planner voit)

Pour chaque demande (`article`, `quantité`, `à partir de` = aujourd'hui par défaut), le moteur rend :

- **Date optimiste** — délais **théoriques** catalogue, tous les flux à l'heure, capacité infinie. C'est la borne basse « si tout se passe bien ».
- **Date engageante** — délais fournisseur **corrigés du retard observé** (#43), réceptions déjà en retard prises à leur date réelle probable, capacité du poste goulot respectée (v2), calendrier ouvré. C'est la date qu'elle peut **tenir**.
- **Chemin critique** — la **branche qui contraint** la date : la liste ordonnée des maillons (article → délai → source de dispo) dont dépend la date finale. C'est ce qu'elle reconstitue à la main aujourd'hui.
- **Facteur limitant** — le maillon terminal du chemin critique, formulé en une phrase : _« composant `M_HYGRO_12`, appro fournisseur 45 j, aucune réception attendue → dispo le 28/08 »_.

L'**écart entre date optimiste et date engageante** est l'information qu'elle n'a jamais eue : il chiffre le risque de la promesse.

---

## 4. État du repo — briques réutilisables (rien à réinventer sauf la datation)

Le moteur CTP est un **assembleur** de composants domaine déjà présents et testés. Inventaire précis :

| Brique | Fichier | Ce qu'elle apporte au CTP |
| --- | --- | --- |
| **Moteur de rupture unique** | `app/domain/rupture-engine.ts` | Descente BOM récursive avec règle fantômes AFANT (stock net d'abord, descente du reliquat), plafond `PHANTOM_DEPTH_CAP=5`, repli MFGMAT→nomenclature. **Donne un verdict PHOTO (feasible à l'instant T), PAS une date.** Le CTP réutilise sa logique de descente mais projette dans le temps. |
| **Délai par article** | `static_sync_service.ts:131-136` → `Article.reorderDelay` | `PRPLTI_0` (délai appro achat) / `MFGLTI_0` (délai fab), site AE1 via `ITMFACILIT`, défauts 14 j (achat) / 10 j (fab). C'est le délai **théorique** → date optimiste. |
| **Dispo datée** | `app/domain/availability.ts` (`availableAt`) | Stock à date nulle + réceptions datées selon `DispoPolicy`. Fournit la timeline de couverture par article. |
| **Réceptions attendues + retard** | `app/repositories/reception_repository.ts`, `RECEPTION_OVERDUE_MIN_QTY` (#43) | POs attendues datées, y compris **overdue** (attendues dans le passé, non reçues). Base de la date engageante. |
| **Allocation réelle** | `app/domain/of-conso.ts` (`CommandeOFMatcher`) | La promesse doit se calculer sur le **résiduel non alloué**, pas le stock brut. Un OF ou une réception déjà pegé au carnet ne doit pas être re-promis. |
| **Capacité + calendrier** | `app/domain/capacity.ts` (`capDay`, `capacityPeriod`), `working_calendar.ts` (`buildWorkingCalendar`, fériés/fermetures #35/#37) | Jours ouvrés + capacité poste. Sert la date engageante (v2, jalonnement capacitaire). |
| **Nomenclature** | `app/domain/models/nomenclature.ts` (`Nomenclature.components[]`, `linkQuantity`) | Coefficients de lien pour propager la quantité aux composants. |

**La seule brique réellement neuve** : la **recherche de date au plus tôt** + l'**extraction du chemin critique**. Le reste est du câblage des lookups existants.

---

## 5. Le moteur — `promise-engine.ts` (domaine pur)

### 5.1 Emplacement et contrat

Nouveau fichier `app/domain/promise-engine.ts`, **pur, sans I/O** (même discipline que `plan-diff.ts` / `rupture-engine.ts`). Consomme des lookups injectés (Map ou adapter), testable sur fixtures sans X3.

```ts
export interface PromiseDataset {
  articles: ArticleLookup           // reorderDelay, supplyType (ACHAT/FABRICATION)
  nomenclatures: NomenclatureLookup // BOM par article produit
  stockNet: Map<string, number>     // stock résiduel NON alloué par article
  receptions: Map<string, DatedSupply[]>  // POs attendues datées, non allouées, par article
  ofSupply?: Map<string, DatedSupply[]>   // OF en cours datés, non alloués, par article produit
  calendar?: WorkingCalendar        // jours ouvrés (v2 capacitaire)
  supplierLatency?: Map<string, number>   // retard fournisseur moyen observé, jours (#43) — date engageante
}

export interface DatedSupply {
  date: Date          // arrivée prévue (réception) ou fin (OF)
  quantity: number    // quantité NON allouée disponible à cette date
  source: 'reception' | 'of' | 'stock'
  id: string          // n° PO / n° OF (pour le chemin critique)
}

export interface PromiseRequest {
  article: string
  quantity: number
  from?: Date          // défaut : aujourd'hui
  mode: 'optimiste' | 'engageante'
}

export interface PromiseNode {
  article: string
  quantity: number       // qté requise à ce maillon (propagée par linkQuantity)
  availableDate: Date     // date à laquelle CE maillon est dispo
  reason: PromiseReason   // pourquoi cette date (voir 5.3)
  leadTimeUsed: number    // délai appliqué (jours) — 0 si couvert par stock/flux
  children: PromiseNode[] // sous-maillons (composants), vide pour une feuille
  onCriticalPath: boolean // ce maillon détermine-t-il la date du parent ?
}

export interface PromiseResult {
  article: string
  quantity: number
  promiseDate: Date          // date au plus tôt (racine)
  mode: 'optimiste' | 'engageante'
  criticalPath: PromiseNode[] // branche contraignante aplatie, racine → feuille limitante
  limitingFactor: {           // le maillon terminal, formulé
    article: string
    reason: PromiseReason
    date: Date
    leadTime: number
  }
  tree: PromiseNode           // arbre complet (drill-down)
  truncated: boolean          // true si PHANTOM_DEPTH_CAP atteint (arbre incomplet)
}

export function computePromiseDate(
  req: PromiseRequest,
  data: PromiseDataset
): PromiseResult
```

### 5.2 L'algorithme (récursion `dispoDate`)

`dispoDate(article, qté, from, depth) → PromiseNode` :

1. **Stock net résiduel ≥ qté** → `availableDate = from`, `reason = 'stock'`, feuille. Décrémente le stock consommé (le moteur tient un ledger local pour ne pas promettre deux fois le même stock sur une même passe multi-lignes).
2. **Flux datés non alloués** (réceptions + OF) couvrent le reliquat → `availableDate = date du dernier flux nécessaire` pour atteindre `qté` (tri par date croissante, cumul jusqu'à couverture). `reason = 'reception'` ou `'of'`. Feuille (on ne descend pas dans un OF déjà lancé — sa date est engagée).
3. **Reliquat non couvert** → il faut **produire ou acheter** :
   - **Article FABRICATION** (`supplyType === 'FABRICATION'`, a une nomenclature) :
     - pour chaque composant : `child = dispoDate(composant, qté × linkQuantity, from, depth+1)`,
     - `dateComposantsPrêts = max(children.availableDate)` — **le composant le plus lent contraint**,
     - `availableDate = décaler(dateComposantsPrêts, +délaiFab)` (jours ouvrés en v2),
     - `reason = 'fabrication'`, l'enfant qui porte le max est marqué `onCriticalPath`.
   - **Article ACHAT** (feuille manquante) :
     - `availableDate = décaler(from, +délaiAppro)`, `reason = 'appro'`, feuille.
4. **Plafond** : `depth > PHANTOM_DEPTH_CAP` → coupe, `truncated = true`, on prend le délai appro comme approximation prudente.

Le **chemin critique** = descente depuis la racine en suivant à chaque niveau l'enfant `onCriticalPath` (celui qui porte le `max`), jusqu'à une feuille.

### 5.3 `PromiseReason` — pourquoi cette date

```ts
export type PromiseReason =
  | { kind: 'stock' }                                    // couvert par stock dispo
  | { kind: 'reception'; poId: string; date: Date }      // PO attendue
  | { kind: 'of'; ofId: string; date: Date }             // OF en cours
  | { kind: 'appro'; leadTime: number; observed?: number } // à acheter (théorique / +retard observé)
  | { kind: 'fabrication'; leadTime: number }            // à fabriquer
```

`observed` (mode engageante seulement) = retard fournisseur moyen ajouté au délai catalogue. C'est ce qui distingue les deux dates.

### 5.4 Optimiste vs engageante — une seule passe, deux paramétrages

Le même algo tourne deux fois :

| Paramètre | Optimiste | Engageante |
| --- | --- | --- |
| Délai appro | `reorderDelay` catalogue | `reorderDelay + supplierLatency[article]` (retard moyen observé) |
| Réceptions overdue | prises à leur date théorique | re-datées à `today + latence résiduelle` (une PO en retard n'arrive pas hier) |
| Décalage délai | jours calendaires | **jours ouvrés** (`calendar.factor`) |
| Capacité poste (v2) | ignorée | jalonnement borné par `capDay` du poste goulot |

L'écart des deux dates = le risque chiffré.

---

## 6. Intégration produit — deux surfaces

### 6.1 Dans la commande virtuelle (#58) — enrichissement

Le formulaire « + Commande virtuelle » (`scenario-bar.tsx:200`) gagne un comportement :

- **Champ date laissé vide** → le moteur calcule la **date au plus tôt** (mode engageante par défaut) et pré-remplit le champ. Le chip virtuel affiche la date + un badge « au plus tôt ».
- **Date saisie manuellement** → comportement actuel (verdict ATP à date fixée) **+ une ligne** : « sinon possible au plus tôt le JJ/MM » si la date saisie est infaisable.
- Le **chemin critique** est consultable au survol / clic du chip (popover) : liste des maillons + facteur limitant.

Ça reste dans le mode scénario, sur `/programme`. Utile pour le what-if approfondi (« et si je l'accepte, qui perd ? » via le diff existant + « au plus tôt c'est quand ? » via le CTP).

### 6.2 Simulateur autonome — « l'outil du téléphone » (surface principale)

**La planner ne va pas activer le mode scénario sur `/programme` pendant un appel client.** Il faut un outil **autonome, instantané, sans contexte de board**.

- Page `/promesse` (ou palette/modale accessible partout via raccourci) : un champ article (autocomplete sur le référentiel), un champ quantité, un champ « à partir de » (défaut aujourd'hui).
- Résultat immédiat (< 500 ms cible) :
  - **Deux dates** en gros : optimiste (vert) / engageante (ambre), en `JJ/MM/AAAA` (format FR obligatoire).
  - **Facteur limitant** en une phrase.
  - **Chemin critique** dépliable : arbre des maillons (article, qté, délai, source, date), la branche critique surlignée.
  - **Aperçu d'impact** (optionnel, réutilise le diff #56) : « si vous acceptez, N commandes du carnet passent en retard » — lien vers le what-if complet sur `/programme`.
- Pas de persistance obligatoire ; bouton « transformer en commande virtuelle » qui bascule vers `/programme` en mode scénario avec la mutation `inject_demand` pré-remplie (pont entre les deux surfaces).

---

## 7. Ce que le moteur NE fait PAS (non-buts)

- **Pas d'écriture X3.** Le CTP calcule et affiche. La saisie réelle de la commande reste dans X3 (cohérent avec #58 : « appliquer » exclut les virtuelles).
- **Pas de réservation / blocage de stock.** Une promesse n'alloue rien. Deux appels concurrents peuvent promettre le même stock — c'est un outil d'aide à la décision, pas un ATP transactionnel. (Le ledger local de 5.2 évite seulement le double-comptage **au sein d'un même appel** multi-lignes.)
- **Pas d'optimisation / re-séquencement.** On donne la date au plus tôt sur le plan **actuel**, on ne propose pas de bouger des OF pour l'améliorer (ça, c'est le mode scénario).
- **Pas de capacité fine en v1.** Matière seule d'abord (voir lots).
- **Pas de multi-site.** AE1 uniquement (cohérent avec tout le reste de l'app).

---

## 8. Pièges & décisions à cadrer (les vrais points durs)

### 8.1 MFGMAT absent sur les articles jamais lancés (bloquant connu — #30)
Les OF suggérés / articles jamais fabriqués n'ont **pas de matières réelles MFGMAT**. Le moteur de rupture a déjà le repli MFGMAT→nomenclature (`RequirementSource`). Le CTP **doit** utiliser la nomenclature théorique (`Nomenclature.components`) comme source de BOM — jamais MFGMAT (qui n'existe que pour un OF lancé). Prérequis : nomenclature théorique complète et à jour dans le référentiel synchronisé. **Vérifier la couverture BOM avant de coder** (un article sans nomenclature ni stock → date = infaisable, à afficher explicitement, pas une date fausse).

### 8.2 Délai fab multi-niveaux
Le délai de fabrication se **cumule** le long du chemin critique : `délai(produit) + délai(sous-ensemble) + … `. Un sous-ensemble fabriqué qui doit lui-même être lancé ajoute son propre `MFGLTI`. Ne pas oublier : c'est la somme des délais fab **de la branche critique**, pas juste le délai du produit fini. C'est précisément l'erreur que la planner fait à la main (elle oublie un niveau).

### 8.3 Résiduel vs vol de couverture
La promesse se base sur le stock/flux **non alloué**. Il faut donc, en amont, retrancher ce qui est déjà pegé au carnet (`CommandeOFMatcher`). Sinon on promet une matière qui couvre déjà une commande existante → double promesse. **Décision** : `stockNet` et `receptions` passés au moteur sont **nets des allocations** (calcul dans le loader, pas dans le moteur pur).

### 8.4 Cycles de nomenclature
Une BOM mal saisie peut contenir un cycle (A→B→A). La récursion doit détecter les articles déjà dans la pile courante et couper (`truncated`, log). `PHANTOM_DEPTH_CAP=5` limite déjà la profondeur, mais un garde-fou anti-cycle explicite est nécessaire.

### 8.5 Fantômes AFANT
La règle AFANT (composant fantôme : stock net d'abord, descente du reliquat) est déjà dans `rupture-engine`. Le CTP **doit** la répliquer : un fantôme couvert par stock ne déclenche pas de descente ; seul le reliquat descend. Réutiliser la logique existante plutôt que la ré-écrire — extraire si besoin en fonction partagée.

### 8.6 Retard fournisseur observé — d'où vient `supplierLatency` ?
Donnée **non encore calculée**. Piste : moyenne glissante sur les réceptions historiques (date réelle − date promise) par article ou par fournisseur. C'est un chantier data à part. **En v1 : défaut = 0** (engageante = optimiste + jours ouvrés seulement), la structure existe, on branche la latence quand la donnée est là. Documenter le défaut.

### 8.7 Perf
`rupture-engine` et `evaluateOrderImpacts` sont lourds (cf. #39/#40, plancher 4GL ZSOAPSQL). Mais le CTP ne les rappelle PAS : il tourne sur les lookups **déjà en cache** (`stockNet`, `receptions`, `ofSupply` sont les mêmes Maps que le board charge). Un calcul CTP = une descente d'arbre en mémoire, O(taille BOM), pas d'appel X3. Cible < 500 ms tenable si les lookups sont chauds (cache SWR `board:*` partagé). **Ne jamais** déclencher un `loadOrderImpacts` par appel CTP.

---

## 9. Données requises — checklist avant code

- [ ] `Article.reorderDelay` fiable et distinguant achat/fab (✅ déjà là, `static_sync_service.ts`).
- [ ] `supplyType` ACHAT/FABRICATION par article (✅ `MFGFLG_0`).
- [ ] Nomenclature théorique complète par article produit (⚠️ **à vérifier** — couverture, à-jour, cf. #30).
- [ ] Stock net **non alloué** par article (⚠️ à dériver : stock net − allocations `CommandeOFMatcher`).
- [ ] Réceptions attendues datées **non allouées** par article (✅ `reception_repository`, ⚠️ net des allocations à calculer).
- [ ] OF en cours datés non alloués par article produit (✅ `ORDERS` WIPTYP=5).
- [ ] Retard fournisseur moyen par article (❌ **à construire** — v1 défaut 0, cf. 8.6).
- [ ] Capacité poste + calendrier (✅ `capacity.ts` + `working_calendar.ts`, branché en v2 seulement).

---

## 10. Découpage en lots livrables

| Lot | Contenu | Valeur | Dépend de |
| --- | --- | --- | --- |
| **1 — Moteur** | `promise-engine.ts` pur : `computePromiseDate`, récursion `dispoDate`, chemin critique, mode optimiste. Fixtures + tests. | La logique métier, testable sans UI ni X3. **Le gros du levier.** | — |
| **2 — Loader** | `promise_loader.ts` : dérive `PromiseDataset` des lookups cache existants (stock net d'allocations, réceptions nettes, ofSupply). Endpoint `POST /api/v1/promesse`. | Le moteur devient appelable sur données réelles. | Lot 1 |
| **3 — Simulateur autonome** | Page/palette `/promesse` : formulaire + 2 dates + facteur limitant + chemin critique dépliable. Format FR. | **L'outil du téléphone** — la valeur pour la planner. | Lot 2 |
| **4 — Mode engageante** | `supplierLatency` (retard observé) + jours ouvrés dans le décalage. | La date **tenable**, pas seulement théorique. | Lot 1-3 |
| **5 — Pont commande virtuelle** | Date vide = au plus tôt dans #58 ; « transformer en commande virtuelle » depuis `/promesse`. | Unifie les deux surfaces (proposer ↔ valider l'impact). | Lot 3, #58 |
| **6 — Capacité (v2)** | Jalonnement capacitaire du poste goulot (bouches BDH60 hygro) dans la date engageante. | Précision sur les goulots réels. | Lot 4, #35 |

Lots 1-3 = MVP livrable et utile seul. 4-6 = raffinements.

---

## 11. Tests (fixtures domaine, sans X3)

- **Stock suffisant** → date = aujourd'hui, chemin critique = `[stock]`.
- **Achat pur manquant** → date = today + délai appro, facteur limitant = le composant acheté.
- **Fab 1 niveau, tous composants en stock** → date = today + délai fab.
- **Fab 2 niveaux** → délai cumulé sur la branche critique (vérifie 8.2).
- **Réception attendue couvre** → date = date de la PO (pas today + délai).
- **Réception overdue** → optimiste prend sa date théorique, engageante la re-date (vérifie 5.4).
- **Deux branches, une plus lente** → chemin critique suit la lente, l'autre absente du critique.
- **Fantôme AFANT couvert par stock** → pas de descente (vérifie 8.5).
- **Cycle BOM** → coupe propre, `truncated=true`, pas de stack overflow (vérifie 8.4).
- **Article sans nomenclature ni stock** → infaisable explicite, pas de date fausse (vérifie 8.1).
- **Multi-lignes même stock** → ledger local évite la double promesse dans un même appel (vérifie 5.2 / non-but 7).
- **Optimiste vs engageante** → engageante ≥ optimiste, écart = latence + jours ouvrés.

---

## 12. Critères d'acceptation

- [ ] `computePromiseDate` rend une date + un chemin critique pour tout couple (article, qté), sur fixtures, sans I/O.
- [ ] Le chemin critique désigne le **maillon terminal contraignant** avec sa raison (stock / réception / appro / fab) et son délai.
- [ ] Le délai fab est **cumulé** le long des niveaux de la branche critique.
- [ ] La promesse se base sur le stock/flux **net des allocations** (pas de double promesse avec le carnet).
- [ ] Deux dates rendues (optimiste / engageante) ; engageante ≥ optimiste ; l'écart est affiché.
- [ ] Simulateur `/promesse` : réponse < 500 ms sur données chaudes, **sans** appel X3 par requête.
- [ ] Dates affichées en `JJ/MM/AAAA` (jamais ISO à l'écran).
- [ ] Article infaisable (ni stock, ni flux, ni BOM) → message explicite, pas de date silencieusement fausse.
- [ ] Cycle / profondeur excessive → `truncated=true`, jamais de crash.
- [ ] Depuis `/promesse`, bouton vers la commande virtuelle pré-remplie sur `/programme`.

---

## 13. Risques & questions ouvertes

- **Fiabilité de la nomenclature théorique** (8.1) : si les BOM sont incomplètes/périmées, le CTP ment. **À auditer avant le lot 1** — c'est le risque n°1. Un CTP sur BOM fausse est pire que pas de CTP (fausse confiance).
- **`supplierLatency`** (8.6) : la donnée qui fait la valeur de la date engageante n'existe pas encore. V1 dégradée (latence 0) acceptable mais à annoncer honnêtement à la planner (« optimiste = théorique, engageante = jours ouvrés, retard fournisseur pas encore intégré »).
- **Capacité** : sans le lot 6, la date ignore les goulots poste (bouches hygro). Une date matière-OK peut être capacité-KO. Risque de sur-promesse sur les goulots connus → cadrer l'attente, prioriser le lot 6 sur les familles goulot.
- **Adoption** : l'outil doit être **plus rapide que le calcul manuel** ET **crédible**. Si la première réponse est visiblement fausse (BOM/latence), la planner ne l'utilisera plus. Soigner le lot 1 (exactitude) avant le lot 3 (UI).

---

## 14. Références

- Feature commande virtuelle (#58) — l'ATP fixé, base du pont (6.1).
- Moteur de rupture unique (#73, `rupture-engine.ts`) — descente BOM + AFANT à répliquer.
- Réceptions en retard (#43, `RECEPTION_OVERDUE_MIN_QTY`) — base de la date engageante.
- Capacité + calendrier (#35/#37) — jalonnement capacitaire v2.
- MFGMAT absent sur suggérés (#30) — repli nomenclature obligatoire (8.1).
- Moteur de diff (#56, `plan-diff.ts`) — aperçu d'impact optionnel (6.2).
- Contexte MRP Sage X3 AE1 — 100 % CBN, goulot bouches BDH60 hygro.
