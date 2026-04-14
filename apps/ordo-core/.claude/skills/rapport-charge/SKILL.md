---
name: rapport-charge
description: |
  Génère le rapport hebdomadaire complet de charge pour la réunion de production du mardi. Orchestre les analyses de charge (gammes), de faisabilité OF, de projection stock et de couverture commandes pour produire une synthèse exécutive avec : taux de charge par poste, OF bloqués et leurs causes, articles en tension, recommandation d'organisation (1×8/2×8/3×8), et commandes clients à risque. Format prêt pour le management (tableaux + alertes visuelles). Déclencher ce skill dès que l'utilisateur mentionne : rapport de charge, préparer la réunion, réunion du mardi, rapport hebdo production, synthèse semaine, bilan de charge, rapport ordonnancement, ou demande de préparer la réunion de charge hebdomadaire.
---

# Rapport de Charge Hebdomadaire

Rapport exécutif complet pour la réunion de charge du mardi — synthèse actionnable en 5 blocs.

---

## 1. Données requises

Tous les fichiers CSV du projet :
- `gammes.csv`, `of_entetes.csv`, `nomenclatures.csv`
- `stock.csv`, `receptions_oa.csv`
- `commandes_clients.csv`, `articles.csv`

**Paramètres :**
- `--data-dir` : chemin vers les CSV (défaut: `data`)
- `--date-ref` : date de référence (défaut: aujourd'hui)
- `--horizon` : semaines à analyser (défaut: 3)

---

## 2. Séquence d'exécution

Ce skill orchestre les 4 analyses suivantes dans l'ordre. Si l'un des autres skills est disponible, l'utiliser directement. Sinon, exécuter les scripts Python correspondants.

```
1. Analyse de charge         → charge-hebdo        (scripts/analyse_charge.py)
2. Faisabilité des OF S+1    → faisabilite-of      (scripts/verif_faisabilite.py)
3. Projection stock S+1–S+3  → projection-stock    (scripts/projection_stock.py)
4. Matching commandes NOR/MTO → matching-commandes (scripts/matching.py)
```

Exécuter ces 4 analyses en parallèle si possible, puis consolider les résultats.

### Script d'orchestration

```bash
python3 .claude/skills/rapport-charge/scripts/rapport_complet.py \
  --data-dir data \
  --date-ref 2026-03-24 \
  --horizon 3
```

Ce script appelle les 4 analyses et produit un JSON consolidé.

---

## 3. Structure du rapport

### EN-TÊTE

```
RAPPORT DE CHARGE — Semaine du [date lundi] au [date vendredi]
Généré le : [date et heure]
Horizon analysé : S+1 ([dates]) | S+2 ([dates]) | S+3 ([dates])
```

---

### BLOC 1 — TABLEAU DE BORD (vue d'ensemble 30 secondes)

Cartes métriques côte à côte :

| Métrique | Valeur | Tendance |
|----------|--------|---------|
| OF à lancer S+1 | N | — |
| OF bloqués | X / N | 🔴 si X > 0 |
| Taux de charge max S+1 | XX% (poste PP_XXX) | 🔴/🟡/✅ |
| Taux de service commandes | XX% | 🔴/🟡/✅ |
| Articles en rupture S+1 | X | 🔴 si X > 0 |

---

### BLOC 2 — CHARGE PAR POSTE ET RECOMMANDATION

(Résultats de charge-hebdo)

Tableau des postes avec taux de charge S+1/S+2/S+3 et code couleur.

**Recommandation d'organisation :**

```
Poste le plus chargé sur S+1 : PP_XXX à XX%

Organisation recommandée :
  S+1 : [1×8 / 2×8 / 3×8]  — Taux max XX%
  S+2 : [1×8 / 2×8 / 3×8]  — Taux max XX%
  S+3 : [1×8 / 2×8 / 3×8]  — Taux max XX%

Points d'attention :
  → [Poste X] : goulot en S+1, envisager heures supplémentaires ou sous-traitance
  → [Poste Y] : sous-chargé, possibilité de redéploiement
```

---

### BLOC 3 — FAISABILITÉ DES OF S+1

(Résultats de faisabilite-of pour tous les OF de la semaine S+1)

**OF bloqués (action requise avant lancement) :**

| OF | Article | Qté | Date fin | Blocage | Action |
|----|---------|-----|----------|---------|--------|
| F426-08419 | BDH1050-75 | 384 | 13/03 | D4521 manquant (568u) | Appro urgente |
| F426-08520 | MH7652 | 200 | 14/03 | Nomenclature absente | Vérification manuelle |

**OF faisables — prêts à lancer :**

| OF | Article | Qté | Date fin | Type |
|----|---------|-----|----------|------|
| F426-07941 | EMM716HU | 2160 | 24/03 | Affermi ✅ |

---

### BLOC 4 — ARTICLES EN TENSION

(Résultats de projection-stock, focus sur ruptures et tensions)

**Ruptures détectées (critique) :**

| Article | Désignation | Stock actuel | Date rupture | Cause | Réception prévue |
|---------|-------------|-------------|-------------|-------|-----------------|
| D4521 | CARTER ALU 150×100 | 200 | S+1 | OF F426-08419 (besoin 768) | Aucune ❌ |

**Articles en tension (surveiller) :**

| Article | Stock S+1 | Stock S+2 | Stock S+3 | Couverture |
|---------|-----------|-----------|-----------|-----------|
| E7368 | 16u | 116u | -84u | 2,1 semaines |

---

### BLOC 5 — COMMANDES CLIENTS À RISQUE

(Résultats de matching-commandes, focus sur non-couvert et partiel)

**Taux de service global : XX% (N/M commandes couvertes)**

**Commandes non couvertes ou partielles :**

| Commande | Client | Article | Qté demandée | Couvert | Manque | Date exp. | Risque |
|----------|--------|---------|-------------|---------|--------|-----------|--------|
| AR2600883 | PARTN-AIR | BDH75 | 200 | 0 | 200 | 01/04 | 🔴 Retard client |

---

### BLOC 6 — ACTIONS PRIORITAIRES

Liste des actions à décider en réunion, triées par urgence :

```
🔴 ACTIONS IMMÉDIATES (avant fin de journée)
  1. Lancer appro D4521 — 568 unités minimum — bloque OF F426-08419 (384 BDH1050-75)
  2. Vérifier nomenclature OF F426-08520 avec le BE

🟡 DÉCISIONS À PRENDRE EN RÉUNION
  3. Organisation S+1 : passer PP_XXX en 2×8 (taux 109%)
  4. Commande AR2600883 (PARTN-AIR, 200u) — reporter ou chercher stock alternatif ?

✅ VALIDATIONS POSSIBLES
  5. Affermir OF F426-07941 (EMM716HU, 2160u) — tous composants disponibles
  6. Affermir OF F426-08002 (MR160, 48u) — stock couvert
```

---

## 4. Présentation des résultats

Produire un **widget interactif multi-sections** avec :
- Onglet "Vue d'ensemble" : Bloc 1 (dashboard)
- Onglet "Charge & Postes" : Bloc 2 + graphique charge
- Onglet "OF & Faisabilité" : Bloc 3
- Onglet "Stock & Tensions" : Bloc 4
- Onglet "Commandes" : Bloc 5
- Onglet "Actions" : Bloc 6 (le plus important pour la réunion)

Si l'interface interactive n'est pas disponible, produire le rapport en Markdown structuré avec tous les blocs.

---

## 5. Gestion des erreurs

Si un des 4 scripts échoue :
- Indiquer clairement quel bloc est indisponible
- Continuer avec les analyses qui ont réussi
- Signaler en haut du rapport : "⚠️ Bloc N indisponible — [raison]"

---

## 6. Cas d'usage courants

**"Prépare la réunion du mardi"**
→ Exécuter le rapport complet sur S+1 à S+3

**"Rapport de charge rapide pour S+1 seulement"**
→ `--horizon 1` — se concentrer sur les actions immédiates

**"Est-ce qu'on peut faire du 2×8 la semaine prochaine ?"**
→ Exécuter charge-hebdo sur S+1, afficher la recommandation du Bloc 2

**"Quels OF peut-on lancer cette semaine ?"**
→ Exécuter faisabilite-of sur tous les OF S+1, retourner le Bloc 3
