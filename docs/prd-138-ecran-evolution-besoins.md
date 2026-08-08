# PRD — Écran « Évolution des besoins » (#138, lot 1 bis)

> **Une phrase.** Rendre visible ce que le CBN a vu bouger entre deux nuits —
> prévisions, commandes client, stock, réceptions, OF — sans le filtre
> « cet article porte un message ».

---

## 1. Pourquoi cet écran

Le lot 1 a livré le moteur de diff des besoins (`app/domain/cbn_driver_diff.ts`)
et son endpoint (`GET /api/v1/appro/drivers-diff`). **Aucune interface ne les
consomme.**

Le seul endroit où ce diff transparaît aujourd'hui : les blocs d'explication de
`/approvisionnements`, où il est doublement filtré — uniquement les articles qui
portent un message CBN, uniquement le driver retenu comme corrélation dominante.

Deux conséquences mesurées le 07/08/2026 :

- Sur les 4 messages CBN qui ont bougé cette nuit-là, **3 n'ont pour seul driver
  mouvant que `appro_suggestion`** — une sortie du CBN, pas une entrée. Le
  quatrième (`11019954`, bascule retarder → avancer) n'a **aucun** driver mouvant.
  L'écran d'explication affiche donc « non expliqué » partout, et rien ne permet
  de savoir si c'est le moteur qui rate ou les besoins qui n'ont pas bougé.
- L'historique des besoins est **déjà mûr** (9 photos, du 30/07 au 07/08) alors
  que celui des messages n'a que 2 photos. La donnée la plus riche du module est
  la seule invisible.

L'écran répond à une question que l'approvisionneur pose avant même de regarder
un message : **« qu'est-ce qui a changé dans mes besoins depuis la semaine
dernière ? »**

---

## 2. Utilisateur et question

|                     |                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Utilisateur**     | Approvisionneur, et responsable supply pour la lecture hebdomadaire                                                     |
| **Question**        | « Entre ces deux photos, quels articles ont vu leur besoin bouger, dans quel sens, de combien ? »                       |
| **Fréquence**       | Quotidienne (revue du matin) et hebdomadaire (revue de portefeuille)                                                    |
| **Décision servie** | Où porter son attention avant d'ouvrir la pile fournisseur — et, en aval, comprendre pourquoi un message CBN est apparu |

---

## 3. Périmètre

### Dans le périmètre

- **Frise chaînée jour à jour** : enchaîne les diffs des paires de photos
  consécutives sur une plage sélectionnée, agrégés par article. N'importe quelle
  plage de photos de `demand_snapshots` est sélectionnable (pas seulement les
  deux dernières) — la frise reconstruit le mouvement de chaque nuit entre les
  bornes.
- Les **8 sources** du diff : `stock`, `demande_ferme`, `demande_prevision`,
  `appro`, `of_ferme`, `of_planifie`, `of_suggestion`, `appro_suggestion`.
- Les **5 natures** du moteur : `apparue`, `disparue`, `quantite`, `date`,
  `renumerotation`.
- Tri par amplitude, filtre par source, recherche par article.
- Lien vers la fiche article existante (`stock-article-sheet.tsx`).

### Hors périmètre

- **Aucun appel X3.** Tout vient de SQLite. C'est ce qui rend l'écran instantané
  et disponible même X3 éteint.
- Pas de corrélation message ↔ driver : c'est l'objet de `/explanations`, déjà
  livré. Cet écran montre les besoins **bruts**.
- Pas de **courbe** temporelle multi-photos (une courbe continue par article sur
  9 jours). La frise montre les mouvements jour à jour entre les bornes — c'est
  une analyse temporelle multi-photos, mais pas un graphe continu. La vraie série
  chart (courbe) reste en lot 2, une fois qu'on sait quelles séries valent le
  tracé.
- Pas d'écriture, pas de décision, pas de ledger. Écran de lecture.

---

## 4. La donnée, telle qu'elle est

### Volumétrie réelle (mesurée le 07/08/2026, base de dev)

`demand_snapshots` — 9 photos, 30/07 → 07/08. Une photo ≈ **36 600 lignes** :

