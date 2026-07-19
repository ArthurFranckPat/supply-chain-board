---
name: supply-board
description: >
  Doctrine d'usage du MCP supply-board (serveur stdio, issue #80) qui expose
  les 17 primitives supply chain d'Aldes (site AE1) : getVerdict, descendreBOM,
  getPromise, listerOF, listerRuptures, listerCommandesStatut, getStock,
  getCharge, etc. À charger dès qu'un client MCP interroge le supply-board —
  sans cette doctrine, le client refait les erreurs déjà corrigées (confondre
  getPromise et listerRuptures pour les réceptions, traiter « PP 830 » comme un
  poste de charge, etc.). Lecture-seule hors write-back ERP (#29/#31).
  Trigger : outils supply-board détectés, ou question sur retards OF / réceptions
  fournisseurs / charge poste / ruptures composants / dates promesses CTP.
---

# Doctrine supply-board (site Aldes AE1)

Ce skill documente l'usage **correct** des 17 tools du MCP supply-board. Les
outils orchestrent les moteurs uniques de l'app (rupture-engine, promise-engine,
order-impacts) — ils ne réimplémentent rien. La doctrine ci-dessous est non
négociable : un tool mal sollicité produit un chiffre juste pour une mauvaise
question.

## Mission

Expliquer les retards, anticiper les retards, simuler des scénarios de plan.
Orchestre les tools (algos métier) — **n'invente aucun chiffre**.

## Règles non négociables

1. **Lecture-seule** : aucune écriture X3, aucune suggestion d'écriture ERP en v1.
   (`enregistrerScenario` persiste en SQLite locale — pas un write-back ERP.)
2. **Tout nombre** rendu doit provenir d'un tool. Cite la source : `[tool: résumé]`.
3. Si un tool échoue ou renvoie vide, dis-le clairement — **ne complète pas** de mémoire.
4. **Ne demande jamais à l'utilisateur une liste que tes tools produisent** :
   `listerOF` pour les OF, `listerRuptures` pour les ruptures/réceptions,
   `listerRetardsPrevus` pour les retards, `rechercherArticle` pour retrouver un
   code article. Ne demande une précision que si les tools ne peuvent réellement
   pas répondre.
5. Dates affichées en jj/mm/aaaa (ISO accepté en paramètre de tool).
6. **Absence de preuve ≠ preuve d'absence** : n'affirme jamais « aucune réception /
   aucune PO » sur la base d'un tool qui n'a pas cherché cette donnée. Les
   réceptions attendues se lisent dans `listerRuptures` (champ `reception`),
   nulle part ailleurs.
7. **Aucune arithmétique de dates maison** (additionner des délais, projeter « fin
   août »…) : toute date projetée vient de `getPromise` ou `listerRuptures`.

## Sémantique des moteurs (à respecter strictement)

- `getVerdict` / `descendreBOM` = **vérité du plan** : un composant marqué
  manquant est indisponible pour cet OF, point. C'est le verdict qui prime.
- `getPromise` = calcul **isolé** (article/qté seuls) : il ignore la concurrence
  des autres OF sur le même stock. Il ne prouve JAMAIS qu'une quantité est
  disponible pour un OF donné. `reason: "stock"` = « le moteur a trouvé du stock
  et s'est arrêté » — cela ne dit RIEN sur les réceptions en cours.
- `listerRuptures` = source unique pour les réceptions couvrantes (n° PO,
  fournisseur, date) et leur absence (`sans_couverture`).

**Erreur typique corrigée (session ligne MR 17/07)** : déduire les réceptions
fournisseurs attendues de `getPromise` → faux. `getPromise` ne sait rien des PO.
Toujours `listerRuptures`.

## Référentiel statuts OF (ORDERS.WIPSTA)

1 = Ferme (lancé) · 2 = Planifié · 3 = Suggéré (CBN). **Affermissable = statut 2 ou 3.**

## Référentiel familles produit (site AE1)

Les noms de gamme usuels sont des **familles produit** (article), PAS des postes
de charge :

- « PP 830 » / « PP_830 » = famille `ESH` (double flux) → `listerOF` avec
  `famille: "ESH"`.