| Source              | Lignes / photo |
| ------------------- | -------------- |
| `of_suggestion`     | 11 829         |
| `demande_prevision` | 8 433          |
| `stock`             | 6 465          |
| `appro_suggestion`  | 5 469          |
| `appro`             | 1 884          |
| `of_ferme`          | 1 535          |
| `demande_ferme`     | 821            |
| `of_planifie`       | 205            |

### Ce que rend un diff large (31/07 → 07/08, approximation SQL par article)

| Source              | Apparus | Disparus | Quantité bougée |
| ------------------- | ------- | -------- | --------------- |
| `stock`             | 54      | 363      | 2 354           |
| `of_suggestion`     | 102     | 64       | 682             |
| `demande_prevision` | 29      | 53       | 495             |
| `appro`             | 125     | 170      | 241             |
| `demande_ferme`     | 130     | 149      | 185             |
| `of_ferme`          | 116     | 138      | 88              |
| `appro_suggestion`  | 866     | 0        | 0               |
| `of_planifie`       | 143     | 0        | 0               |

**≈ 6 500 entrées minimum** sur 7 jours d'écart, sans compter la nature `date`
que cette approximation ne voit pas. Le vrai moteur apparie ligne à ligne : le
compte réel sera supérieur. **Le payload doit être borné côté serveur.**

### Ce que rend un diff d'une nuit (06/08 → 07/08)

3 articles en `stock`, 2 en `appro_suggestion`, 0 partout ailleurs. **L'écran
doit rendre ce cas lisible et non suspect** : « 5 mouvements sur 36 641 lignes »
est une information, pas une panne. Cf. § 7, état « diff vide ».

### Ce que la donnée n'a pas

- **Pas de désignation article.** `DemandSnapshotRow` ne porte que `itmref`.
  Enrichir depuis `static_articles` (6 853 lignes, colonnes `code`,
  `description`, `famille`, `typologie`) — table locale, pas d'appel X3.
- **Pas de valorisation.** Aucun prix dans les photos : le tri par « enjeu
  financier » est impossible en lot 1. Tri par amplitude quantité uniquement.

---

## 5. Backend — ce qui existe, ce qui manque

### Existe et se réutilise tel quel

| Composant             | Fichier                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| Moteur de diff pur    | `app/domain/cbn_driver_diff.ts` — `diffCbnDrivers(avant, apres)`                |
| Service               | `demand_snapshot_service.diffDrivers(apresDay, avantDay)`                       |
| Endpoint              | `GET /api/v1/appro/drivers-diff?avant=&apres=` (`appro_controller.driversDiff`) |
| Calendrier des photos | `deuxDernieresPhotosBesoin()`, `diagnostic()`                                   |
| Seuils de bruit       | `TOLERANCE_ECHEANCE_JOURS`, `TOLERANCE_QUANTITE_RATIO` (`appro_decision.ts`)    |

### À ajouter

**5.1 — `GET /api/v1/appro/snapshots`** — la liste des photos disponibles, pour
alimenter le sélecteur de dates. Adossé à `demandSnapshotService.diagnostic()`,
qui rend déjà l'état de l'historique. Format :

```json
{ "photos": [{ "date": "2026-08-07", "lignes": 36641, "sources": 8 }] }
```

Sans ça, le front devine les dates ou n'offre que « les deux dernières » — ce
qui rend inaccessibles les 9 photos déjà accumulées.

**5.2 — Enrichissement désignation** dans `driversDiff`, par jointure
`static_articles` sur les seuls articles présents dans les entrées du diff (pas
un `LEFT JOIN` sur toute la photo). `DriverDiffEntry` gagne `designation:
string | null` et `famille: string | null`.

**5.3 — Bornage et tri côté serveur.** `driversDiff` rend aujourd'hui `entrees`
en totalité. Ajouter :

- `?source=` (filtre, multi-valeurs séparées par virgule)
- `?nature=` (filtre)
- `?limit=` (défaut 200, plafond 1 000)
- tri par amplitude décroissante **avant** le bornage — sinon les 200 premières
  entrées sont arbitraires
- `total` dans la réponse, à côté de `entrees`, pour que l'écran dise « 200 sur
  6 547 »

L'amplitude de tri est le ratio de variation, pas la quantité absolue : sinon
les articles à gros volume écrasent tout et un composant qui passe de 10 à 0
disparaît sous un stock qui bouge de 2 %.