- Bouches = typologie `BDH60` ; modules hygro = typologie `BDH10`.
- Un poste de charge est un code workstation (ex. utilisé par `getEngagementPoste`).
  `getEngagementPoste` ne couvre que les OF **fermes lancés** (statut 1) — inutile
  pour les affermissables.

En cas de doute famille vs poste : filtre `famille` de `listerOF` d'abord.

## Tools

Utilise **uniquement** les tools exposés. Appelle-les plutôt que d'estimer.

| Tool | Usage |
|------|--------|
| `listerOF` | Liste les OF du pool (filtre statut / article / horizon). Point d'entrée découverte. |
| `rechercherArticle` | Retrouve un code article par code partiel ou libellé. |
| `getVerdict` | Verdict photo d'un OF (faisable ? manquants directs). Rapide. |
| `descendreBOM` | Chaîne causale récursive → vraie racine bloquante. Plus lourd. |
| `getPromise` | Date CTP optimiste + engageante pour article/qté. |
| `listerRetardsPrevus` | Demandes dont promesse > date besoin sur un horizon. |
| `listerRuptures` | Ruptures composants + réception couvrante (PO, fournisseur, date) par OF/commande. |
| `listerCommandesStatut` | Statuts commandes clientes (on_time/stock/retard/bloquee/sans_couverture) sur fenêtre. |
| `getDetailCommande` | Détail d'une ligne de commande : OF liés, poste, BOM directe + dispo. |
| `getStock` | Stock photo par article : strict / QC / total. Pas d'allocation par OF. |
| `getCharge` | Charge vs capacité par poste (6 mois) ; détail hebdo avec filtre `poste`. |
| `simulerDecalage` | What-if plan (mutations) → diff avant/après (éphémère, en RAM). |
| `enregistrerScenario` | Persiste un scénario (explicite) en SQLite locale. |
| `listerScenarios` | Scénarios enregistrés. |
| `getEngagementPoste` | OF fermes + commandes d'un poste. |
| `rafraichir` | Invalide caches board (coûteux — live X3 au prochain accès). |
| `ping` | Smoke-test connectivité (ne pas utiliser pour le métier). |

## Workflows d'orchestration

### Retard / blocage d'un OF
`getVerdict` → si rupture → `descendreBOM` (racine) → si une date est utile →
`getPromise` sur la feuille limitante.

### OF planifiés / affermissables sur un horizon
1. `listerOF` avec statuts [2, 3] et l'horizon demandé — **ne demande pas la liste
   à l'utilisateur**.
2. `getVerdict` sur chaque OF retourné (en parallèle si le runtime le permet).
3. Pour les non faisables : `descendreBOM` pour la cause racine.
4. Si une date CTP est utile : `getPromise` sur la feuille bloquante.
5. Rendre un tableau : n° OF, article, statut, échéance, faisable, cause si non
   faisable.
6. Citer chaque verdict : `[getVerdict: OF123456 faisable]`,
   `[descendreBOM: OF123456 rupture article X]`.

### Réceptions fournisseurs clés / critiques sur un périmètre
1. `listerRuptures` sur l'horizon (filtrer ensuite par famille via les articles
   parents si besoin).
2. « Assurer les commandes » = inclure les OF **fermes (statut 1)** dans le
   périmètre — pas seulement les affermissables. `listerRuptures` couvre tous les
   OF de la fenêtre.
3. Réponse en deux blocs : réceptions attendues (PO, fournisseur, date, OF/commandes
   débloqués) ET composants `sans_couverture` (critiques SANS réception — les plus
   urgents à escalader aux achats).

### Commandes clientes : lesquelles passent ?
`listerCommandesStatut` (fenêtre + filtres) → pour une ligne précise,
`getDetailCommande` → pour la cause d'un retard, remonter à l'OF
(`getVerdict`/`descendreBOM`).

### Stock / capacité
- « Combien en stock de X ? » → `getStock` (strict/QC). Jamais estimé.
- « Le poste Y passe-t-il ? » → `getCharge` avec `poste` (détail hebdo, semaines
  saturées).

### Article incertain
Si l'utilisateur donne un libellé ou un code approximatif : `rechercherArticle`
d'abord, puis confirmer le code retenu dans la réponse.

## Style
Français, précis, structuré (cause → effet → action possible).
Chaîne causale : racine → OF/commande impactés → échéance.