**5.4 — Cache.** `diffDrivers` relit deux journées entières (~73 000 lignes) à
chaque appel. Même motif que `explainMessages` : `cacheNs('appro')` +
`getOrSetForever`, clé `appro:drivers:${avant}:${apres}` — une photo est
immuable une fois écrite, donc le diff de deux photos l'est aussi. Valeur en
**lecture seule** (cf. `cache_ns.ts`). Les filtres et le tri s'appliquent
**après** le cache, sur le résultat complet mémorisé.

**5.5 — Route de page.** `GET /besoins/evolution` →
`appro_controller.evolution`, nom de route `besoins.evolution`. Entrée de menu
dans le groupe **Logistique** de `masthead.tsx`, juste après
« Approvisionnements ».

_Tranché :_ page autonome plutôt qu'onglet de `/approvisionnements`. La pile
fournisseur est une surface de décision ; celle-ci est une surface de lecture
d'un autre grain (article × source, pas fournisseur × ligne). Les mélanger
imposerait un sélecteur de dates à une page qui n'en a pas besoin.

---

## 6. L'écran

### Structure

1. **En-tête** — titre, et le **sélecteur de couple de photos** : deux dates
   parmi celles disponibles, défaut = les deux dernières. Dates en
   **jj/mm/aaaa**, jamais d'ISO à l'écran.
2. **Sélecteur de plage et compteurs** — deux sélecteurs de dates (défault = les
   deux photos les plus récentes) qui bornent la frise. Des compteurs globaux
   (nombre de mouvements, total) s'affichent au-dessus des résultats. Le
   filtrage par source et par nature se fait côté serveur via des query params,
   pas par un bandeau de tuiles cliquables.
3. **Tableau** — une ligne par entrée de diff :

   | Colonne       | Contenu                                                                           |
   | ------------- | --------------------------------------------------------------------------------- |
   | Article       | `itmref` + désignation (`static_articles`)                                        |
   | Source        | libellé métier, pas le code technique (« Commandes client », pas `demande_ferme`) |
   | Nature        | `apparue` / `disparue` / `quantité` / `date`                                      |
   | Avant → Après | quantités formatées `fr-FR`, ou les deux échéances si nature `date`               |
   | Écart         | delta signé + ratio                                                               |
   | Détail        | le champ `detail` du moteur, déjà rédigé en clair                                 |

4. **Filtres** — source (via les tuiles ou un sélecteur), nature, recherche
   article/désignation. Filtrage client sur les entrées reçues ; le serveur
   borne, le client affine.
5. **Fiche article** — clic sur une ligne → `stock-article-sheet.tsx` existante.

### Libellés des sources (à l'écran, jamais le code)

| Code                | Libellé                 |
| ------------------- | ----------------------- |
| `demande_ferme`     | Commandes client        |
| `demande_prevision` | Prévisions              |
| `stock`             | Stock strict            |
| `appro`             | Réceptions attendues    |
| `of_ferme`          | OF fermes               |
| `of_planifie`       | OF planifiés            |
| `of_suggestion`     | OF suggérés             |
| `appro_suggestion`  | Suggestions d'achat CBN |

Ces trois dernières sont des **sorties** du CBN, pas des causes. Le PRD ne les
retire pas — elles sont utiles pour voir le CBN se contredire d'une nuit à
l'autre — mais l'écran doit les **séparer visuellement** des besoins réels
(groupe « Ce que le CBN propose » vs « Ce qui a changé dans la réalité »). Sans
cette séparation, un utilisateur lira « 866 suggestions d'achat apparues » comme
866 besoins nouveaux, ce qui est faux.

---

## 7. États à couvrir

| État                                            | Cause                                             | Ce que l'écran affiche                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Moins de 2 photos                               | Première installation                             | « L'historique commence. Une seconde photo est nécessaire — elle arrivera cette nuit. » + date de la photo existante                    |
| Photo illisible / absente sur un des deux jours | Extraction en échec (garde-fou par source, lot 0) | Le message du serveur, et le couple de dates demandé — jamais un écran vide muet                                                        |
| **Diff vide** (0 mouvement)                     | Cas réel du 06→07                                 | « Aucun mouvement au-delà des seuils entre le 06/08 et le 07/08 » + rappel des seuils appliqués + suggestion d'élargir l'écart de dates |
| Diff borné                                      | > `limit` entrées                                 | « 200 mouvements sur 6 547 — affinez par source ou par nature »                                                                         |
| Erreur réseau                                   |                                                   | État d'erreur avec bouton relancer, jamais un tableau vide                                                                              |
| **Plage trop large**                            | > 45 photos dans la sélection                     | « Resserrer la sélection » — message du serveur indiquant le nombre maximum de pas                                                      |

Le tableau vide sans explication est le défaut à éviter absolument : sur ce
module, « rien à afficher » et « la photo manque » ont des conséquences
opposées.

---

## 8. Construction de l'écran avec le skill `impeccable`

L'écran se construit avec `/impeccable`, pas à la main. Le projet a déjà
`PRODUCT.md` et `DESIGN.md` à la racine — le skill s'appuie dessus, il ne part
pas d'une page blanche.

### Séquence imposée

1. **Contexte** — `node <skill-base-dir>/scripts/context.mjs --target
inertia-react/pages/besoins-evolution.tsx`, **cwd à la racine du projet**,
   une seule fois par session. Charge `PRODUCT.md`, `DESIGN.md` et le brief de
   surface. Ne pas le relancer.
2. **`shape`** — planifier l'UX avant d'écrire du code, avec ce PRD comme
   brief. Livre la structure, la hiérarchie, les états. C'est là que se tranche
   la présentation du bandeau de synthèse et la séparation « réalité » vs
   « propositions CBN » (§ 6).
3. **Construction** — charger `reference/craft-floor.md` **immédiatement avant**
   d'éditer l'UI (plancher de qualité, interdits absolus).
4. **`polish`** puis **`audit`** — passe de finition, puis contrôles techniques
   (a11y, responsive). Une passe de vérification batchée, pas une boucle : le
   skill le dit lui-même, l'auto-QA en boucle ouverte coûte sans rendre.

### Mode et posture

- **Mode `Operate`** — l'utilisateur accomplit une tâche de lecture. Scanabilité,
  cohérence, attentes natives priment sur l'expression. La marque vit dans les
  détails de précision, pas dans l'effet.
- **Refinement, pas redesign** — l'identité incumbent (grammaire Airbnb,
  tokens `DESIGN.md` : `rausch #ff385c`, `ink #222222`, Plus Jakarta Sans, les
  couleurs d'état `ferme` / `planifie` / `suggere` / `danger`) est **préservée**.
  L'écran doit se fondre dans les 17 pages existantes, pas inaugurer un monde.
  Réutiliser les composants de table et de tuile déjà présents avant d'en créer.

### Contrainte non négociable du projet

**Aucun Playwright.** Le skill `impeccable` propose une vérification par
screenshots headless — cette partie est **écartée**, règle projet
(`CLAUDE.md` § Outils interdits). La vérification visuelle passe par le
navigateur de l'utilisateur : l'agent construit, livre, et demande une
relecture à l'écran. Aucun `npx playwright`, aucune installation, aucun
screenshot automatisé.

### Ce que le skill ne décide pas

La sémantique métier. Les libellés des sources (§ 6), la séparation
réalité/propositions, le contenu des états vides (§ 7) et le format de date
jj/mm/aaaa sont **fixés par ce PRD** et ne sont pas ouverts à l'arbitrage
esthétique.

---

## 9. Critères d'acceptation

| #   | Critère                                                                                                                   | Vérification                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le sélecteur propose les 9 photos disponibles, pas seulement les 2 dernières                                              | Ouvrir l'écran, compter les dates offertes                                                                                                                 |
| 2   | Une plage d'une semaine affiche la frise chaînée jour à jour, agrégée par article, bornée à `limit` avec le total visible | Comparaison au tableau § 4                                                                                                                                 |
| 3   | Un couple sans mouvement (06/08 → 07/08) affiche un état explicite, pas un tableau vide                                   | Sélectionner ce couple                                                                                                                                     |
| 4   | Les sorties CBN (`*_suggestion`, `of_planifie`) sont visuellement séparées des besoins réels                              | Revue à l'écran. À vérifier sur le rendu livré — la séparation réalité/propositions est un critère de relecture navigateur                                 |
| 5   | Toutes les dates affichées sont en jj/mm/aaaa                                                                             | Revue à l'écran                                                                                                                                            |
| 6   | Chaque ligne porte la désignation article, pas seulement le code                                                          | Revue à l'écran                                                                                                                                            |
| 7   | Aucun appel X3 : l'écran répond X3 éteint                                                                                 | Couper la connexion X3, recharger                                                                                                                          |
| 8   | Réponse < 300 ms sur un **couple unique** (deux photos adjacentes) déjà en cache, < 2 s à froid                           | Mesure navigateur. Une frise large (plage de plusieurs semaines) au premier chargement peut dépasser 2 s — le cache par paire se construit progressivement |
| 9   | Le tri par amplitude est relatif (ratio), pas absolu                                                                      | Un article 10 → 0 apparaît avant un stock qui bouge de 2 %                                                                                                 |
| 10  | `npm run typecheck` et `npm run lint` verts                                                                               | Gate projet                                                                                                                                                |

> **Note.** L'écran principal ne fait aucun appel X3. La fiche article ouverte au
> clic (`stock-article-sheet`) appelle X3 avec repli gracieux — ce critère vaut
> pour l'écran, pas pour la fiche préexistante.

---

## Évolution du périmètre — décision frise (#143)

Le PRD initial spécifiait un diff direct entre deux bornes. L'implémentation a
évolué vers une **frise chaînée jour à jour** (`/drivers-frise`, `diff_frise.ts`)
pour deux motifs :

1. Un besoin avancé puis reculé entre deux bornes se lit « inchangé » dans un
   diff direct — la frise montre le mouvement de chaque nuit.
2. Une ligne disparue en cours de route se marie de force à une ligne sans rapport
   dans un diff direct — la frise préserve la chronologie.

L'endpoint `/drivers-diff` (diff direct deux bornes) reste public et documenté
(contrat §5.3) : il sert les clients API et reste le socle du service. L'UI
consomme exclusivement `/drivers-frise`.

---

## 10. Découpage

| Lot               | Contenu                                                                                                                                                   | Estimation    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **A — Backend**   | `/api/v1/appro/snapshots`, enrichissement désignation, filtres + tri + bornage, cache `getOrSetForever`, tests unitaires sur le tri relatif et le bornage | 1 jour        |
| **B — Écran**     | `impeccable shape` → page → `polish` + `audit`. Route, controller, entrée masthead, page React, états § 7                                                 | 1,5 à 2 jours |
| **C — Relecture** | Vérification navigateur par l'utilisateur, corrections en une passe batchée                                                                               | 0,5 jour      |

Total : **3 jours**. Aucune dépendance bloquante — la donnée est déjà là.

---

## 11. Risques

| Risque                                                               | Impact                                               | Mitigation                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Le diff d'une nuit est presque toujours vide en environnement de dev | L'écran paraît cassé pendant tout le développement   | Développer sur le couple 31/07 → 07/08, qui a du volume ; l'état vide est un livrable à part entière (§ 7) |
| Payload non borné                                                    | 6 500+ entrées × désignation = plusieurs Mo          | Bornage serveur obligatoire (§ 5.3), non négociable                                                        |
| Confusion sorties CBN / besoins réels                                | L'utilisateur lit des propositions comme des besoins | Séparation visuelle imposée (§ 6), critère d'acceptation n° 4                                              |
| Les seuils de tolérance masquent des mouvements réels                | Diff faussement calme                                | Afficher les seuils appliqués dans l'état vide ; lot 2 : les rendre réglables                              |
| Absence de valorisation                                              | Impossible de trier par enjeu                        | Assumé en lot 1 ; le tri relatif (§ 5.3) est le meilleur proxy disponible                                  |

---

## 12. Suite (hors périmètre, pour mémoire)

- **Série temporelle** : une courbe par article sur les 9+ photos, une fois
  qu'on sait quelles séries méritent le tracé.
- **Valorisation** : joindre un prix pour trier par enjeu financier.
- **Lien retour vers les messages** : depuis un mouvement de besoin, voir les
  messages CBN du même article — l'inverse du chemin actuel de `/explanations`.
